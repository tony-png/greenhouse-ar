# Greenhouse AR · VR

The v2 tunnel greenhouse (two-ply 2x6 polygon arches, every cut at 15°; `redesign/proposal-v2.md` in the project) in augmented reality on an Android phone or a Meta Quest, and in a VR backyard on a Quest.

**https://tony-png.github.io/greenhouse-ar/**: pick a mode.

## The model: `v2.js`

The greenhouse is built in the page from the v2 geometry; there is no model file to load.

- **Ribs**: 5 ribs at 1.2 m. Each has two plies of 2x6 (38 × 140), each a regular polygon with a 30° step on R = 1.80 m centred 0.95 m up; ply B is turned 15°. 11 identical segments, 2 A legs, 2 B legs.
- **Fixings**: 12 overlap zones per rib, each with 2 carriage bolts and 6 structural screws.
- **Feet**: PT 2x8 boards from 1.2 m down to 0.6 m up, with 3 bolts, a belled concrete plug and crushed stone.
- **Collars and purlins**: a collar-tie pair at 2.15 m, 12 purlins on the X points, 2 eaves rails.
- **Bracing**: CS16 X-straps and leg braces in bays 1–2 and 4–5.
- **End walls**: doubled hanging door posts, girts, a sole plate, kicker stubs, and a vent sash on the outer collar. Sliding barn doors on a track run at both ends.
- **Dwarf walls and cladding**: 4-course dwarf walls on the long sides and 2 on the ends. 12 uncut roof sheets with H-channel, plus gable sheets.
- **Extras**: a gravel pad flush with the ground and a few tomato plants.

`buildStatic("greenhouse" | "frame")` returns it merged by material. Transparent parts stay separate so they sort by distance. `buildAssembly()` returns the build as 14 animated steps. Each unit has named poses and keyframes, so any step can be scrubbed: cut, lay ply A, ply B, bolt, feet (on a soil cut-away), stand the ribs (lifted from a build spot beside the pad into their feet, rib 5 first), collars, purlins, bracing, end walls, dwarf walls, cladding, doors and finished.

Material names follow `grain.js`, so the three looks apply as before.

## On your table: `table.html`

A scale model you place on a table (WebXR, three.js r186). The same controls work in the 3D preview.

### Phone

1. Point the phone at a table until the ring appears, then tap to place it. It starts at 1:20, about 29 cm long.
2. Drag to slide it, pinch to resize (1:100 up to life size), twist to turn it, or use the scale buttons.
3. Tap **Lock** to freeze it (it is anchored to the world), then walk around it.
4. **Finished / Frame / Assembly**, and **Options**: the look (Flat, Blender-baked, Photo wood), room reflections, characters, sound, depth occlusion and Bolt's view.

The session uses `immersive-ar` with hit-test (required) plus dom-overlay, anchors, light-estimation and CPU depth sensing (optional).

### Meta Quest (passthrough AR)

The session uses `local-floor`, with hit-test, anchors, hand tracking, mesh and plane detection and GPU depth sensing, all optional. There is no DOM overlay on a headset, so `xr.js` draws everything in the scene.

- **Placing**: point a controller or hand and pull the trigger (or pinch). The target comes from a hit-test on that controller's ray. Without a hit, it falls back to the floor plane, which also works outdoors without a room scan.
- **Moving and sizing**: trigger-drag to slide it. Both grips, or pinching with both hands, resize and turn it. A single grip carries it with your hand. The thumbstick turns and resizes it. **B**/**Y** locks it.
- **Menu**: the same controls as the phone, drawn on a canvas. It appears above your left hand when you look at it. **A**/**X** pins it in front of you. Press its buttons with the ray.
- **Hints and speech**: the hint line follows you lazily, and the speech bubbles float over Gus and Bolt.
- **Real objects**: with a room scan, the room mesh and planes go into Bolt's obstacle grid at life size. Depth occlusion is three.js's GPU path. The gravel is exempt so it doesn't flicker against the real floor.

### Quest VR backyard (`table.html?vr` leads with it)

- **The scene**: `immersive-vr` with `local-floor`. `vryard.js` generates a sky, a lawn, a gravel path to the front door, a fence and trees. The greenhouse is at life size and you start on the path.
- **Moving**: the left stick walks, the right stick snap-turns, and trigger or pinch on the grass teleports. This all goes through an offset reference space (`Rig`).
- **Hands and characters**: controller and hand models show in VR only. Gus and Bolt behave as at life size.

### Flicker fixes (v2)

- The gravel is flush with the ground.
- The contact shadow, the characters' blob shadows and the reticle draw with a polygon offset.
- The shadow camera snaps to whole texels in light space.
- The phone's light-estimate direction is smoothed.
- Depth occlusion starts off.
- The VR lawn sits 1 cm under the pad, with no overlay planes.

### Gus and Bolt

These work as before (`npc.js`), with the v2 footprint: walls at x = ±1.9 and end walls at z = ±2.44, doors at both ends, no porch. Gus works at six spots inside and talks about the v2 build. Bolt follows you, routes round the greenhouse with A* on a 20 cm grid, and at life size round real obstacles: CPU depth on a phone, the room scan on a Quest. Carry and throw them with a finger, the mouse, or a controller ray (hold the trigger, flick and let go).

## In your backyard: `yard.html`

Life size, 1:1 on your lawn, with [model-viewer](https://modelviewer.dev) 4.3.1 and Scene Viewer, on Android phones. `build-v2.mjs` (in the parent `ar/` folder) exports the v2 GLBs from `v2.js`: `greenhouse.glb` and `frame.glb`, plus `-baked` and `-photo` versions with embedded textures.

## Checks (in the parent `ar/` folder)

- `node check-site.mjs <url>`: every page, the preview, looks, the assembly player, and the characters.
- `node xr-check.mjs <url>`: the page under Meta's WebXR emulator (IWER, Quest 3) checks headset AR (place, thumbstick, trigger-drag, menu pin and press, lock) and VR (start spot, walking, teleport).
- `node v2-check.mjs`: the generator in Node, with part counts, bounds and step lengths.

All models are in metres and stand on y = 0. A planning model of the v2 design, not a structural drawing.
