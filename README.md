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
2. Use **Zebra** to inspect reflection stripes, choose one of the local HDR environment presets, or drop an EXR, Radiance HDR, PNG, JPEG, or WebP into the import area. A 2:1 EXR or HDR panorama defaults to **HDR environment**, which bakes its reflections onto the matcap sphere; other HDR images default to **Existing matcap**. HDR sources have exposure, environment rotation, reflection blur, and Frost controls. Frost softens contrast to suggest diffuse glass; the exported matcap remains opaque.
3. Export a 256, 512, or 1024 px PNG. 512 px is the default for Viewpoint.

The editor saves its current state in browser storage when capacity permits. **Save project** downloads a local `.matcap.json` file containing settings and the normalized source image; for uploaded EXR or HDR files it also embeds the original HDR file so exposure remains editable when reopened. Local HDR presets save a link to their working copy. Browser auto-save retains the normalized preview but not the original uploaded HDR source, so save a project to keep that source. Exported PNGs are named in kebab case.

The supplied `.exr` and Radiance `.hdr` panoramas live in ignored `public/exr/`. Run `npm run build:hdr-presets` after adding or replacing them to regenerate compact EXR working copies, thumbnails, and 512 px preview matcaps in `public/exr/generated/`. These local assets are intentionally absent from Git; preset tiles and previews need them to load. Selecting an HDR preset displays its PNG immediately; the EXR working copy loads only when exposure, rotation, or image mapping is edited.

See [docs/MATCAPS.md](docs/MATCAPS.md) for the texture contract and Viewpoint integration notes.
