"use client";

import dynamic from "next/dynamic";
import { ChangeEvent, DragEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine, Box, Check, ChevronDown, CircleHelp, Focus, Grip,
  ImagePlus, Layers2, Maximize2, MoreHorizontal, RotateCcw, SlidersHorizontal,
  Sparkles, UploadCloud, X,
} from "lucide-react";
import {
  DEFAULT_SETTINGS, generateMatcap, MatcapSettings, PRESETS, Preset,
  fileName, settingsForPreset,
} from "@/lib/matcap";
import { decodeExr, exrToSrgbPixels, type ExrImage } from "@/lib/exr";
import type { PreviewShape } from "./Preview";

const Preview = dynamic(() => import("./Preview"), { ssr: false });
type Panel = "surface" | "zebra" | "image";

function RangeControl({ label, value, min, max, step = 0.01, suffix = "", onChange, description }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string;
  onChange: (n: number) => void; description?: string;
}) {
  const percent = ((value - min) / (max - min)) * 100;
  const display = suffix === "°" ? Math.round(value) : suffix === "%" ? Math.round(value * 100) : Number.isInteger(value) ? value : value.toFixed(2);
  return (
    <label className="range-control">
      <span className="control-head"><span>{label}</span><span className="range-value">{display}{suffix}</span></span>
      {description && <span className="control-description">{description}</span>}
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ "--range-percent": `${percent}%` } as React.CSSProperties} />
    </label>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <label className="color-control"><span className="color-left"><span className="swatch" style={{ background: value }} />{label}</span><span className="color-right"><span>{value.toUpperCase()}</span><input type="color" value={value} onChange={(e) => onChange(e.target.value)} aria-label={`${label} color`} /></span></label>;
}

function PresetCard({ preset, selected, onClick }: { preset: Preset; selected: boolean; onClick: () => void }) {
  const [url, setUrl] = useState("");
  useEffect(() => { setUrl(generateMatcap(settingsForPreset(preset), null, 128).toDataURL("image/png")); }, [preset]);
  return (
    <button className={`preset-card ${selected ? "selected" : ""}`} onClick={onClick} title={`Load ${preset.label}`}>
      <span className="preset-visual">{url && <img src={url} alt="" />}</span>
      <span className="preset-label">{preset.label}</span>
      <span className="preset-category">{preset.category}</span>
      {selected && <span className="preset-check"><Check size={11} strokeWidth={3} /></span>}
    </button>
  );
}

function readImage(file: File): Promise<{ pixels: ImageData; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Canvas is unavailable")); return; }
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 512, 512);
      const pixels = ctx.getImageData(0, 0, 512, 512);
      URL.revokeObjectURL(url);
      resolve({ pixels, url: canvas.toDataURL("image/png") });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
    img.src = url;
  });
}

function readFileDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read source file"));
    reader.readAsDataURL(file);
  });
}

export default function Studio() {
  const [settings, setSettings] = useState<MatcapSettings>(DEFAULT_SETTINGS);
  const [activePreset, setActivePreset] = useState("silver");
  const [panel, setPanel] = useState<Panel>("surface");
  const [source, setSource] = useState<ImageData | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [exrData, setExrData] = useState<ExrImage | null>(null);
  const [exrFile, setExrFile] = useState<File | null>(null);
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [shape, setShape] = useState<PreviewShape>("Suzanne");
  const [previewSize, setPreviewSize] = useState(160);
  const [wireframe, setWireframe] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState(512);
  const [notice, setNotice] = useState("");
  const [autoSaved, setAutoSaved] = useState(true);
  const uploadRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("matcap-studio:v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        if (parsed.activePreset) setActivePreset(parsed.activePreset);
        if (parsed.panel) setPanel(parsed.panel);
        if (["Suzanne", "Sculpt", "Torus"].includes(parsed.shape)) setShape(parsed.shape);
        if (typeof parsed.previewSize === "number") setPreviewSize(Math.max(110, Math.min(220, parsed.previewSize)));
        if (parsed.sourceUrl) {
          const img = new Image();
          img.onload = () => {
            const c = document.createElement("canvas"); c.width = c.height = 512;
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) { ctx.drawImage(img, 0, 0, 512, 512); setSource(ctx.getImageData(0, 0, 512, 512)); }
          };
          img.src = parsed.sourceUrl;
          setSourceUrl(parsed.sourceUrl);
          setSourceName(parsed.sourceName || "Imported image");
        }
      }
    } catch { /* A private browsing session may not allow local storage. */ }
  }, []);

  useEffect(() => {
    try { localStorage.setItem("matcap-studio:v1", JSON.stringify({ settings, activePreset, panel, sourceUrl, sourceName, shape, previewSize })); setAutoSaved(true); }
    catch { setAutoSaved(false); }
  }, [settings, activePreset, panel, sourceUrl, sourceName, shape, previewSize]);

  useEffect(() => { setCanvas(generateMatcap(settings, source)); }, [settings, source]);
  useEffect(() => {
    if (!exrData) return;
    const pixels = new ImageData(exrToSrgbPixels(exrData, settings.exrExposure), 512, 512);
    const preview = document.createElement("canvas");
    preview.width = preview.height = 512;
    preview.getContext("2d")?.putImageData(pixels, 0, 0);
    setSource(pixels);
    setSourceUrl(preview.toDataURL("image/png"));
  }, [exrData, settings.exrExposure]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const imageReady = Boolean(source);
  const previewUrl = useMemo(() => canvas?.toDataURL("image/png") || "", [canvas]);
  const update = <K extends keyof MatcapSettings>(key: K, value: MatcapSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setActivePreset("custom");
  };
  const choosePanel = (next: Panel) => {
    setPanel(next);
    if (next === "surface") update("mode", "studio");
    if (next === "zebra") update("mode", "zebra");
    if (next === "image") update("mode", "image");
  };
  const choosePreset = (preset: Preset) => {
    setSettings(settingsForPreset(preset));
    setActivePreset(preset.id);
    setPanel(preset.settings.mode === "zebra" ? "zebra" : "surface");
    setNotice(`${preset.label} loaded`);
  };
  const upload = async (file?: File) => {
    if (!file) return;
    const isExr = /\.exr$/i.test(file.name) || ["image/x-exr", "image/aces"].includes(file.type);
    if (!isExr && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setNotice("Choose an EXR, PNG, JPEG, or WebP image"); return; }
    if (file.size > (isExr ? 50 : 20) * 1024 * 1024) { setNotice(`Choose a source smaller than ${isExr ? 50 : 20} MB`); return; }
    try {
      if (isExr) {
        const decoded = decodeExr(await file.arrayBuffer());
        setExrData(decoded);
        setExrFile(file);
        setSource(null);
        setSourceUrl("");
      } else {
        const result = await readImage(file);
        setExrData(null);
        setExrFile(null);
        setSource(result.pixels);
        setSourceUrl(result.url);
      }
      setSourceName(file.name);
      setPanel("image");
      setSettings((current) => ({ ...current, mode: "image", imageMapping: isExr ? "matcap" : current.imageMapping, name: file.name.replace(/\.[^.]+$/, "") || "Imported Matcap" }));
      setActivePreset("custom");
      setNotice(isExr ? "EXR ready · adjust exposure in Image settings" : "Image ready for matcap processing");
    } catch { setNotice("The image could not be opened"); }
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files[0]);
  };
  const exportPng = () => {
    const result = size === 512 && canvas ? canvas : generateMatcap(settings, source, size);
    result.toBlob((blob) => {
      if (!blob) { setNotice("Could not create PNG"); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = fileName(settings.name); a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Exported ${size} px PNG · ${Math.round(blob.size / 1024)} KB`);
    }, "image/png");
  };
  const exportProject = async () => {
    try {
      const sourceExrDataUrl = exrFile ? await readFileDataUrl(exrFile) : undefined;
      const blob = new Blob([JSON.stringify({ version: 1, settings, sourceUrl, sourceName, sourceExrDataUrl }, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url; a.download = fileName(settings.name).replace(/\.png$/, ".matcap.json"); a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("Project saved to your computer");
    } catch { setNotice("Could not save project"); }
  };
  const importProject = async (file?: File) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.version !== 1 || !data.settings) throw new Error("Invalid project");
      let restoredExr: ExrImage | null = null;
      let restoredExrFile: File | null = null;
      if (data.sourceExrDataUrl) {
        if (typeof data.sourceExrDataUrl !== "string" || !/^data:[^,]*;base64,/i.test(data.sourceExrDataUrl) || data.sourceExrDataUrl.length > 75_000_000) throw new Error("Invalid EXR source");
        const buffer = await (await fetch(data.sourceExrDataUrl)).arrayBuffer();
        if (buffer.byteLength > 50 * 1024 * 1024) throw new Error("EXR source is too large");
        restoredExr = decodeExr(buffer);
        restoredExrFile = new File([buffer], data.sourceName || "source.exr", { type: "image/x-exr" });
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      setActivePreset("custom");
      const nextPanel = data.settings.mode === "zebra" ? "zebra" : data.settings.mode === "image" ? "image" : "surface";
      setPanel(nextPanel);
      setExrData(restoredExr);
      setExrFile(restoredExrFile);
      if (restoredExr) {
        setSource(null);
        setSourceUrl("");
        setSourceName(data.sourceName || "source.exr");
      } else if (data.sourceUrl) {
        const img = new Image();
        img.onload = () => {
          const c = document.createElement("canvas"); c.width = c.height = 512;
          const ctx = c.getContext("2d", { willReadFrequently: true });
          if (ctx) { ctx.drawImage(img, 0, 0, 512, 512); setSource(ctx.getImageData(0, 0, 512, 512)); }
        };
        img.src = data.sourceUrl;
        setSourceUrl(data.sourceUrl);
        setSourceName(data.sourceName || "Imported image");
      } else { setSource(null); setSourceUrl(""); setSourceName(""); }
      setNotice("Project opened");
    } catch { setNotice("This project file is not valid"); }
  };
  const reset = () => { setSettings(DEFAULT_SETTINGS); setActivePreset("silver"); setPanel("surface"); setSource(null); setSourceUrl(""); setSourceName(""); setExrData(null); setExrFile(null); setNotice("Studio reset"); };

  return (
    <main className="studio-shell" onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
      <input ref={uploadRef} className="sr-only" type="file" accept=".exr,image/x-exr,image/png,image/jpeg,image/webp" onChange={(e: ChangeEvent<HTMLInputElement>) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
      <input ref={projectRef} className="sr-only" type="file" accept=".json,application/json" onChange={(e) => { void importProject(e.target.files?.[0]); e.target.value = ""; }} />
      <header className="topbar">
        <div className="brand"><span className="brand-mark"><span /></span><span className="brand-name">MATCAP<span>STUDIO</span></span><span className="brand-beta">BETA</span></div>
        <div className="topbar-path"><span>WORKSPACE</span><span className="path-divider">/</span><strong>{settings.name}</strong><ChevronDown size={13} /></div>
        <div className="topbar-actions">
          <button className="icon-button help-button" title="Matcap tips" onClick={() => setNotice("Drag to orbit · scroll to zoom · export a 512 px PNG for Viewpoint")}><CircleHelp size={17} /></button>
          <span className="topbar-separator" />
          <button className="quiet-button" onClick={() => projectRef.current?.click()}>Open project</button>
          <button className="quiet-button" onClick={exportProject}>Save project</button>
          <button className="primary-button" onClick={exportPng}><ArrowDownToLine size={15} /> Export PNG</button>
        </div>
      </header>

      <div className="workspace">
        <aside className="library-panel">
          <div className="panel-intro"><div className="overline">YOUR WORKSPACE <span className="tiny-dot" /></div><h1>Material library</h1><p>Choose a starting point, then shape the light to fit your model.</p></div>
          <div className="library-heading"><span>PRESETS <span className="count">{PRESETS.length.toString().padStart(2, "0")}</span></span><MoreHorizontal size={16} /></div>
          <div className="preset-grid">{PRESETS.map((preset) => <PresetCard key={preset.id} preset={preset} selected={activePreset === preset.id} onClick={() => choosePreset(preset)} />)}</div>
          <div className="library-bottom">
            <div className="divider-heading">IMPORT SOURCE</div>
            {imageReady ? <div className="imported-file"><img src={sourceUrl} alt="Imported source" /><div><strong>{sourceName}</strong><span>LOCAL IMAGE · READY</span></div><button title="Remove source" onClick={() => { setSource(null); setSourceUrl(""); setSourceName(""); setExrData(null); setExrFile(null); if (settings.mode === "image") setSettings((s) => ({ ...s, mode: "studio" })); setNotice("Source removed"); }}><X size={14} /></button></div> : <button className="upload-tile" onClick={() => uploadRef.current?.click()}><span className="upload-icon"><UploadCloud size={19} /></span><span><strong>Drop an image here</strong><small>or click to browse · EXR, PNG, JPG, WebP</small></span></button>}
            <p className="local-note"><span className="local-led" />Everything stays on this device</p>
          </div>
        </aside>

        <section className="main-panel">
          <div className="viewport-toolbar"><div className="viewport-title"><span className="status-light" /> LIVE VIEWPORT <span className="toolbar-slash">/</span> <strong>Material preview</strong></div><div className="viewport-tools"><span className="toolbar-hint">DRAG TO ORBIT</span><button className={`tool-button ${wireframe ? "on" : ""}`} onClick={() => setWireframe(!wireframe)} title="Toggle mesh wireframe"><Grip size={16} /></button><button className="tool-button" onClick={() => setShape(shape === "Suzanne" ? "Sculpt" : shape === "Sculpt" ? "Torus" : "Suzanne")} title="Cycle preview shape"><Focus size={16} /></button></div></div>
          <div className="viewport">
            <div className="viewport-grid" />
            <div className="viewport-glow" />
            <div className="scene-label"><span className="scene-label-index">{shape === "Suzanne" ? "01" : shape === "Sculpt" ? "02" : "03"} / 03</span><span>{shape === "Suzanne" ? "USER MESH" : "FORM STUDY"}</span><strong>{shape.toUpperCase()}</strong></div>
            {canvas && <Preview canvas={canvas} shape={shape} wireframe={wireframe} />}
            <div className="matcap-inset" style={{ "--sphere-preview-size": `${previewSize}px` } as React.CSSProperties}><div className="matcap-inset-top"><span>LOOKUP SPHERE</span><span>01</span></div>{previewUrl && <img src={previewUrl} alt="Matcap lookup sphere" />}<div className="matcap-inset-bottom">VIEW SPACE · 512 PX</div></div>
            <div className="axis-widget"><span className="axis-y">Y</span><span className="axis-x">X</span><span className="axis-z">Z</span><i /></div>
            <div className="viewport-bottom"><div className="shape-switch" role="group" aria-label="Preview object">{(["Suzanne", "Sculpt", "Torus"] as PreviewShape[]).map((item) => <button key={item} className={shape === item ? "active" : ""} onClick={() => setShape(item)}>{item}</button>)}</div><div className="view-note"><Maximize2 size={13} /> ORBIT · ZOOM · INSPECT</div></div>
          </div>
          <div className="readout-bar"><div className="readout-item"><span>SHADER</span><strong>MeshMatcapMaterial</strong></div><div className="readout-item"><span>LOOKUP</span><strong>View space normals</strong></div><div className="readout-item"><span>TEXTURE</span><strong>512 × 512 / sRGB</strong></div><div className="readout-live"><span className="live-pulse" /> LIVE</div></div>
          <div className="lower-panel"><div className="lower-copy"><span className="section-index">01 — MATERIAL OUTPUT</span><h2>Made for the viewport.</h2><p>One centered sphere. Soft highlights. Readable silhouettes.<br />A matcap that holds up as you orbit.</p></div><div className="output-preview">{previewUrl && <img src={previewUrl} alt="Matcap texture preview" />}<div><span>OUTPUT TEXTURE</span><strong>{fileName(settings.name)}</strong><small>Opaque PNG · no UV seams</small></div></div></div>
        </section>

        <aside className="inspector-panel">
          <div className="inspector-header"><div><span className="overline">ADJUSTMENTS</span><h2>Material settings</h2></div><button className="tool-button reset-button" onClick={reset} title="Reset studio"><RotateCcw size={16} /></button></div>
          <div className="name-field"><label htmlFor="material-name">MATERIAL NAME</label><input id="material-name" value={settings.name} onChange={(e) => update("name", e.target.value)} spellCheck={false} /></div>
          <div className="preview-size-field"><RangeControl label="Preview sphere size" value={previewSize} min={110} max={220} step={1} onChange={setPreviewSize} /></div>
          <div className="editor-tabs" role="tablist" aria-label="Matcap editor mode"><button role="tab" aria-selected={panel === "surface"} className={panel === "surface" ? "active" : ""} onClick={() => choosePanel("surface")}><Sparkles size={14} /> Surface</button><button role="tab" aria-selected={panel === "zebra"} className={panel === "zebra" ? "active" : ""} onClick={() => choosePanel("zebra")}><Layers2 size={14} /> Zebra</button><button role="tab" aria-selected={panel === "image"} className={panel === "image" ? "active" : ""} onClick={() => choosePanel("image")}><ImagePlus size={14} /> Image</button></div>
          <div className="controls-scroll">
            {panel === "surface" && <>
              <div className="control-section"><div className="section-title"><span><SlidersHorizontal size={15} /> MATERIAL & SPECULAR</span><span>01</span></div><ColorControl label="Base color" value={settings.baseColor} onChange={(v) => update("baseColor", v)} /><ColorControl label="Specular color" value={settings.highlightColor} onChange={(v) => update("highlightColor", v)} /><div className="range-stack color-followup"><RangeControl label="Base intensity" value={settings.baseIntensity} min={0.5} max={1.5} onChange={(v) => update("baseIntensity", v)} /><RangeControl label="Specular intensity" value={settings.specularIntensity} min={0} max={1.5} onChange={(v) => update("specularIntensity", v)} /><RangeControl label="Glossiness" value={settings.glossiness} min={0} max={1} suffix="%" onChange={(v) => update("glossiness", v)} /><RangeControl label="Highlight spread" value={settings.highlightSize} min={0} max={1} suffix="%" onChange={(v) => update("highlightSize", v)} /><RangeControl label="Ambient fill" value={settings.ambient} min={0.15} max={0.8} suffix="%" onChange={(v) => update("ambient", v)} /></div></div>
              <div className="control-section"><div className="section-title"><span><Sparkles size={15} /> KEY LIGHT</span><span>02</span></div><div className="range-stack"><RangeControl label="Horizontal" value={settings.lightX} min={-1} max={1} onChange={(v) => update("lightX", v)} /><RangeControl label="Vertical" value={settings.lightY} min={-1} max={1} onChange={(v) => update("lightY", v)} /></div><div className="light-color"><ColorControl label="Key color" value={settings.keyColor} onChange={(v) => update("keyColor", v)} /></div><div className="range-stack"><RangeControl label="Key intensity" value={settings.brightness} min={0} max={1.5} onChange={(v) => update("brightness", v)} /></div></div>
              <div className="control-section"><div className="section-title"><span><Box size={15} /> FILL LIGHT</span><span>03</span></div><div className="range-stack"><RangeControl label="Horizontal" value={settings.fillX} min={-1} max={1} onChange={(v) => update("fillX", v)} /><RangeControl label="Vertical" value={settings.fillY} min={-1} max={1} onChange={(v) => update("fillY", v)} /></div><div className="light-color"><ColorControl label="Fill color" value={settings.fillColor} onChange={(v) => update("fillColor", v)} /></div><div className="range-stack"><RangeControl label="Fill intensity" value={settings.fillIntensity} min={0} max={1.5} onChange={(v) => update("fillIntensity", v)} /></div></div>
              <div className="control-section"><div className="section-title"><span><Focus size={15} /> RIM LIGHT</span><span>04</span></div><ColorControl label="Rim color" value={settings.rimColor} onChange={(v) => update("rimColor", v)} /><div className="range-stack color-followup"><RangeControl label="Sharpness" value={settings.rimSharpness} min={0.5} max={6} onChange={(v) => update("rimSharpness", v)} /><RangeControl label="Strength" value={settings.rimStrength} min={0} max={1.5} onChange={(v) => update("rimStrength", v)} /></div></div>
            </>}
            {panel === "zebra" && <><div className="analysis-note"><span className="analysis-icon">≋</span><div><strong>Curvature analysis</strong><p>Stripes follow the reflection vector. Kinks reveal tangent breaks; smooth bends show curvature changes.</p></div></div><div className="control-section"><div className="section-title"><span><Layers2 size={15} /> STRIPE PATTERN</span><span>01</span></div><div className="range-stack"><RangeControl label="Band count" value={settings.bands} min={6} max={12} step={1} onChange={(v) => update("bands", v)} /><RangeControl label="Edge softness" value={settings.stripeSoftness} min={0.02} max={0.3} suffix="%" onChange={(v) => update("stripeSoftness", v)} /><RangeControl label="Angle" value={settings.stripeAngle} min={-90} max={90} step={1} suffix="°" onChange={(v) => update("stripeAngle", v)} /></div></div><div className="control-section"><div className="section-title"><span><SlidersHorizontal size={15} /> STRIPE COLOURS</span><span>02</span></div><ColorControl label="Light band" value={settings.stripeA} onChange={(v) => update("stripeA", v)} /><ColorControl label="Dark band" value={settings.stripeB} onChange={(v) => update("stripeB", v)} /></div><div className="tip-box"><strong>READ THE SURFACE</strong><span>A sudden stripe jump points to a gap or sharp edge. A kink points to a G1 tangent break.</span></div></>}
            {panel === "image" && <><div className="image-source-card">{sourceUrl ? <img src={sourceUrl} alt="Source image" /> : <div className="empty-source"><ImagePlus size={29} strokeWidth={1.2} /><span>NO SOURCE IMAGE</span></div>}<div><span>SOURCE IMAGE</span><strong>{sourceName || "Add your own image"}</strong><button onClick={() => uploadRef.current?.click()}>{source ? "Replace image" : "Choose image"} <span>↗</span></button></div></div><div className="control-section"><div className="section-title"><span><ImagePlus size={15} /> PROCESSING</span><span>01</span></div><div className="mapping-choice"><button className={settings.imageMapping === "reflection" ? "active" : ""} onClick={() => update("imageMapping", "reflection")}><strong>Reflect image</strong><span>Map source using the view reflection vector</span></button><button className={settings.imageMapping === "matcap" ? "active" : ""} onClick={() => update("imageMapping", "matcap")}><strong>Existing matcap</strong><span>Center crop and fill outer corners</span></button></div>{exrData && <div className="range-stack image-range"><RangeControl label="EXR exposure" value={settings.exrExposure} min={-4} max={4} step={0.1} suffix=" EV" onChange={(v) => update("exrExposure", v)} description="Tone map HDR highlights before PNG export" /></div>}{settings.imageMapping === "reflection" && <div className="range-stack image-range"><RangeControl label="Image influence" value={settings.imageInfluence} min={0} max={1} suffix="%" onChange={(v) => update("imageInfluence", v)} /></div>}</div><div className="tip-box"><strong>BEST RESULTS</strong><span>{exrData ? "Use Existing matcap for a rendered sphere. Reflect image remaps a flat source using view reflections. Project saves retain the original HDR file." : "Use a clean, evenly lit image or a centered sphere. The editor crops to a square and exports a ready-to-load matcap."}</span></div></>}
          </div>
          <div className="inspector-output"><div className="output-title"><span>EXPORT SETTINGS</span><span>READY <Check size={12} /></span></div><div className="resolution-row"><span>Resolution</span><select value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Export resolution"><option value={256}>256 × 256</option><option value={512}>512 × 512</option><option value={1024}>1024 × 1024</option></select></div><label className="dither-row"><span><span className={`check-box ${settings.dither ? "checked" : ""}`}>{settings.dither && <Check size={10} />}</span>Dither smooth gradients</span><input type="checkbox" checked={settings.dither} onChange={(e) => update("dither", e.target.checked)} /></label><button className="export-wide" onClick={exportPng}><ArrowDownToLine size={15} /> Export matcap <span>PNG ↗</span></button></div>
        </aside>
      </div>
      <footer className="statusbar"><div><span className="status-indicator" /> LOCAL SESSION <span className="footer-divider" /> {autoSaved ? "AUTO-SAVED IN BROWSER" : "BROWSER STORAGE FULL · SAVE PROJECT"}</div><div>VIEW SPACE SHADING <span className="footer-divider" /> BUILT FOR VIEWPOINT <span className="footer-divider" /> v0.1</div></footer>
      {dragging && <div className="drop-overlay"><UploadCloud size={32} /><strong>Drop to import image</strong><span>EXR, PNG, JPEG, or WebP</span></div>}
      {notice && <div className="toast" role="status"><Check size={14} />{notice}</div>}
    </main>
  );
}
