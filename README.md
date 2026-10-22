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

### Gus and Bolt

Two characters live around the greenhouse, in tabletop mode and in the walk mode (`table.html?walk`), which starts at life size. Tap either of them to talk.

- **Gus** (the gardener) works inside. He walks between six spots along the walls and at the doors. When you come close, he stops, waves and turns to face you. Tap him and he explains what he's working on.
- **Bolt** (the robot) runs round to whichever side of the model you're on.
  - At **life size** he follows you around the yard, about a step away. If you go inside, he waits in the porch, since the doors are shut.
  - He finds his way with A* on a 20 cm grid. The grid holds the greenhouse walls, plus real obstacles seen by WebXR depth sensing: depth points between 0.2 and 1.8 m above the ground mark a cell as blocked, and points on the floor clear it.
- **Moving them:** press on Gus or Bolt and drag to carry them somewhere else. This works while the model is locked, and in the 3D preview. At life size, walking into them pushes them aside.
  - While carried, they dangle against the way you drag them, with their legs going.
  - **Throwing:** flick and let go, and your finger's last speed becomes a throw. They fly under gravity, scaled so a throw feels the same on the table and in the yard, and bounce once. Walls, the edge of the pad and real obstacles bounce them back.
  - A soft landing gives a squash and a stretch. A hard landing, or a hard throw that flips them, knocks them down: the fall clip plays, then plays backwards to get them up.
  - Gus walks back to work through a doorway.
  - Bolt stays where you put him for 8 seconds. If you put him inside, he leaves through a door.
- **Depth sensing** (optional, `cpu-optimized`) also hides the model and the characters behind real things. To keep the floor from flickering:
  - The occlusion test is lenient near the model's ground plane, and more lenient with distance.
  - Depth is sampled bilinearly, steady readings are averaged over frames, and the cut edge is dithered.
  - Options can turn that off. It also has **Show what Bolt sees**, which draws the cells he considers blocked.
  - A chip at the top says whether depth is on.

**Sound** (`sound.js`) is all synthesized with Web Audio; there are no audio files.

- Gus babbles in Sims-style gibberish: a sawtooth voice through vowel formants, following the syllables and punctuation of his line. The speech bubble types out in time with it.
- Bolt chirps instead.
- There are effects for being picked up, thrown, landing (a thump for Gus, a metal clank for Bolt), bumped into, and for footsteps.
- Every sound comes from the character's position (HRTF panning). The Sound switch turns it all off.

`npc.js` holds both characters, the grid and the occlusion shader patch. `prep-npc.mjs` builds `npc/*.glb` from the CC0 sources:

- the Quaternius "Farmer" ([poly.pizza](https://poly.pizza/m/7pn3R6hPvE))
- Tomás Laulhé's "RobotExpressive", from the three.js examples, scaled to 0.6 m

## In your backyard: `yard.html`

Life size, 1:1 on your lawn ([model-viewer](https://modelviewer.dev) 4.3.1, Scene Viewer). It offers the same three looks, each as a separate core-glTF file so Scene Viewer shows it too. You need a clear area of about 6 × 8 m.

## Files

- `greenhouse.glb` and `frame.glb`: flat colours, wood UVs in metres along the grain, a per-board shade (COLOR_0), and the AO lightmap on TEXCOORD_1. The `-baked` and `-photo` versions embed their textures.
- `steps/<id>.glb`: the 15 animated assembly steps. Draco geometry, resampled tracks.
- `tex/`: the look textures (JPG; roughness in G and metalness in B, as glTF expects).
- `grain.js`: the grain-aligned UVs, shared by the build scripts and the page.

All models are in metres and stand on y = 0. A planning model, not a structural design.
