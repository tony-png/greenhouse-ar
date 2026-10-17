# Greenhouse AR

See the wooden lattice-rib tunnel greenhouse in augmented reality, in Chrome on an ARCore Android phone.

**https://tony-png.github.io/greenhouse-ar/**: pick a mode.

## On your table: `table.html`

A scale model you place on a table (WebXR, three.js r186).

1. Point the phone at a table until the ring appears, then tap to place it. It starts at 1:20, about 29 cm long. Tap again to re-place it.
2. Drag to slide it, pinch to resize (1:100 up to life size), twist two fingers to turn it, or use the 1:50 / 1:20 / 1:10 / Life size buttons.
3. Tap **Lock** to freeze its position, rotation and scale (it is anchored to the world), then walk around it. **Unlock** to adjust again.
4. **Finished / Frame** switches between the clad greenhouse and the bare arches and purlins.

The page uses an `immersive-ar` session with hit-test (required) plus dom-overlay, anchors and light-estimation (optional). Without AR support it falls back to a 3D preview.

## In your backyard: `yard.html`

Life size, 1:1 on your lawn ([model-viewer](https://modelviewer.dev) 4.3.1, Scene Viewer). Walk around it and step inside. You need a clear area of about 6 × 8 m.

## Files

- `greenhouse.glb`: the finished greenhouse (polycarbonate cladding, end walls, door, dwarf walls, bolts) on its 4.7 × 5.9 m gravel pad
- `frame.glb`: the arches and purlins only
- Units are metres. The model stands on y = 0 and is Draco-compressed (about 110 kB each).

A planning model, not a structural design.
