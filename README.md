# Cinch — cable clip generator

A parametric cable clip generator for 3D printing. Pick what you're clipping onto, how thick the cable is,
and how the clip should hold, then download a ready-to-print STL. Everything runs in the browser.

Built with Vue 3 + TypeScript + Vite + Tailwind v4 + three.js (`manifold-3d` for the boolean ops, so the STL is watertight).

## Run it

```bash
pnpm install
pnpm dev
```

`pnpm build` typechecks and produces a static site in `dist/`.

## How it works

Three steps, one live preview (with a translucent "ghost" of your mount and cable so you can judge the fit):

1. **Mount**: round, square, rectangle, triangle, a **panel edge** (sheet, shelf, desk lip), or a **flat surface**.
2. **Cable**: diameter, and how many cables sit side by side (1–4).
3. **Hold**:
   - **Snap-on grip**: a ring with a funnel-shaped mouth (rounded lips that flare outward). Fit presets run from Loose to Very tight; the default is Tight, because the ring clamps by being slightly smaller than the mount.
   - **Bolt clamp**: a ring with two ears, an M3/M4 bolt hole and a nut pocket. Tightens as hard as you like on any pole.
   - **Strap-on**: a saddle with tunnels for a zip tie or velcro strap.
   - **Spring jaws** (panel edge).
   - **Ring holders** (flat surface): a plate with a snap-in ring per cable, taped, glued or screwed down.
   - **Snap channel** (flat surface): a stick-on plate with one sturdy rounded slot. Cables press in past two short flared lips. Nothing hinged or thin, so it is the toughest option.
   - **Slide-in hooks** (flat surface): a band standing off the plate, closed at one end and ending in a barbed lip at the other: push the cable in past the lip and it stays. Nothing is hinged.
   - **Arch clip** (flat surface): a stick-on plate with a hinged arch that clicks shut over the cables, like the adhesive cable clips sold in packs. Holds up to 4 cables (two rows beyond 3). It is one outline extruded along the cable, printed closed on its end, so the layers run around the arch.

**Fit-test strip:** "Print a fit test first" (bottom right of the preview) swaps the model for five short rings in your mount's shape, with Mount fit stepping ±0.1 mm around your current value and 1–5 dots to tell them apart. Print it, try each ring on the real mount, and copy the value of the one you like. Large mounts wrap onto extra rows so it fits a normal bed.

**Flat cords** (Cable step → Flat cord): every holder also takes a flat cord, such as the flat power cord on a TV. Give it a width and a thickness (the Samsung TV preset is about 7 × 2.5 mm, a typical size, so measure yours). The cord lies on its wide side: rings become flat ovals, the slide-in hook and closed loop are sized to its thickness and run along its width, and several cords stack in the slot, channel and arch instead of sitting side by side.

**Cable holders on a pole clip** (Cable step): *Rings around it* gives each cable its own small ring, spaced evenly around the clip with the pole's mouth left clear (one cable sits beside the clip like the twin-C clips sold for mic stands). *Pocket in the clip* is one continuous band: the clip's wall detours around the cable and the pocket opens toward the mount, so you drop the cable in, clip the whole thing on, and the mount itself holds the cable in. Because nothing needs to grip the cable, the pocket is made roomy and smooth automatically (at least 0.5 mm of play, an open side toward the mount, and a rounded outline that flows into the clip's wall). *Slide-in hook* is a curved band that hugs the clip, closed at one end and ending in a barbed lip at the other: push the cable in past the lip and it stays, because the lip squeezes the entrance narrower than the cable and its back face is steep. **Cable slot opening** sets how narrow (smaller holds harder). *Big square slot* groups all the cables in one roomy rounded slot that snaps shut over them. *Closed clip* is a thin, rounded loop wider than it is tall, its long side resting along the mount, closed at the top, with one side that curls outward into a small J-shaped lip at the base. Slide the cable in sideways along the pad under the lip: the long thin side springs outward to let it past, then the lip keeps it in. It starts opposite the mouth, like a handle on top of the clip (pull it back out the same way). **Cable slot opening** sets the gap under the lip, and the loop's width is chosen automatically so the long top bends under about 4%. Except for several plain rings (which spread out evenly), every style sits where you put it: **Where on the clip?** takes an angle measured clockwise from the mouth. A single cable, or the square slot, can open outward, the same way as the mount's mouth, or the opposite way. Panel edges and flat bases keep a row; the strap saddle fans the rings out from its pad, keeping clear of the strap.
The model is built standing on the bed (+Z = mount axis), so what you see is the recommended print orientation.
A flat base is laid on its back so the plate sits on the bed.

For snap-on clips the app also estimates how much the plastic stretches while the mount is pushed through the mouth
and warns when that gets high (a rough estimate, not a simulation).

## Projects

Nothing to remember: your work is autosaved in the browser, so reloading picks up where you left off. Click the
project button in the top bar to give it a name (Save), come back to it later, duplicate or delete it. A dot
next to the name means there are changes you have not saved yet.

A project can hold **several clips**, shown as tabs across the top, so the preview and everything in the side panel belong to the open clip. **Add clip** starts a new one as a copy of the
one you are on, so for a pole with two widths you build the first, add a clip and change only the diameter.
Add clip asks for a name right away (leave it empty to go by size); the pencil on the open tab renames it later, and the x removes it. **Download all** gives one STL per clip.

The same menu copies a link to the project (the settings travel in the part of the URL after `#`, which never leaves
the browser), exports it as a JSON file, backs up every project in one file, and imports either. STL file names start
with the project and clip names. Projects live in `localStorage`, so they are per browser and per computer: use the
backup file to move them. Saves from before clips existed open as a project with one clip.

## Code map

| File | What it does |
| --- | --- |
| `src/clip/profile.ts` | Rounded-polygon outlines for every mount shape; exact offsetting for walls and clearances |
| `src/clip/around.ts` | Spaces cable rings evenly around a mount's outline, clear of its mouth |
| `src/clip/rings.ts` | The ring builder: constant-thickness wall, square-cut rounded lips, flare, bolt ears; and panel jaws |
| `src/clip/fitTest.ts` | The fit-test strip builder |
| `src/clip/csg.ts` | Boolean helpers on manifold-3d (watertight results), plus the closed-mesh check used to retry builds |
| `src/clip/buildClip.ts` | Assembles the three layouts (row of rings, strap saddle, flat base) and the ghost meshes |
| `src/clip/channel.ts` | The snap channel (one thick-walled slot) and the flat slide-in hook |
| `src/clip/bridge.ts` | The arch clip (plate, hinged arch, catch post with lip, barb, lift tab); |
| `src/clip/cable.ts` | The cable's cross-section: round, or a flat cord lying on its wide side (room it needs, ring outline, preview shape) |
| `src/clip/loop.ts` | The pole clip's Closed clip holder: a thin rounded loop with a curled hook, on a pad (extruded along Z) |
| `src/projects.ts` | Autosave, named projects (each a list of clips), JSON files and share links; checks anything it loads against the defaults |
| `src/clip/exportStl.ts` | Binary STL download |
| `src/clip/types.ts` | Parameters, defaults, presets |
| `src/useClipViewer.ts` | three.js scene (Z-up, bed grid, orbit controls) |
| `src/App.vue`, `src/components/` | The wizard UI |
| `src/config.ts` | Support-button link and app name |

## Ideas for later

- Printed ratchet strap (a reusable zip tie)
- T-slot clip for 2020 extrusion
- Grip ribs inside the ring, and tie slots on the flat base

## License

Licensed under the [Apache License 2.0](LICENSE). Anything you print from it is yours.
