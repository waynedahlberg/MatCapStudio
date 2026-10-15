"use client";

import dynamic from "next/dynamic";
import { ChangeEvent, DragEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine, Box, Check, ChevronDown, CircleHelp, Focus, Grip,
  ImagePlus, Layers2, LoaderCircle, Maximize2, MoreHorizontal, RotateCcw, SlidersHorizontal,
  Sparkles, UploadCloud, X,
} from "lucide-react";
import {
  DEFAULT_SETTINGS, generateMatcap, MatcapSettings, PRESETS, Preset,
  fileName, settingsForPreset,
} from "@/lib/matcap";
import { decodeExr, decodeRadianceHdr, downsampleEnvironment, environmentToSrgbPixels, finishHdrPixels, hdrToSrgbPixels, type HdrImage } from "@/lib/hdr";
import hdrPresetCatalog from "@/lib/hdr-presets.json";
import type { PreviewShape } from "./Preview";

const Preview = dynamic(() => import("./Preview"), { ssr: false });
type Panel = "surface" | "zebra" | "image";
type HdrPreset = (typeof hdrPresetCatalog)[number];

function RangeControl({ label, value, min, max, step = 0.01, suffix = "", onChange, description }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string;
  onChange: (n: number) => void; description?: string;
}) {
  const [draft, setDraft] = useState(value);
  const draftRef = useRef(value);
  useEffect(() => { draftRef.current = value; setDraft(value); }, [value]);
  const commit = () => { if (draftRef.current !== value) onChange(draftRef.current); };
  const percent = ((draft - min) / (max - min)) * 100;
  const display = suffix === "°" ? Math.round(draft) : suffix === "%" ? Math.round(draft * 100) : Number.isInteger(draft) ? draft : draft.toFixed(2);
  return (
    <label className="range-control">
      <span className="control-head"><span>{label}</span><span className="range-value">{display}{suffix}</span></span>
      {description && <span className="control-description">{description}</span>}
      <input type="range" min={min} max={max} step={step} value={draft}
        onChange={(e) => { draftRef.current = Number(e.target.value); setDraft(draftRef.current); }}
        onPointerUp={commit} onPointerCancel={commit} onKeyUp={commit} onBlur={commit}
        style={{ "--range-percent": `${percent}%` } as React.CSSProperties} />
    </label>
  );
}

function ColorControl({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { setDraft(value); }, [value]);
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const commit = () => { if (input.value !== value) onChange(input.value); };
    input.addEventListener("change", commit);
    return () => input.removeEventListener("change", commit);
  }, [value, onChange]);
  const commit = () => { if (draft !== value) onChange(draft); };
  return <label className="color-control"><span className="color-left"><span className="swatch" style={{ background: draft }} />{label}</span><span className="color-right"><span>{draft.toUpperCase()}</span><input ref={inputRef} type="color" value={draft} onInput={(e) => setDraft(e.currentTarget.value)} onChange={(e) => setDraft(e.target.value)} onPointerUp={commit} onKeyUp={commit} onBlur={commit} aria-label={`${label} color`} /></span></label>;
}

function PresetCard({ preset, selected, onClick }: { preset: Preset; selected: boolean; onClick: () => void }) {
  return (
    <button className={`preset-card ${selected ? "selected" : ""}`} onClick={onClick} title={`Load ${preset.label}`}>
      <span className="preset-visual"><img src={`/procedural/${preset.id}-thumb.png`} alt="" /></span>
      <span className="preset-label">{preset.label}</span>
      <span className="preset-category">{preset.category}</span>
      {selected && <span className="preset-check"><Check size={11} strokeWidth={3} /></span>}
    </button>
  );
}

function HdrPresetCard({ preset, selected, onClick }: { preset: HdrPreset; selected: boolean; onClick: () => void }) {
  return (
    <button className={`preset-card ${selected ? "selected" : ""}`} onClick={onClick} title={`Load ${preset.label} HDR environment`}>
      <span className="preset-visual"><img src={`/exr/generated/${preset.id}.png`} alt="" /></span>
      <span className="preset-label">{preset.label}</span>
      <span className="preset-category">HDR ENVIRONMENT</span>
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

function finishHdrCanvas(canvas: HTMLCanvasElement, blur: number, frost: number, source?: ImageData): HTMLCanvasElement {
  if (blur === 0 && frost === 0) return canvas;
  const pixels = source || canvas.getContext("2d", { willReadFrequently: true })?.getImageData(0, 0, canvas.width, canvas.height);
  if (!pixels) return canvas;
  const finished = document.createElement("canvas");
  finished.width = canvas.width;
  finished.height = canvas.height;
  finished.getContext("2d")?.putImageData(new ImageData(finishHdrPixels(pixels.data, pixels.width, pixels.height, blur, frost), pixels.width, pixels.height), 0, 0);
  return finished;
}

export default function Studio() {
  const [settings, setSettings] = useState<MatcapSettings>(DEFAULT_SETTINGS);
  const [activePreset, setActivePreset] = useState("silver");
  const [panel, setPanel] = useState<Panel>("surface");
  const [source, setSource] = useState<ImageData | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [hdrData, setHdrData] = useState<HdrImage | null>(null);
  const [hdrFile, setHdrFile] = useState<File | null>(null);
  const [hdrPresetId, setHdrPresetId] = useState("");
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  const [shape, setShape] = useState<PreviewShape>("Suzanne");
  const [previewSize, setPreviewSize] = useState(160);
  const [wireframe, setWireframe] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [size, setSize] = useState(512);
  const [notice, setNotice] = useState("");
  const [autoSaved, setAutoSaved] = useState(true);
  const [renderBusy, setRenderBusy] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const proceduralCanvasCache = useRef(new Map<string, HTMLCanvasElement>());
  const presetCanvasCache = useRef(new Map<string, { canvas: HTMLCanvasElement; pixels: ImageData }>());
  const decodedPresetCache = useRef(new Map<string, HdrImage>());
  const previewUrlCache = useRef(new WeakMap<HTMLCanvasElement, string>());
  const renderRevision = useRef(0);
  const lastRenderedInputs = useRef<{ key: string; source: ImageData | null; hdrPresetId: string; hdrData: HdrImage | null } | null>(null);
  const renderKey = useMemo(() => JSON.stringify(settings, (key, value) => key === "name" ? undefined : value), [settings]);
  const beginRender = useCallback(() => { renderRevision.current++; setRenderBusy(true); }, []);
  const showCanvas = useCallback((next: HTMLCanvasElement) => {
    const revision = renderRevision.current;
    setCanvas(next);
    window.requestAnimationFrame(() => { if (renderRevision.current === revision) setRenderBusy(false); });
  }, []);
  const neutralHdrPreset = Boolean(hdrPresetId && settings.mode === "image" && settings.imageMapping === "environment"
    && settings.exrExposure === 0 && settings.environmentRotation === 0);
  const needsPresetHdr = Boolean(hdrPresetId && settings.mode === "image" && !neutralHdrPreset);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("matcap-studio:v1");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.settings) setSettings({ ...DEFAULT_SETTINGS, ...parsed.settings });
        if (parsed.activePreset) setActivePreset(parsed.activePreset);
        if (parsed.hdrPresetId) setHdrPresetId(parsed.hdrPresetId);
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
    try { localStorage.setItem("matcap-studio:v1", JSON.stringify({ settings, activePreset, hdrPresetId, panel, sourceUrl: hdrPresetId ? "" : sourceUrl, sourceName, shape, previewSize })); setAutoSaved(true); }
    catch { setAutoSaved(false); }
  }, [settings, activePreset, hdrPresetId, panel, sourceUrl, sourceName, shape, previewSize]);

  useEffect(() => {
    if (settings.mode === "image" && settings.imageMapping === "environment" && (hdrPresetId || hdrData)) return;
    if (PRESETS.some((item) => item.id === activePreset) && settings.mode !== "image") return;
    if (needsPresetHdr && !hdrData) return;
    const previous = lastRenderedInputs.current;
    if (previous?.key === renderKey && previous.source === source && previous.hdrPresetId === hdrPresetId && previous.hdrData === hdrData) return;
    lastRenderedInputs.current = { key: renderKey, source, hdrPresetId, hdrData };
    const rendered = generateMatcap(settings, source);
    showCanvas(settings.mode === "image" && (hdrPresetId || hdrData)
      ? finishHdrCanvas(rendered, settings.reflectionBlur, settings.frost) : rendered);
  }, [renderKey, source, activePreset, hdrPresetId, hdrData, needsPresetHdr, settings, showCanvas]);
  useEffect(() => {
    if (!PRESETS.some((item) => item.id === activePreset) || hdrPresetId) return;
    const cached = proceduralCanvasCache.current.get(activePreset);
    if (cached) { showCanvas(cached); return; }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const preview = document.createElement("canvas");
      preview.width = preview.height = 512;
      preview.getContext("2d")?.drawImage(image, 0, 0);
      proceduralCanvasCache.current.set(activePreset, preview);
      showCanvas(preview);
    };
    image.onerror = () => { if (!cancelled) { setNotice("Could not load procedural preset. Run npm run build:procedural-presets."); setRenderBusy(false); } };
    image.src = `/procedural/${activePreset}.png`;
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [activePreset, hdrPresetId, showCanvas]);
  useEffect(() => {
    if (!hdrData) return;
    if (neutralHdrPreset) return;
    const raw = settings.imageMapping === "environment"
      ? environmentToSrgbPixels(hdrData, settings.exrExposure, settings.environmentRotation)
      : hdrToSrgbPixels(hdrData, settings.exrExposure);
    const rgba = settings.imageMapping === "environment"
      ? finishHdrPixels(raw, 512, 512, settings.reflectionBlur, settings.frost) : raw;
    const pixels = new ImageData(rgba, 512, 512);
    const preview = document.createElement("canvas");
    preview.width = preview.height = 512;
    preview.getContext("2d")?.putImageData(pixels, 0, 0);
    setSource(pixels);
    setSourceUrl(preview.toDataURL("image/png"));
    if (settings.imageMapping === "environment") setCanvas(preview);
  }, [hdrData, settings.exrExposure, settings.environmentRotation, settings.imageMapping, settings.reflectionBlur, settings.frost, neutralHdrPreset]);
  useEffect(() => {
    if (!hdrPresetId || !neutralHdrPreset) return;
    const url = `/exr/generated/${hdrPresetId}-matcap.png`;
    const show = (preview: { canvas: HTMLCanvasElement; pixels: ImageData }) => {
      setCanvas(finishHdrCanvas(preview.canvas, settings.reflectionBlur, settings.frost, preview.pixels));
      setSource(preview.pixels);
      setSourceUrl(url);
    };
    const cached = presetCanvasCache.current.get(hdrPresetId);
    if (cached) {
      presetCanvasCache.current.delete(hdrPresetId);
      presetCanvasCache.current.set(hdrPresetId, cached);
      show(cached);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) return;
      context.drawImage(image, 0, 0);
      const preview = { canvas, pixels: context.getImageData(0, 0, 512, 512) };
      presetCanvasCache.current.set(hdrPresetId, preview);
      if (presetCanvasCache.current.size > 6) presetCanvasCache.current.delete(presetCanvasCache.current.keys().next().value!);
      show(preview);
    };
    image.onerror = () => { if (!cancelled) setNotice("Could not load preset preview. Run npm run build:hdr-presets."); };
    image.src = url;
    return () => { cancelled = true; image.onload = null; image.onerror = null; };
  }, [hdrPresetId, neutralHdrPreset, settings.reflectionBlur, settings.frost]);
  useEffect(() => {
    if (!hdrPresetId || !needsPresetHdr) return;
    const preset = hdrPresetCatalog.find((item) => item.id === hdrPresetId);
    if (!preset) return;
    const cached = decodedPresetCache.current.get(hdrPresetId);
    if (cached) {
      decodedPresetCache.current.delete(hdrPresetId);
      decodedPresetCache.current.set(hdrPresetId, cached);
      setHdrData(cached);
      return;
    }
    const controller = new AbortController();
    fetch(`/exr/generated/${preset.id}.exr`, { signal: controller.signal })
      .then((response) => { if (!response.ok) throw new Error("Missing preset asset"); return response.arrayBuffer(); })
      .then(decodeExr)
      .then((image) => {
        if (controller.signal.aborted) return;
        decodedPresetCache.current.delete(preset.id);
        decodedPresetCache.current.set(preset.id, image);
        if (decodedPresetCache.current.size > 3) decodedPresetCache.current.delete(decodedPresetCache.current.keys().next().value!);
        setHdrData(image);
      })
      .catch(() => { if (!controller.signal.aborted) setNotice(`Could not load ${preset.label}. Run npm run build:hdr-presets.`); });
    return () => controller.abort();
  }, [hdrPresetId, needsPresetHdr]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const imageReady = Boolean(source);
  const previewUrl = useMemo(() => {
    if (hdrPresetId && neutralHdrPreset && settings.reflectionBlur === 0 && settings.frost === 0) return `/exr/generated/${hdrPresetId}-matcap.png`;
    if (!canvas) return "";
    let cached = previewUrlCache.current.get(canvas);
    if (!cached) { cached = canvas.toDataURL("image/png"); previewUrlCache.current.set(canvas, cached); }
    return cached;
  }, [canvas, hdrPresetId, neutralHdrPreset, settings.reflectionBlur, settings.frost]);
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
    setHdrPresetId("");
    setHdrData(null);
    setPanel(preset.settings.mode === "zebra" ? "zebra" : "surface");
    setNotice(`${preset.label} loaded`);
  };
  const chooseHdrPreset = (preset: HdrPreset) => {
    setHdrData(null);
    setHdrFile(null);
    setSource(null);
    setSourceUrl("");
    setSourceName(preset.file);
    setSettings({ ...DEFAULT_SETTINGS, name: preset.label, mode: "image", imageMapping: "environment" });
    setActivePreset(preset.id);
    setHdrPresetId(preset.id);
    setPanel("image");
    setNotice(`Loading ${preset.label} HDR environment`);
  };
  const upload = async (file?: File) => {
    if (!file) return;
    const isExr = /\.exr$/i.test(file.name) || ["image/x-exr", "image/aces"].includes(file.type);
    const isRadiance = /\.hdr$/i.test(file.name) || ["image/vnd.radiance", "image/x-hdr"].includes(file.type);
    const isHdr = isExr || isRadiance;
    if (!isHdr && !["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setNotice("Choose an EXR, HDR, PNG, JPEG, or WebP image"); return; }
    if (file.size > (isHdr ? 100 : 20) * 1024 * 1024) { setNotice(`Choose a source smaller than ${isHdr ? 100 : 20} MB`); return; }
    try {
      let isPanorama = false;
      if (isHdr) {
        const buffer = await file.arrayBuffer();
        const decoded = isRadiance ? decodeRadianceHdr(buffer) : decodeExr(buffer);
        const aspect = decoded.width / decoded.height;
        isPanorama = aspect >= 1.8 && aspect <= 2.2;
        setHdrData(isPanorama ? downsampleEnvironment(decoded) : decoded);
        setHdrFile(file);
        setSource(null);
        setSourceUrl("");
      } else {
        const result = await readImage(file);
        setHdrData(null);
        setHdrFile(null);
        setSource(result.pixels);
        setSourceUrl(result.url);
      }
      setHdrPresetId("");
      setSourceName(file.name);
      setPanel("image");
      setSettings((current) => ({ ...current, mode: "image", imageMapping: isPanorama ? "environment" : isHdr ? "matcap" : current.imageMapping, name: file.name.replace(/\.[^.]+$/, "") || "Imported Matcap" }));
      setActivePreset("custom");
      setNotice(isHdr ? "HDR source ready · adjust exposure in Image settings" : "Image ready for matcap processing");
    } catch { setNotice("The image could not be opened"); }
  };
  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault(); setDragging(false); void upload(e.dataTransfer.files[0]);
  };
  const exportPng = () => {
    if (settings.mode === "image" && (hdrData || hdrPresetId) && !source) { setNotice("Wait for the HDR preview to finish loading"); return; }
    let result: HTMLCanvasElement;
    if (settings.mode === "image" && (hdrData || hdrPresetId) && canvas) {
      result = canvas;
      if (size !== 512) {
        result = document.createElement("canvas");
        result.width = result.height = size;
        result.getContext("2d")?.drawImage(canvas, 0, 0, size, size);
      }
    } else result = size === 512 && canvas ? canvas : generateMatcap(settings, source, size);
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
      const sourceHdrDataUrl = hdrFile ? await readFileDataUrl(hdrFile) : undefined;
      const blob = new Blob([JSON.stringify({ version: 1, settings, sourceUrl, sourceName, sourceHdrDataUrl, hdrPresetId }, null, 2)], { type: "application/json" });
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
      let restoredHdr: HdrImage | null = null;
      let restoredHdrFile: File | null = null;
      const embeddedHdr = data.sourceHdrDataUrl || data.sourceExrDataUrl;
      if (embeddedHdr) {
        if (typeof embeddedHdr !== "string" || !/^data:[^,]*;base64,/i.test(embeddedHdr) || embeddedHdr.length > 150_000_000) throw new Error("Invalid HDR source");
        const buffer = await (await fetch(embeddedHdr)).arrayBuffer();
        if (buffer.byteLength > 100 * 1024 * 1024) throw new Error("HDR source is too large");
        const name = data.sourceName || "source.exr";
        restoredHdr = /\.hdr$/i.test(name) ? downsampleEnvironment(decodeRadianceHdr(buffer)) : decodeExr(buffer);
        restoredHdrFile = new File([buffer], name);
      }
      setSettings({ ...DEFAULT_SETTINGS, ...data.settings });
      setActivePreset(data.hdrPresetId || "custom");
      setHdrPresetId(data.hdrPresetId || "");
      const nextPanel = data.settings.mode === "zebra" ? "zebra" : data.settings.mode === "image" ? "image" : "surface";
      setPanel(nextPanel);
      setHdrData(restoredHdr);
      setHdrFile(restoredHdrFile);
      if (restoredHdr || data.hdrPresetId) {
        setSource(null);
        setSourceUrl("");
        setSourceName(data.sourceName || "HDR preset");
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
  const reset = () => { setSettings(DEFAULT_SETTINGS); setActivePreset("silver"); setPanel("surface"); setSource(null); setSourceUrl(""); setSourceName(""); setHdrData(null); setHdrFile(null); setHdrPresetId(""); setNotice("Studio reset"); };

  return (
    <main className="studio-shell" onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false); }} onDrop={onDrop}>
      <input ref={uploadRef} className="sr-only" type="file" accept=".exr,.hdr,image/x-exr,image/vnd.radiance,image/png,image/jpeg,image/webp" onChange={(e: ChangeEvent<HTMLInputElement>) => { void upload(e.target.files?.[0]); e.target.value = ""; }} />
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
          <div className="library-heading"><span>HDR ENVIRONMENTS <span className="count">{hdrPresetCatalog.length.toString().padStart(2, "0")}</span></span></div>
          <div className="preset-grid">{hdrPresetCatalog.map((preset) => <HdrPresetCard key={preset.id} preset={preset} selected={activePreset === preset.id} onClick={() => chooseHdrPreset(preset)} />)}</div>
          <div className="library-bottom">
            <div className="divider-heading">IMPORT SOURCE</div>
            {imageReady ? <div className="imported-file"><img src={sourceUrl} alt="Imported source" /><div><strong>{sourceName}</strong><span>LOCAL IMAGE · READY</span></div><button title="Remove source" onClick={() => { setSource(null); setSourceUrl(""); setSourceName(""); setHdrData(null); setHdrFile(null); setHdrPresetId(""); if (settings.mode === "image") setSettings((s) => ({ ...s, mode: "studio" })); setNotice("Source removed"); }}><X size={14} /></button></div> : <button className="upload-tile" onClick={() => uploadRef.current?.click()}><span className="upload-icon"><UploadCloud size={19} /></span><span><strong>Drop an image here</strong><small>or click to browse · EXR, HDR, PNG, JPG, WebP</small></span></button>}
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
            {panel === "image" && <><div className="image-source-card">{sourceUrl ? <img src={sourceUrl} alt="Source image" /> : <div className="empty-source"><ImagePlus size={29} strokeWidth={1.2} /><span>NO SOURCE IMAGE</span></div>}<div><span>SOURCE IMAGE</span><strong>{sourceName || "Add your own image"}</strong><button onClick={() => uploadRef.current?.click()}>{source ? "Replace image" : "Choose image"} <span>↗</span></button></div></div><div className="control-section"><div className="section-title"><span><ImagePlus size={15} /> PROCESSING</span><span>01</span></div><div className="mapping-choice"><button className={settings.imageMapping === "reflection" ? "active" : ""} onClick={() => update("imageMapping", "reflection")}><strong>Reflect image</strong><span>Map a flat source using view reflections</span></button><button className={settings.imageMapping === "matcap" ? "active" : ""} onClick={() => update("imageMapping", "matcap")}><strong>Existing matcap</strong><span>Center crop a rendered sphere</span></button>{(hdrData || hdrPresetId) && <button className={settings.imageMapping === "environment" ? "active" : ""} onClick={() => update("imageMapping", "environment")}><strong>HDR environment</strong><span>Bake panorama reflections onto a sphere</span></button>}</div>{(hdrData || hdrPresetId) && <div className="range-stack image-range"><RangeControl label="HDR exposure" value={settings.exrExposure} min={-4} max={4} step={0.1} suffix=" EV" onChange={(v) => update("exrExposure", v)} description="Tone map highlights before PNG export" />{settings.imageMapping === "environment" && <RangeControl label="Environment rotation" value={settings.environmentRotation} min={-180} max={180} step={1} suffix="°" onChange={(v) => update("environmentRotation", v)} />}<RangeControl label="Reflection blur" value={settings.reflectionBlur} min={0} max={24} step={1} suffix=" px" onChange={(v) => update("reflectionBlur", v)} description="Spread sharp reflections into soft highlights" /><RangeControl label="Frost" value={settings.frost} min={0} max={1} step={0.01} suffix="%" onChange={(v) => update("frost", v)} description="Diffuse contrast for a milky glass finish" /></div>}{settings.imageMapping === "reflection" && <div className="range-stack image-range"><RangeControl label="Image influence" value={settings.imageInfluence} min={0} max={1} suffix="%" onChange={(v) => update("imageInfluence", v)} /></div>}</div><div className="tip-box"><strong>BEST RESULTS</strong><span>{hdrData || hdrPresetId ? "Blur and Frost soften reflections for a glass-like look. The PNG stays opaque; project saves keep the HDR source or preset link." : "Use a clean, evenly lit image or a centered sphere. The editor crops to a square and exports a ready-to-load matcap."}</span></div></>}
          </div>
          <div className="inspector-output"><div className="output-title"><span>EXPORT SETTINGS</span><span>READY <Check size={12} /></span></div><div className="resolution-row"><span>Resolution</span><select value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="Export resolution"><option value={256}>256 × 256</option><option value={512}>512 × 512</option><option value={1024}>1024 × 1024</option></select></div><label className="dither-row"><span><span className={`check-box ${settings.dither ? "checked" : ""}`}>{settings.dither && <Check size={10} />}</span>Dither smooth gradients</span><input type="checkbox" checked={settings.dither} onChange={(e) => update("dither", e.target.checked)} /></label><button className="export-wide" onClick={exportPng}><ArrowDownToLine size={15} /> Export matcap <span>PNG ↗</span></button></div>
        </aside>
      </div>
      <footer className="statusbar"><div><span className="status-indicator" /> LOCAL SESSION <span className="footer-divider" /> {autoSaved ? "AUTO-SAVED IN BROWSER" : "BROWSER STORAGE FULL · SAVE PROJECT"}</div><div>VIEW SPACE SHADING <span className="footer-divider" /> BUILT FOR VIEWPOINT <span className="footer-divider" /> v0.1</div></footer>
      {dragging && <div className="drop-overlay"><UploadCloud size={32} /><strong>Drop to import image</strong><span>EXR, HDR, PNG, JPEG, or WebP</span></div>}
      {notice && <div className="toast" role="status"><Check size={14} />{notice}</div>}
    </main>
  );
}
