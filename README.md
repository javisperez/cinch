# Cinch — cable clip generator

Make a custom cable clip for 3D printing. Tell Cinch what you're clipping onto and how thick the cable is, preview
the result, and download a ready-to-print STL. It all runs in your browser: nothing to install, nothing uploaded.

**Try it: https://javisperez.github.io/cinch/**

## How it works

1. **Mount**: what the clip attaches to. A round, square, rectangular or triangular pole, the edge of a panel
   (sheet, shelf, desk lip), or a flat surface.
2. **Cable**: its diameter, and how many cables (1–4). Flat cords, like a TV power cable, work too.
3. **Hold**: how the clip grips.
   - **Snap-on grip**: pushes onto a pole and stays put. Pick a fit from Loose to Very tight.
   - **Bolt clamp**: tightens around a pole with an M3 or M4 bolt.
   - **Strap-on**: held by a zip tie or velcro strap.
   - **Spring jaws**: grips the edge of a panel.
   - **Flat surface options**: rings, a snap channel, slide-in hooks or an arch clip, all stuck or screwed down.

The preview shows a ghost of your mount and cable so you can judge the fit. The model is shown in the recommended
print orientation.

**Not sure about the fit?** Use **Print a fit test first** (bottom right of the preview). It makes a strip of five
short rings, each slightly looser or tighter than the last. Print it, try the rings on your real mount, and copy the
value of the one you like.

## Projects

Your work is saved automatically in your browser, so reloading picks up where you left off. Use the project button
in the top bar to name a project, come back to it later, duplicate it or delete it.

A project can hold **several clips** (shown as tabs), handy when a pole changes width. **Download all** gives you one
STL per clip. You can also copy a link to a project, or export and import projects as files. Projects stay in your
browser, so use the backup file to move them to another computer.

## Privacy

Your designs never leave your browser. The site can count visits and a few coarse actions (like which holder is
popular or that an STL was downloaded) through Google Analytics, but only if you accept the banner. No project names,
sizes, files or links are ever sent. You can change your mind with "Analytics settings" in the footer.

## For developers

Built with Vue 3, TypeScript, Vite, Tailwind and three.js.

```bash
pnpm install
pnpm dev
```

`pnpm build` typechecks and produces a static site in `dist/`. Pushes to `main` are published to GitHub Pages by
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) (one-time setup: Settings → Pages → Source: GitHub
Actions). Pages serves the site from `/cinch/`, which the workflow sets through `BASE_URL`; to check that build
locally, run `BASE_URL=/cinch/ pnpm build && pnpm preview`.

## License

Licensed under the [Apache License 2.0](LICENSE). Anything you print from it is yours.
