# Architecture

This document explains how the codebase is organized: the technology stack, the
functional-core / imperative-shell split, the runtime entry points, and where
each responsibility lives. Read it before making non-trivial changes. For the
vocabulary used here (Goomba, Koopa, `LevelSpec`, hurtbox, etc.) see
[`terminology.md`](terminology.md).

## Stack

- **TypeScript** — all application and engine code.
- **Vite** — development server and production bundler.
- **Phaser** — browser rendering, scenes, input, camera, and asset loading. Used
  only in the shell; the engine never imports it.
- A **custom fixed-step simulation** — movement, collision, actors, enemies,
  blocks, scoring, and rules. Deterministic and framework-free.
- **Vitest** — unit and integration tests (Node environment).
- **Playwright** — browser tests (boot, rendering, input, screenshots).

## Functional core, imperative shell

The code is split into two layers with dependencies pointing **inward**, toward
stable domain types:

- **Functional core** (`src/engine/`) — a deterministic, pure-function
  simulation. Given the same inputs it always produces the same output, with no
  reliance on wall-clock time, randomness outside the seeded generator, or
  browser APIs. This is what makes replays reproduce pixel-for-pixel (see
  [`run-recording-format.md`](run-recording-format.md)).
- **Imperative shell** (`src/shell/` and `src/main.ts`) — everything impure:
  Phaser rendering, keyboard/touch input, audio synthesis, persistence, the
  level editor, routing, and asset loading. The shell reads the core's output
  each frame and draws it; it never contains game rules.

No Phaser (or other framework) object is required to test the core.

## Entry points

The runtime boots in this order:

1. **`index.html`** loads the single module entry `src/main.ts`.
2. **`src/main.ts`** is the shell's top level. It sets up routing (each screen is
   a shareable URL hash), the start menu (`renderStartMenu`), the level editor
   (`renderEditor`), and game **sessions**. A session pairs a Phaser game with a
   level; several can be suspended and resumed via the session bar.
3. **`src/shell/create-game-config.ts`** (`createGameConfig`) builds the Phaser
   game config, including the renderer choice (see
   [Renderer](#renderer-canvas--webgl) below), and registers the single scene.
4. **`src/shell/scenes/boot-scene.ts`** (`BootScene`) is the running game. Its
   `create` builds the level's Phaser objects; its `update` runs once per frame:
   it reads input, calls the core's `stepSimulation`, and renders the returned
   state.
5. **`src/engine/simulation/step-simulation.ts`** (`stepSimulation`) is the
   core's single entry point:
   `stepSimulation(state, inputCommand, movementConstants, levelSpec)` returns
   the next `SimulationState`.

## The engine (`src/engine/`)

### `domain/`

Stable types shared across the whole project. Highlights:

- **`level-spec.ts`** — `LevelSpec`, the validated in-memory level (tiles, actor
  placements, timers, spawners) that both the simulation and the renderer read.
  `ActorRole` enumerates the actor categories (see the
  [terminology mapping](terminology.md#actors-actorrole--super-mario-bros-names)).
- **`units.ts`**, **`brand.ts`**, **`identifiers.ts`** — branded types for
  pixels, tiles, frames, velocities, scores, and entity IDs, so a pixel value
  can never be passed where a tile value is expected.
- **`result.ts`**, **`validation-error.ts`** — explicit success/failure results;
  parse and validation failures are first-class domain errors, never thrown
  silently.
- **`content-sets.ts`** — the split between an **asset set** (the visual/audio
  skin) and a **map set** (the level layouts), which are chosen independently.

### `simulation/`

The deterministic core, one concern per file (~45 modules). `stepSimulation`
composes them in a fixed order each frame. Representative modules:

- **`step-simulation.ts`** — the per-frame orchestrator and public entry point.
- **`simulation-state.ts`** — `SimulationState`, the complete snapshot of one
  frame (player, enemies, blocks, projectiles, timer, score, RNG, and more),
  including the session-persistent life count and coin base (see
  [Session-persistent state](terminology.md#session-persistent-state-lives-coins-and-score)).
- **`movement-model.ts`**, **`horizontal-movement.ts`**,
  **`vertical-movement.ts`**, **`position-movement.ts`** — the player movement
  and jump model.
- **`enemy-motion.ts`**, **`enemy-interaction.ts`**,
  **`enemy-contact-response.ts`** — enemy locomotion and stomp/contact
  resolution.
- **`collectible-interaction.ts`**, **`power-up-interaction.ts`**,
  **`interactive-block-state.ts`**, **`breakable-block-state.ts`** — coins,
  power-ups, and blocks.
- **`projectile-state.ts`**, **`timed-hazard-projectile-state.ts`** — fireballs
  and cannon/thrown hazards.
- **`pipe-state.ts`**, **`level-timer-state.ts`**, **`player-outcome.ts`** —
  pipe entry, the countdown, and win/lose resolution.
- **`pseudo-random.ts`** — the seeded generator modeling the original's
  pseudo-random bit register, so RNG-driven events (frenzies, hops) replay
  exactly.
- **`game-score.ts`**, **`sound-events.ts`** — scoring and the per-frame sound
  event derivation the shell consumes.

### `levels/`

Level construction and import. `level-builder.ts` assembles a `LevelSpec`; the
`*-route-level.ts` files are hand-built test/demo levels; `import/` holds the
importers (Tiled JSON, VGLC text, and the Super Mario Bros. numeric decoder) and
their compatibility-conformance checks. See
[`smb-level-format.md`](smb-level-format.md) for the numeric level-data format.

## The shell (`src/shell/`)

- **`scenes/boot-scene.ts`** — the running game scene: builds level objects,
  steps the simulation, renders it, and owns the HUD, flow screens, replay
  overlay, touch controls, and the shabby death effects (see
  [`game-feel/death-effects-and-feedback.md`](game-feel/death-effects-and-feedback.md)).
  The player is always drawn as an authored sprite — there is no procedural
  vector-rectangle player — so every game (including the debug `?browserLevel=`
  routes) loads a skin. Tiles and non-player actors still fall back to procedural
  shapes when a skin does not cover them.
- **`create-game-config.ts`** + **`select-renderer.ts`** — Phaser game config and
  the renderer choice.
- **`game-audio.ts`** — WebAudio synthesis of the ROM-decoded music themes and
  sound effects.
- **`level-editor.ts`** — the in-browser editor (paint/fill/rectangle tools,
  undo/redo, minimap, templates, save/share).
- **`run-recorder.ts`**, **`run-timeline-overlay.ts`**, **`run-export.ts`** — the
  replay recorder, the pause/timeline UI, and `run.json` / `.zip` export (see
  [`run-recording-format.md`](run-recording-format.md)).
- **`browser-level-selection.ts`**, **`content-set-index.ts`**,
  **`user-asset-loader.ts`** — content-set resolution and user-asset import.
- **`browser-debug-api.ts`** — the `window.__originalBrowserPlatformerDebug`
  snapshot API that browser tests read.

## Renderer (Canvas / WebGL)

Phaser ships both a Canvas-2D and a WebGL renderer, selected by config.
`select-renderer.ts` resolves the choice from the start menu's **Renderer**
dropdown or a `?renderer=canvas|webgl|auto` URL parameter (both persisted to
`localStorage`), defaulting to **Canvas** and applied to the next game created.
Because the scene code is identical under both, loading the same URL once each
way gives an exact A/B for rendering fidelity. WebGL and Auto set
`preserveDrawingBuffer` so the run-thumbnail readback keeps working after
compositing; a lost WebGL context is recovered by Phaser's built-in restore (see
[decision 0020](decisions/0020-webgl-renderer-evaluation.md)).

## Data flow per frame

```
keyboard / touch ─▶ SimulationInputCommand
                         │
      BootScene.update ──┼─▶ stepSimulation(state, input, constants, levelSpec)
                         │            │
                         │            ▼
                         │      next SimulationState  (pure; no side effects)
                         ▼            │
      render the state ◀─────────────┘
      derive SoundEvents ─▶ GameAudio
      record the frame  ─▶ RunRecorder
```

## Related documents

- [`terminology.md`](terminology.md) — glossary and Super Mario Bros. name
  mapping.
- [`run-recording-format.md`](run-recording-format.md) — replay/export format.
- [`smb-level-format.md`](smb-level-format.md) — numeric level-data decoder
  reference.
- [`game-feel/death-effects-and-feedback.md`](game-feel/death-effects-and-feedback.md)
  — the shell's cause-specific death animations, sounds, and haptics.
- [`decisions/`](decisions/) — architecture and content-policy decision records.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — how to build, test, and contribute.
