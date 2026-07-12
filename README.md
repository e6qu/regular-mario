# Regular Mario

A faithful, from-scratch reproduction of a classic 8‑bit side-scroller —
built as a **deterministic, pure-function simulation** with a **Phaser + Vite**
browser shell, and shipped with an **entirely original art skin** ("Shabby
Castaway") playing the **original level layouts**.

The public build ships **no copyrighted graphics or audio** — only original
authored art, numeric level data, code, and reverse-engineering notes. The
faithful ROM-extracted skin runs **locally only**, from a ROM you supply
yourself (see [Faithful ROM mode](#faithful-rom-mode-local-only)).

> **Play:** deploys to GitHub Pages on every push to `main`
> (`https://<your-user>.github.io/<repo>/`).

## Controls

| Key          | Action                           |
| ------------ | -------------------------------- |
| ← / →        | Move                             |
| Space / ↑    | Jump (variable height)           |
| Shift (hold) | Run                              |
| ↓            | Enter pipe                       |
| X            | Throw fireball (fire tier)       |
| P            | Pause + open the replay timeline |
| R            | Retry                            |

On a phone or tablet, an on-screen D-pad (◀ ▼ ▶) plus **A** (jump) / **B** (run +
fireball) appears automatically, so the game is playable without a keyboard.

## Features

- **Faithful mechanics** — small ↔ powered ↔ fire tiers, breakable bricks,
  question/multi-coin blocks, coins and the classic scoring paths, stomp/shell/
  star/fireball kills, extra lives, goombas and kickable sliding shells with
  gravity, enterable pipes, and a flagpole finish with slide.
- **Original level layouts** — every area is decoded from the game's own numeric
  level data into the engine grid; pick any level from the start menu.
- **Two skins** — the original authored "Shabby Castaway" pixel art (public), and
  a faithful ROM-extracted skin (local only). Skin × map are chosen independently.
- **Level editor** — build levels in the browser: paint, flood-**fill**, and
  **rectangle** tools, **undo/redo** (`Ctrl+Z`/`Ctrl+Y`), number-key brush
  selection, and a **minimap** for navigating large levels. Load any shipped map
  as an editable **template**, resize both axes, pick a skin and enemy types,
  play-test (ESC returns to the editor), and **save/download/share** a level via
  a URL. Reach it from the start menu's "Create / upload level".
- **Plays on desktop and mobile** — keyboard on desktop; auto on-screen touch
  controls on phones/tablets.
- **Window-filling viewport** with integer camera zoom (crisp, never stretched).
- **Replay timeline** — pause with `P`, or land here automatically on any death,
  pit, time-out, or level end. It's a little video editor: Play/Pause the
  recording at 60fps, scrub with the arrows or the track, step frame-by-frame,
  and export the run as a replayable `run.json` or a `.zip` with screenshots.
  A `run.json` replays pixel-for-pixel headlessly
  (see [`docs/run-recording-format.md`](docs/run-recording-format.md)).

## Content boundary (what's public vs local)

This project is careful about copyright. The line:

- **Public (in this repo):** all code; the original authored skin (pixel sprites
  generated deterministically at build time from a committed script); the
  **numeric** level layouts (tile indices, coordinates, timings — no graphics or
  audio bytes); the reverse-engineering docs; and the extraction/decoder scripts.
- **Local only (git-ignored, never committed):** the NES ROM, every ROM-extracted
  sprite/tile/audio output, and any original-game reference capture. These live
  under `.cache/user-levels/` and are produced from a ROM you supply.

## Reverse-engineering notes & sources

The numeric level decoder and the extraction tooling are documented, with their
public sources cited:

- [`docs/smb-level-format.md`](docs/smb-level-format.md) — the level-data format
  (pointer tables, object/enemy stream layout) used by the decoder.
- [`docs/decisions/`](docs/decisions/) — architecture and content-policy
  decision records (see `0018` and `0019` for asset acquisition and content
  sets).

Primary public references used:

- **SMBDIS.ASM** disassembly (doppelganger / 1wErt3r, gist `1wErt3r/4048722`) —
  the object/enemy stream and pointer-table facts.
- **NESdev Wiki** (<https://www.nesdev.org/wiki/>) — NROM / iNES header, PPU/APU.
- **The Video Game Level Corpus** (<https://github.com/TheVGLC/TheVGLC>) — a
  public research corpus of level layouts, used to cross-check the decoder.

## Build & run locally

```bash
pnpm install
pnpm run dev            # dev server at http://127.0.0.1:5177

pnpm run build:release  # static site into dist/ (authored skin + levels + sound)
pnpm run preview        # serve the built site
```

The release build (`build:release`) needs **no ROM**: it generates the authored
skin, composes it with the committed numeric level layouts, synthesizes the
sound, and writes `public/game-content/`, then runs `vite build`. The output in
`dist/` is a plain static site (this is what GitHub Pages serves).

### Faithful ROM mode (local only)

To play the ROM-extracted skin locally, supply your own legally-obtained ROM and
run the extraction pipeline — nothing it produces is ever committed:

```bash
SMB_ROM=/path/to/your.nes pnpm run prepare:smb
pnpm run dev            # the "rom-smb" skin now appears in the start menu
```

## Deploy

`.github/workflows/deploy-pages.yml` builds `build:release` and publishes `dist/`
to GitHub Pages on every push to `main`. Enable it once under
**Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Documentation

- [`CONTRIBUTING.md`](CONTRIBUTING.md) — how to build, test, and contribute.
- [`docs/architecture.md`](docs/architecture.md) — the stack, the
  functional-core / imperative-shell split, entry points, and module map.
- [`docs/terminology.md`](docs/terminology.md) — glossary and the mapping from
  the engine's abstract actor roles to Super Mario Bros. names.
- [`docs/run-recording-format.md`](docs/run-recording-format.md) — replay and
  export format.
- [`docs/smb-level-format.md`](docs/smb-level-format.md) — the numeric level-data
  decoder reference.
- [`docs/decisions/`](docs/decisions/) — architecture and content-policy
  decision records.

## Development

Quality gates (all run in `pnpm run check`): `typecheck`, `lint`, `format:check`,
`dead-code` (knip), `copy-paste` (jscpd), unit tests (`test`), and browser tests
(`test:browser`). Full contributor guidance — setup, testing, coding
conventions, and the content boundary — is in
[`CONTRIBUTING.md`](CONTRIBUTING.md).

To compare rendering backends, append `?renderer=canvas`, `?renderer=webgl`, or
`?renderer=auto` to the URL (the default is Canvas); the choice persists across
navigation. See [`docs/architecture.md`](docs/architecture.md#renderer-canvas--webgl).

## License

[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.en.html). Original
authored art and code only; no third-party game assets are included.
