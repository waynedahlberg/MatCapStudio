import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(path.join(root, "src/lib/matcap.ts"), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { PRESETS, renderMatcapPixels, settingsForPreset } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const outputDir = path.join(root, "public/procedural");
mkdirSync(outputDir, { recursive: true });

for (const preset of PRESETS) {
  const settings = settingsForPreset(preset);
  for (const [size, suffix] of [[512, ""], [128, "-thumb"]]) {
    const pixels = renderMatcapPixels(settings, null, size);
    await sharp(pixels, { raw: { width: size, height: size, channels: 4 } })
      .png().toFile(path.join(outputDir, `${preset.id}${suffix}.png`));
  }
  console.log(`Generated ${preset.label}`);
}
