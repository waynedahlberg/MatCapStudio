import { FloatType } from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";

export type HdrImage = { width: number; height: number; data: Float32Array; bottomUp: boolean };

/** Decode an uploaded EXR without sending it to a server or GPU. */
export function decodeExr(buffer: ArrayBuffer): HdrImage {
  const texture = new EXRLoader().setDataType(FloatType).createDataTexture(buffer);
  const { width, height, data } = texture.image;
  texture.dispose();
  if (!(data instanceof Float32Array) || !width || !height || width * height > 16_777_216) {
    throw new Error("Unsupported EXR image");
  }
  return { width, height, data, bottomUp: true };
}

/** Radiance HDR files are equirectangular images with top-down pixel rows. */
export function decodeRadianceHdr(buffer: ArrayBuffer): HdrImage {
  const { width, height, data } = new HDRLoader().setDataType(FloatType).parse(buffer);
  if (!(data instanceof Float32Array) || !width || !height || width * height > 33_554_432) {
    throw new Error("Unsupported HDR image");
  }
  return { width, height, data, bottomUp: false };
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function toneMap(linear: number, exposure: number) {
  const value = Math.max(0, linear * exposure);
  const mapped = Number.isNaN(value) ? 0 : Number.isFinite(value) ? value / (1 + value) : 1;
  const srgb = mapped <= 0.0031308 ? mapped * 12.92 : 1.055 * mapped ** (1 / 2.4) - 0.055;
  return Math.round(clamp(srgb, 0, 1) * 255);
}

function pixel(image: HdrImage, x: number, y: number, channel: number) {
  return image.data[((image.bottomUp ? image.height - 1 - y : y) * image.width + x) * 4 + channel];
}

/** Convert scene-linear HDR values to opaque sRGB pixels for Viewpoint's PNG matcaps. */
export function hdrToSrgbPixels(image: HdrImage, exposureEV: number, size = 512): Uint8ClampedArray<ArrayBuffer> {
  const { width, height } = image;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const crop = Math.min(width, height);
  const left = (width - crop) / 2;
  const top = (height - crop) / 2;
  const exposure = 2 ** exposureEV;

  for (let y = 0; y < size; y++) {
    const sourceY = clamp(top + (y + 0.5) * crop / size - 0.5, 0, height - 1);
    const y0 = Math.floor(sourceY), y1 = Math.min(y0 + 1, height - 1), ty = sourceY - y0;
    for (let x = 0; x < size; x++) {
      const sourceX = clamp(left + (x + 0.5) * crop / size - 0.5, 0, width - 1);
      const x0 = Math.floor(sourceX), x1 = Math.min(x0 + 1, width - 1), tx = sourceX - x0;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const upper = pixel(image, x0, y0, channel) * (1 - tx) + pixel(image, x1, y0, channel) * tx;
        const lower = pixel(image, x0, y1, channel) * (1 - tx) + pixel(image, x1, y1, channel) * tx;
        pixels[offset + channel] = toneMap(upper * (1 - ty) + lower * ty, exposure);
      }
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}

function samplePanorama(image: HdrImage, u: number, v: number, channel: number) {
  const x = ((u % 1 + 1) % 1) * image.width - 0.5;
  const y = clamp(v * image.height - 0.5, 0, image.height - 1);
  const x0 = ((Math.floor(x) % image.width) + image.width) % image.width;
  const x1 = (x0 + 1) % image.width;
  const y0 = Math.floor(y), y1 = Math.min(y0 + 1, image.height - 1);
  const tx = x - Math.floor(x), ty = y - y0;
  const upper = pixel(image, x0, y0, channel) * (1 - tx) + pixel(image, x1, y0, channel) * tx;
  const lower = pixel(image, x0, y1, channel) * (1 - tx) + pixel(image, x1, y1, channel) * tx;
  return upper * (1 - ty) + lower * ty;
}

/** Keep large uploaded panoramas editable without retaining hundreds of MB of decoded pixels. */
export function downsampleEnvironment(image: HdrImage, width = 1024, height = 512): HdrImage {
  if (image.width <= width && image.height <= height) return image;
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = (y * width + x) * 4;
    for (let channel = 0; channel < 3; channel++) data[offset + channel] = samplePanorama(image, (x + 0.5) / width, (y + 0.5) / height, channel);
    data[offset + 3] = 1;
  }
  return { width, height, data, bottomUp: false };
}

/** Bake an equirectangular HDR environment into a camera-facing reflection matcap. */
export function environmentToSrgbPixels(image: HdrImage, exposureEV: number, rotationDegrees: number, size = 512): Uint8ClampedArray<ArrayBuffer> {
  const pixels = new Uint8ClampedArray(size * size * 4);
  const exposure = 2 ** exposureEV;
  const rotation = rotationDegrees / 360;
  const radius = size * 0.495;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let nx = (x + 0.5 - size / 2) / radius;
    let ny = -(y + 0.5 - size / 2) / radius;
    const r2 = nx * nx + ny * ny;
    if (r2 > 1) { const scale = 0.999 / Math.sqrt(r2); nx *= scale; ny *= scale; }
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    const rx = 2 * nz * nx, ry = 2 * nz * ny, rz = 2 * nz * nz - 1;
    const u = 0.5 + Math.atan2(rx, rz) / (2 * Math.PI) + rotation;
    const v = 0.5 - Math.asin(clamp(ry, -1, 1)) / Math.PI;
    const offset = (y * size + x) * 4;
    for (let channel = 0; channel < 3; channel++) pixels[offset + channel] = toneMap(samplePanorama(image, u, v, channel), exposure);
    pixels[offset + 3] = 255;
  }
  return pixels;
}

/** Soften HDR reflections in image space. The output remains an opaque matcap. */
export function finishHdrPixels(
  pixels: Uint8ClampedArray<ArrayBuffer>, width: number, height: number, blurPixels: number, frost: number,
): Uint8ClampedArray<ArrayBuffer> {
  const radius = Math.max(0, Math.min(64, Math.round(blurPixels + frost * 14)));
  const diffusion = Math.max(0, Math.min(1, frost)) * 0.58;
  if (radius === 0 && diffusion === 0) return pixels;

  const output = new Uint8ClampedArray(pixels);
  if (radius > 0) {
    const horizontal = new Float32Array(width * height * 3);
    const span = radius * 2 + 1;
    for (let y = 0; y < height; y++) for (let channel = 0; channel < 3; channel++) {
      let sum = 0;
      for (let step = -radius; step <= radius; step++) {
        sum += pixels[(y * width + Math.max(0, Math.min(width - 1, step))) * 4 + channel];
      }
      for (let x = 0; x < width; x++) {
        horizontal[(y * width + x) * 3 + channel] = sum / span;
        const next = Math.min(width - 1, x + radius + 1);
        const previous = Math.max(0, x - radius);
        sum += pixels[(y * width + next) * 4 + channel] - pixels[(y * width + previous) * 4 + channel];
      }
    }
    for (let x = 0; x < width; x++) for (let channel = 0; channel < 3; channel++) {
      let sum = 0;
      for (let step = -radius; step <= radius; step++) {
        sum += horizontal[(Math.max(0, Math.min(height - 1, step)) * width + x) * 3 + channel];
      }
      for (let y = 0; y < height; y++) {
        output[(y * width + x) * 4 + channel] = sum / span;
        const next = Math.min(height - 1, y + radius + 1);
        const previous = Math.max(0, y - radius);
        sum += horizontal[(next * width + x) * 3 + channel] - horizontal[(previous * width + x) * 3 + channel];
      }
    }
  }

  if (diffusion > 0) {
    const average = [0, 0, 0];
    for (let i = 0; i < output.length; i += 4) for (let channel = 0; channel < 3; channel++) average[channel] += output[i + channel];
    const count = width * height;
    const diffuse = average.map((value) => value / count * 0.72 + 255 * 0.28);
    for (let i = 0; i < output.length; i += 4) for (let channel = 0; channel < 3; channel++) {
      output[i + channel] = output[i + channel] * (1 - diffusion) + diffuse[channel] * diffusion;
    }
  }
  return output;
}
