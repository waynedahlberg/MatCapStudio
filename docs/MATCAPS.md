# Matcap authoring for Viewpoint

Matcap Studio creates textures for Viewpoint's `three.js` `MeshMatcapMaterial` lookup in `BodyNode`. A matcap is a view-space normal lookup: the sphere image is sampled using `uv = n.xy × 0.495 + 0.5`. The image stays fixed to the camera while the model rotates.

## Texture contract

| Property | Target |
| --- | --- |
| Dimensions | Square power of two: 256, 512, or 1024 px. Use 512 by default. |
| Shape | One centered sphere filling about 99% of the image width. |
| Corners | Opaque rim color, including mipmap input outside the sphere. |
| View | Orthographic, looking straight at the sphere. |
| Orientation | Image top faces screen-up; image left faces screen-left. |
| Encoding | 8-bit sRGB PNG, opaque. |
| Gradients | Dither smooth procedural gradients. |
| Target size | Under roughly 300 KB when practical. Check the actual exported size, especially for image sources and 1024 px output. |
| Key light | Upper-left and slightly toward the viewer, around direction `(−0.5, 0.6, 0.65)`. |
| Values | Body midtones around 30–85% luminance, with only a small near-white highlight. |
| Rim | Keep enough rim contrast for both light and dark viewport themes. |
| Color | Keep general presets low chroma and avoid a dominant yellow-orange hue near 42°, which Viewpoint uses for selection. |
| Highlights | Small and soft; large hotspots visibly follow the camera. |
| License | Use your own image or a source with clear reuse rights, such as CC0. |
| Name | Kebab-case PNG filename and a short display label. |

The generator writes fully opaque pixels and fills the area outside the lookup circle with a rim color. Procedural studio materials include low-amplitude ordered dithering. Material and specular colors, key and fill light positions and colors, and rim strength and sharpness are adjustable. The preview uses the supplied Suzanne GLB plus alternate sample shapes. Image import crops the source to a centered square at 512 px. **Reflect image** maps a flat source with the reflected view vector; **Existing matcap** samples the cropped image as a matcap and fills corners using the average edge color.

EXR and Radiance HDR imports are decoded locally as scene-linear floats and converted to 8-bit sRGB with adjustable exposure and Reinhard tone mapping. The conversion assumes linear-sRGB primaries; EXRs authored in another gamut, such as ACEScg, need gamut conversion first. A 2:1 EXR or HDR panorama defaults to **HDR environment**, which samples the view reflection vector into the panorama and supports azimuth rotation. Other HDR images default to **Existing matcap**. Reflection blur and Frost are applied to the rendered matcap; Frost adds blur and diffuse contrast reduction but does not create true transparency or refraction. Project files embed uploaded HDR sources; local HDR presets reference generated, ignored working copies. Browser auto-save retains only the converted preview for uploaded sources.

## Zebra analysis

Stripes use `r = 2(n·v)n − v`, where `n` is the view-space surface normal and `v` points toward the camera. The editor offers 6–12 bands, stripe angle, edge softness, and two colors. The default is nine bands with slightly softened edges.

- A sudden stripe jump can indicate a gap or sharp edge.
- A kink can indicate a tangent break (G1).
- A gradual bend shows changing curvature (G2).

The preview uses smooth, dense sample meshes. Viewpoint's current tessellation at up to 15° per facet can make stripes look faceted on tight curves; finer tessellation is a separate Viewpoint change.

## Using the PNG in Viewpoint

Viewpoint currently defines procedural presets in `src/viewport/matcaps.ts`. It does **not** yet load image-file matcaps. The exported PNG is ready for the stated texture contract, but using it in Viewpoint still requires an image loader and a shading entry. That integration belongs in the Viewpoint repository:

1. Load the PNG as an sRGB texture for `MeshMatcapMaterial`.
2. Add an id and display entry to `Shading` and `SHADINGS` in `src/viewport/matcaps.ts`.
3. Add `view.shading.<id>` in `shared/commands.ts` and handle it in `src/commands/runtime.ts`.

Possible follow-up work there includes an image matcap picker, import into a settings folder, accent-colored selection, and denser tessellation while zebra analysis is active.
