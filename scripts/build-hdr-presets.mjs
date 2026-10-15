import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { DataTexture, FloatType, RGBAFormat } from "three";
import { HDRLoader } from "three/addons/loaders/HDRLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";
import { EXRExporter, ZIP_COMPRESSION } from "three/addons/exporters/EXRExporter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const presets = JSON.parse(readFileSync(path.join(root, "src/lib/hdr-presets.json"), "utf8"));
const outputDir = path.join(root, "public/exr/generated");
mkdirSync(outputDir, { recursive: true });

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const srgb = (linear) => {
  const value = Math.max(0, linear);
  const mapped = value / (1 + value);
  return Math.round(clamp((mapped <= 0.0031308 ? mapped * 12.92 : 1.055 * mapped ** (1 / 2.4) - 0.055) * 255, 0, 255));
};

function samplePanorama(image, u, v, channel) {
  const { width, height, data } = image;
  const x = ((u % 1 + 1) % 1) * width - 0.5;
  const y = clamp(v * height - 0.5, 0, height - 1);
  const x0 = ((Math.floor(x) % width) + width) % width;
  const x1 = (x0 + 1) % width;
  const y0 = Math.floor(y), y1 = Math.min(y0 + 1, height - 1);
  const tx = x - Math.floor(x), ty = y - y0;
  const at = (px, py) => data[((image.bottomUp ? height - 1 - py : py) * width + px) * 4 + channel];
  return (at(x0, y0) * (1 - tx) + at(x1, y0) * tx) * (1 - ty)
    + (at(x0, y1) * (1 - tx) + at(x1, y1) * tx) * ty;
}

function downsample(image, width = 1024, height = 512) {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const v = (height - y - 0.5) / height; // DataTexture / EXR rows are bottom-up.
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel++) data[offset + channel] = samplePanorama(image, (x + 0.5) / width, v, channel);
      data[offset + 3] = 1;
    }
  }
  return { width, height, data, bottomUp: true };
}

function matcapPixels(panorama, size, thumbnail = false) {
  const output = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let nx = (x + 0.5 - size / 2) / (size * 0.495);
    let ny = -(y + 0.5 - size / 2) / (size * 0.495);
    const r2 = nx * nx + ny * ny;
    const offset = (y * size + x) * 4;
    if (r2 <= 1 || !thumbnail) {
      if (r2 > 1) { const scale = 0.999 / Math.sqrt(r2); nx *= scale; ny *= scale; }
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const rx = 2 * nz * nx, ry = 2 * nz * ny, rz = 2 * nz * nz - 1;
      const u = 0.5 + Math.atan2(rx, rz) / (2 * Math.PI);
      const v = 0.5 - Math.asin(clamp(ry, -1, 1)) / Math.PI;
      for (let channel = 0; channel < 3; channel++) output[offset + channel] = srgb(samplePanorama(panorama, u, v, channel));
    } else {
      output[offset] = 42; output[offset + 1] = 52; output[offset + 2] = 57;
    }
    output[offset + 3] = 255;
  }
  return output;
}

for (const preset of presets) {
  const inputPath = path.join(root, "public/exr", preset.file);
  console.log(`Processing ${preset.label}...`);
  {
    const raw = readFileSync(inputPath);
    const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
    const isExr = path.extname(preset.file).toLowerCase() === ".exr";
    const image = isExr
      ? new EXRLoader().setDataType(FloatType).parse(buffer)
      : new HDRLoader().setDataType(FloatType).parse(buffer);
    if (!(image.data instanceof Float32Array) || image.width < 2 || image.height < 2) throw new Error(`Invalid HDR image: ${preset.file}`);
    image.bottomUp = isExr;
    const small = downsample(image);
    const texture = new DataTexture(small.data, small.width, small.height, RGBAFormat, FloatType);
    const exr = await new EXRExporter().parse(texture, { type: FloatType, compression: ZIP_COMPRESSION });
    writeFileSync(path.join(outputDir, `${preset.id}.exr`), exr);
    await sharp(matcapPixels(small, 128, true), { raw: { width: 128, height: 128, channels: 4 } })
      .png().toFile(path.join(outputDir, `${preset.id}.png`));
    await sharp(matcapPixels(small, 512), { raw: { width: 512, height: 512, channels: 4 } })
      .png().toFile(path.join(outputDir, `${preset.id}-matcap.png`));
    texture.dispose();
    console.log(`  ${small.width}×${small.height} EXR: ${(exr.byteLength / 1024 / 1024).toFixed(1)} MB`);
  }
  global.gc?.();
}
