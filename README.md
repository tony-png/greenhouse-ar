# Greenhouse AR

See the wooden lattice-rib tunnel greenhouse in augmented reality, in Chrome on an ARCore Android phone.

**https://tony-png.github.io/greenhouse-ar/**: pick a mode.

## On your table: `table.html`

A scale model you place on a table (WebXR, three.js r186). The same controls work in the 3D preview.

1. Point the phone at a table until the ring appears, then tap to place it. It starts at 1:20, about 29 cm long. Tap again to re-place it.
2. Drag to slide it, pinch to resize (1:100 up to life size), twist two fingers to turn it, or use the 1:50 / 1:20 / 1:10 / Life size buttons.
3. Tap **Lock** to freeze its position, rotation and scale (it is anchored to the world), then walk around it.
4. **Finished / Frame / Assembly**:
   - Assembly is a step player: Prev, Play/Pause, Next, a scrub bar, and "Step 9 / 15 · Raise the arches".
   - Each step loads on demand, at 14–135 kB.
   - Lock and scale keep working while it plays.
5. **Options**:
   - **Look:**
     - **Flat:** the plain colours.
     - **Blender-baked:** seamless tiles baked from the Cycles shaders used for the photoreal stills. Spruce, darker spruce for layer B, treated wood, galvanized steel, and twinwall flutes as a normal map.
     - **Photo wood:** a cleaned strip of Poly Haven's "Hinoki Planks" scan (CC0).
   - **Contact shadows:** an ambient-occlusion lightmap baked in Blender, for the Finished and Frame models.
   - **Room reflections:** the phone's light estimate as the reflection map, when the phone grants it.

It uses an `immersive-ar` session with hit-test (required) plus dom-overlay, anchors and light-estimation (optional). Without AR support the page falls back to the 3D preview.

## In your backyard: `yard.html`

Life size, 1:1 on your lawn ([model-viewer](https://modelviewer.dev) 4.3.1, Scene Viewer). It offers the same three looks, each as a separate core-glTF file so Scene Viewer shows it too. You need a clear area of about 6 × 8 m.

## Files

- `greenhouse.glb` and `frame.glb`: flat colours, wood UVs in metres along the grain, a per-board shade (COLOR_0), and the AO lightmap on TEXCOORD_1. The `-baked` and `-photo` versions embed their textures.
- `steps/<id>.glb`: the 15 animated assembly steps. Draco geometry, resampled tracks.
- `tex/`: the look textures (JPG; roughness in G and metalness in B, as glTF expects).
- `grain.js`: the grain-aligned UVs, shared by the build scripts and the page.

All models are in metres and stand on y = 0. A planning model, not a structural design.
