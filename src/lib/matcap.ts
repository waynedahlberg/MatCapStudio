export type MatcapMode = "studio" | "zebra" | "normals" | "image";
export type ImageMapping = "reflection" | "matcap";

export type MatcapSettings = {
  name: string;
  mode: MatcapMode;
  baseColor: string;
  rimColor: string;
  highlightColor: string;
  keyColor: string;
  fillColor: string;
  lightX: number;
  lightY: number;
  fillX: number;
  fillY: number;
  brightness: number;
  fillIntensity: number;
  baseIntensity: number;
  specularIntensity: number;
  ambient: number;
  glossiness: number;
  highlightSize: number;
  rimStrength: number;
  rimSharpness: number;
  bands: number;
  stripeSoftness: number;
  stripeAngle: number;
  stripeA: string;
  stripeB: string;
  imageMapping: ImageMapping;
  imageInfluence: number;
  dither: boolean;
};

export const DEFAULT_SETTINGS: MatcapSettings = {
  name: "Silver Studio",
  mode: "studio",
  baseColor: "#9aaab5",
  rimColor: "#d9edf1",
  highlightColor: "#ffffff",
  keyColor: "#ffffff",
  fillColor: "#bed8e0",
  lightX: -0.5,
  lightY: 0.6,
  fillX: 0.5,
  fillY: -0.3,
  brightness: 0.9,
  fillIntensity: 0.35,
  baseIntensity: 1,
  specularIntensity: 0.78,
  ambient: 0.39,
  glossiness: 0.67,
  highlightSize: 0.32,
  rimStrength: 0.46,
  rimSharpness: 2.4,
  bands: 9,
  stripeSoftness: 0.13,
  stripeAngle: 0,
  stripeA: "#e8e7e2",
  stripeB: "#222931",
  imageMapping: "reflection",
  imageInfluence: 0.85,
  dither: true,
};

export type Preset = { id: string; label: string; category: string; settings: Partial<MatcapSettings> };

export const PRESETS: Preset[] = [
  { id: "silver", label: "Silver Studio", category: "STUDIO", settings: {} },
  { id: "graphite", label: "Graphite", category: "STUDIO", settings: { name: "Graphite", baseColor: "#626b72", rimColor: "#b0b9be", highlightColor: "#f3f3eb", ambient: 0.31, glossiness: 0.83, rimStrength: 0.39 } },
  { id: "porcelain", label: "Porcelain", category: "CLAY", settings: { name: "Porcelain", baseColor: "#d9d3c8", rimColor: "#f4f1e9", highlightColor: "#fffefa", ambient: 0.5, glossiness: 0.34, highlightSize: 0.62, rimStrength: 0.28 } },
  { id: "cobalt", label: "Cobalt Satin", category: "SATIN", settings: { name: "Cobalt Satin", baseColor: "#48657a", rimColor: "#93adb9", highlightColor: "#dcecf2", ambient: 0.4, glossiness: 0.45, highlightSize: 0.54 } },
  { id: "copper", label: "Copper Rose", category: "METAL", settings: { name: "Copper Rose", baseColor: "#a7817e", rimColor: "#e6c4b7", highlightColor: "#fff0dc", ambient: 0.35, glossiness: 0.74, rimStrength: 0.52 } },
  { id: "crimson", label: "Crimson Gloss", category: "GLOSS", settings: { name: "Crimson Gloss", baseColor: "#ba3441", rimColor: "#b0cbd6", highlightColor: "#fffaf8", keyColor: "#ffffff", fillColor: "#f6c9d1", brightness: 1.2, fillIntensity: 0.28, ambient: 0.35, glossiness: 0.88, specularIntensity: 1.15, highlightSize: 0.22, rimStrength: 0.55 } },
  { id: "violet", label: "Violet Edge", category: "COLOUR", settings: { name: "Violet Edge", baseColor: "#a46ab2", rimColor: "#f42991", highlightColor: "#fff6f7", keyColor: "#f4e8f0", fillColor: "#b7b1ee", brightness: 1.06, fillIntensity: 0.38, ambient: 0.42, glossiness: 0.76, rimStrength: 0.9, rimSharpness: 3.3 } },
  { id: "zebra", label: "Zebra / Mono", category: "ANALYSIS", settings: { name: "Zebra / Mono", mode: "zebra", bands: 9, stripeA: "#f1f1ec", stripeB: "#182127" } },
  { id: "red-zebra", label: "Zebra / Red", category: "ANALYSIS", settings: { name: "Zebra / Red", mode: "zebra", bands: 9, stripeA: "#e1e1dc", stripeB: "#a53e42" } },
  { id: "normals", label: "Surface Normals", category: "ANALYSIS", settings: { name: "Surface Normals", mode: "normals" } },
];

export function settingsForPreset(preset: Preset): MatcapSettings {
  return { ...DEFAULT_SETTINGS, ...preset.settings };
}

type RGB = [number, number, number];

function rgb(hex: string): RGB {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) || 0) as RGB;
}

function mix(a: number, b: number, t: number) { return a + (b - a) * t; }
function clamp(v: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, v)); }
function smooth(a: number, b: number, x: number) {
  const t = clamp((x - a) / Math.max(0.0001, b - a));
  return t * t * (3 - 2 * t);
}
function normalize(x: number, y: number, z: number): [number, number, number] {
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}

function sampleImage(data: ImageData, u: number, v: number): RGB {
  const x = clamp(u) * (data.width - 1);
  const y = clamp(v) * (data.height - 1);
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, data.width - 1), y1 = Math.min(y0 + 1, data.height - 1);
  const tx = x - x0, ty = y - y0;
  const at = (px: number, py: number, c: number) => data.data[(py * data.width + px) * 4 + c];
  return [0, 1, 2].map((c) => mix(mix(at(x0, y0, c), at(x1, y0, c), tx), mix(at(x0, y1, c), at(x1, y1, c), tx), ty)) as RGB;
}

function averageImageRim(data: ImageData): RGB {
  const total: RGB = [0, 0, 0];
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI * 2 / 32;
    const sample = sampleImage(data, 0.5 + Math.cos(angle) * 0.475, 0.5 - Math.sin(angle) * 0.475);
    for (let channel = 0; channel < 3; channel++) total[channel] += sample[channel] / 32;
  }
  return total;
}

/** Draws a square, opaque sRGB matcap. The lookup disk is radius 0.495, matching Viewpoint. */
export function generateMatcap(settings: MatcapSettings, source?: ImageData | null, size = 512): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;
  const output = ctx.createImageData(size, size);
  const base = rgb(settings.baseColor), rim = rgb(settings.rimColor), hi = rgb(settings.highlightColor);
  const key = rgb(settings.keyColor), fill = rgb(settings.fillColor);
  const stripeA = rgb(settings.stripeA), stripeB = rgb(settings.stripeB);
  const [lx, ly, lz] = normalize(settings.lightX, settings.lightY, 0.65);
  const [fx, fy, fz] = normalize(settings.fillX, settings.fillY, 0.65);
  const angle = settings.stripeAngle * Math.PI / 180;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const radius = size * 0.495;
  const sourceRim = source ? averageImageRim(source) : rim;

  for (let y = 0; y < size; y++) {
    const ny = -(y + 0.5 - size / 2) / radius;
    for (let x = 0; x < size; x++) {
      const nx = (x + 0.5 - size / 2) / radius;
      const r2 = nx * nx + ny * ny;
      const offset = (y * size + x) * 4;
      const inside = r2 <= 1;
      const nz = inside ? Math.sqrt(Math.max(0, 1 - r2)) : 0;
      let color: RGB = [...(settings.mode === "image" && source ? sourceRim : rim)];

      if (inside) {
        if (settings.mode === "normals") {
          color = [(nx + 1) * 127.5, (ny + 1) * 127.5, nz * 255];
        } else if (settings.mode === "zebra") {
          // r = 2(n·v)n − v, where v points from the surface toward the camera.
          const rx = 2 * nz * nx, ry = 2 * nz * ny;
          const axis = clamp((rx * sa + ry * ca + 1) / 2);
          const phase = axis * settings.bands;
          const wave = Math.cos(phase * Math.PI * 2);
          const width = Math.max(0.002, settings.stripeSoftness * 2);
          const t = smooth(-width, width, wave);
          const form = 0.92 + 0.08 * nz;
          color = [0, 1, 2].map((c) => mix(stripeB[c], stripeA[c], t) * form) as RGB;
        } else if (settings.mode === "image" && source) {
          if (settings.imageMapping === "matcap") {
            color = sampleImage(source, (nx + 1) / 2, (1 - ny) / 2);
          } else {
            const rx = 2 * nz * nx, ry = 2 * nz * ny;
            const sampled = sampleImage(source, (rx + 1) / 2, (1 - ry) / 2);
            const diffuse = settings.ambient + Math.max(0, nx * lx + ny * ly + nz * lz) * settings.brightness * 0.57;
            color = [0, 1, 2].map((c) => mix(base[c] * diffuse, sampled[c], settings.imageInfluence)) as RGB;
          }
        } else {
          const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
          const fillDiffuse = Math.max(0, nx * fx + ny * fy + nz * fz);
          const half = normalize(lx, ly, lz + 1);
          const spec = Math.pow(Math.max(0, nx * half[0] + ny * half[1] + nz * half[2]), mix(7, 110, settings.glossiness) * mix(1.5, 0.6, settings.highlightSize));
          const secondary = Math.pow(Math.max(0, nx * -0.42 + ny * -0.3 + nz * 0.86), 18) * 0.085;
          const edge = Math.pow(1 - nz, settings.rimSharpness) * settings.rimStrength;
          color = [0, 1, 2].map((c) => {
            const shade = settings.ambient + diffuse * settings.brightness * 0.62 * key[c] / 255
              + fillDiffuse * settings.fillIntensity * 0.37 * fill[c] / 255 + secondary;
            const body = base[c] * settings.baseIntensity * shade;
            const withRim = mix(body, rim[c], edge);
            return mix(withRim, hi[c], clamp(spec * settings.specularIntensity * mix(0.18, 0.86, settings.glossiness)));
          }) as RGB;
        }
      }
      // Ordered dithering reduces visible steps in 8-bit studio gradients.
      const dither = settings.dither && settings.mode === "studio" ? (((x & 3) * 5 + (y & 3) * 3) % 16 - 7.5) / 16 : 0;
      output.data[offset] = clamp(Math.round(color[0] + dither), 0, 255);
      output.data[offset + 1] = clamp(Math.round(color[1] + dither), 0, 255);
      output.data[offset + 2] = clamp(Math.round(color[2] + dither), 0, 255);
      output.data[offset + 3] = 255;
    }
  }
  ctx.putImageData(output, 0, 0);
  return canvas;
}

export function fileName(name: string) {
  return (name.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "matcap") + ".png";
}
