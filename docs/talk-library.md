# regular-mario: talk mode as a library

Plays a presentation as an original platformer level: one room per slide, the
slide's text on a sign, its props, pictures and diagrams drawn in the room, and
per-world scenery and music. The talk script is the JSON written by
[e6qu.github.io](https://github.com/e6qu/e6qu.github.io)'s deck builder from a
deck's `slides.md`.

## Install

Each release attaches the package to its GitHub Release. Pin the exact tarball,
and install Phaser (a peer dependency) at the version the package names:

```json
"dependencies": {
  "regular-mario": "https://github.com/e6qu/regular-mario/releases/download/v0.1.0/regular-mario-0.1.0.tgz",
  "phaser": "4.2.0"
}
```

## Use

```js
import { mountTalk } from "regular-mario";

const talk = await mountTalk(element, talkJson, {
  slide: 12, // 1-based; default 1
  onSlideChange: (slide) => {}, // the castaway entered another slide's room
  onExit: () => {}, // the player chose Exit in the game's pause menu
});
talk.goTo(13);
talk.dispose(); // stops the game and removes what it added to the page
```

- `element` needs a size; the game fills it. The slide bar and the screen
  reader's live region are added to it too.
- `mountTalk` rejects with a `TalkScriptError` if the script is invalid, or an
  `Error` if the artwork can't be loaded.
- The artwork is `talk-skin.json`, next to the module. Bundlers that handle
  `new URL("./talk-skin.json", import.meta.url)` (Vite, Rollup, webpack 5,
  esbuild with a plugin) copy it into the build. `skinUrl` overrides where it is
  fetched from.
- Sounds and music are synthesised; the M key or the slide bar mutes them.

`regular-mario/talk-script` exports `parseTalkScript`, `TalkScriptError` and the
format's types without Phaser, so a build step in Node can validate a talk.

## Keys

← → move, Space jumps, Shift runs, PageDown/PageUp go to the next or previous
slide, and typing a slide number then Enter goes to it.

## Build and release

`pnpm run build:talk-library` writes the package to `lib-dist/`. Pushing a
`v*` tag runs `.github/workflows/release-talk-library.yml`, which builds it,
packs it with `npm pack` and attaches the tarball to that tag's GitHub Release.

## License

AGPL-3.0-or-later, like the game. A page that bundles this library conveys it
under that license.
