import { FloatType } from "three";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

export type ExrImage = { width: number; height: number; data: Float32Array };

/** Decode an uploaded EXR without sending it to a server or GPU. */
export function decodeExr(buffer: ArrayBuffer): ExrImage {
  const texture = new EXRLoader().setDataType(FloatType).createDataTexture(buffer);
  const { width, height, data } = texture.image;
  texture.dispose();
  if (!(data instanceof Float32Array) || !width || !height || width * height > 16_777_216) {
    throw new Error("Unsupported EXR image");
  }
  return { width, height, data };
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

/** Convert scene-linear HDR values to opaque sRGB pixels for Viewpoint's PNG matcaps. */
export function exrToSrgbPixels(image: ExrImage, exposureEV: number, size = 512): Uint8ClampedArray<ArrayBuffer> {
  const { width, height, data } = image;
  const pixels = new Uint8ClampedArray(size * size * 4);
  const crop = Math.min(width, height);
  const left = (width - crop) / 2;
  const top = (height - crop) / 2;
  const exposure = 2 ** exposureEV;
  const at = (x: number, y: number, channel: number) => {
    // EXRLoader returns rows bottom-up; ImageData expects its first row at the top.
    return data[((height - 1 - y) * width + x) * 4 + channel];
  };

  for (let y = 0; y < size; y++) {
    const sourceY = clamp(top + (y + 0.5) * crop / size - 0.5, 0, height - 1);
    const y0 = Math.floor(sourceY), y1 = Math.min(y0 + 1, height - 1), ty = sourceY - y0;
    for (let x = 0; x < size; x++) {
      const sourceX = clamp(left + (x + 0.5) * crop / size - 0.5, 0, width - 1);
      const x0 = Math.floor(sourceX), x1 = Math.min(x0 + 1, width - 1), tx = sourceX - x0;
      const offset = (y * size + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        const upper = at(x0, y0, channel) * (1 - tx) + at(x1, y0, channel) * tx;
        const lower = at(x0, y1, channel) * (1 - tx) + at(x1, y1, channel) * tx;
        const linear = Math.max(0, (upper * (1 - ty) + lower * ty) * exposure);
        const mapped = Number.isFinite(linear) ? linear / (1 + linear) : 1;
        const srgb = mapped <= 0.0031308 ? mapped * 12.92 : 1.055 * mapped ** (1 / 2.4) - 0.055;
        pixels[offset + channel] = Math.round(clamp(srgb, 0, 1) * 255);
      }
      pixels[offset + 3] = 255;
    }
  }
  return pixels;
}
