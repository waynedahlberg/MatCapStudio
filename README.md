# Matcap Studio

A local matcap editor for Viewpoint. Build procedural studio materials, inspect zebra stripes and normals on the supplied Suzanne mesh, convert a local image, and export an opaque PNG.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The app uses Next.js App Router, TypeScript, Tailwind CSS 4.3, Three.js, and React Three Fiber. Rendering, image processing, and project storage run in the browser; there is no backend or upload service.

## Workflow

1. Select a preset or edit a surface from scratch. Tune material and specular color, then shape the key, fill, and rim lights. Rotate and zoom the supplied Suzanne mesh or the alternate Sculpt and Torus forms. The lookup sphere stays visible beside the model.
2. Use **Zebra** to inspect reflection stripes, or drop a PNG, JPEG, or WebP into the import area and use **Image** to process it.
3. Export a 256, 512, or 1024 px PNG. 512 px is the default for Viewpoint.

The editor saves its current state in browser storage when capacity permits. **Save project** downloads a local `.matcap.json` file containing settings and the normalized source image. **Open project** restores it. Exported PNGs are named in kebab case.

See [docs/MATCAPS.md](docs/MATCAPS.md) for the texture contract and Viewpoint integration notes.
