# Developer Guide

The front door to the codebase: **start here**, then follow the links. This guide
maps every directory to its responsibility, traces the boot sequence from
`index.html` to a running frame, explains the engine part by part, and indexes
every other document. It complements [`architecture.md`](architecture.md) (the
architectural reference) — this guide is the _map_, that one is the _rationale_.

New to the project? Read in this order:

1. [`../README.md`](../README.md) — what it is, how to play, how to build.
2. This guide — the code map and the engine walkthrough.
3. [`architecture.md`](architecture.md) — the functional-core / imperative-shell
   split and per-frame data flow, in prose.
4. [`terminology.md`](terminology.md) — the vocabulary (Goomba, Koopa,
   `LevelSpec`, hurtbox) and the engine-role → Super Mario Bros. name mapping.
5. [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — setup, the quality gates, and
   coding conventions before you open a change.

```bash
pnpm install
pnpm run dev      # dev server at http://127.0.0.1:5177
pnpm run check    # the full pre-merge gate (typecheck, lint, tests, policies)
```

---

## The mental model in 60 seconds

The code is split into two layers, dependencies pointing **inward**:

- **Functional core** — [`src/engine/`](../src/engine/). A deterministic,
  pure-function simulation: same inputs → same output, every time. No wall-clock
  time, no `Math.random`/`Date.now`, no browser APIs. This is what lets replays
  reproduce pixel-for-pixel. It never imports Phaser.
- **Imperative shell** — [`src/shell/`](../src/shell/) and
  [`src/main.ts`](../src/main.ts). Everything impure: Phaser rendering, keyboard/
  touch input, audio synthesis, persistence, the level editor, routing, and asset
  loading. The shell reads the core's output each frame and draws it; it holds
  **no game rules**.

The whole game is one function stepped once per frame:

```
stepSimulation(state, inputCommand, movementConstants, levelSpec) → next state
```

Everything else — rendering, sound, the menu, the editor, the content pipeline —
exists to feed that function inputs and draw its output.

---

## Boot sequence (entry points)

The runtime boots in this order; follow the chain to see how a keypress becomes a
rendered frame.

| #   | File                                                                                      | Symbol                                          | Role                                                                                                                                                          |
| --- | ----------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | [`index.html`](../index.html)                                                             | —                                               | Loads the single module entry.                                                                                                                                |
| 2   | [`src/main.ts`](../src/main.ts)                                                           | `applyRoute`, `renderStartMenu`, `startSession` | The shell's front controller: hash routing, the start menu, the editor host, content loading, and game **sessions** (several games can be suspended/resumed). |
| 3   | [`src/shell/browser-level-selection.ts`](../src/shell/browser-level-selection.ts)         | `selectBrowserGameBootstrap`                    | Resolves which level + config to boot from the URL.                                                                                                           |
| 4   | [`src/shell/create-game-config.ts`](../src/shell/create-game-config.ts)                   | `createGameConfig`                              | Builds the Phaser `GameConfig` (renderer, pixel-art scaling, `preserveDrawingBuffer` for thumbnails) and registers the single scene.                          |
| 5   | [`src/shell/scenes/boot-scene.ts`](../src/shell/scenes/boot-scene.ts)                     | `BootScene`                                     | The running game. `create()` builds the level's Phaser objects; `update()` runs once per frame — reads input, calls `stepSimulation`, renders the result.     |
| 6   | [`src/engine/simulation/step-simulation.ts`](../src/engine/simulation/step-simulation.ts) | `stepSimulation`                                | The engine's sole **state-advancing** entry point (defined here; the game loop calls it in `BootScene.update`). Everything it touches is pure.                |

Each frame, the shell turns input into a `SimulationInputCommand`, calls
`stepSimulation` to get the next (pure) `SimulationState`, then renders it,
derives `SoundEvent`s for `GameAudio`, and records the frame for replay. The
[per-frame data-flow diagram](architecture.md#data-flow-per-frame) draws this out.

"Sole entry point" means state-advancement, not imports. `BootScene` imports two
dozen engine modules, but only for their **types**, **read-only accessors** (e.g.
`requireEnemyActorState` to read an enemy's position while drawing it), and
**pure derivations** used for rendering/audio (`resolveSoundEvents`, sprite
selection). The one call that runs game rules and produces the next
`SimulationState` is `stepSimulation` — also the only engine call in the run
recorder ([`run-recorder.ts`](../src/shell/run-recorder.ts)) and the replay
fixtures ([`replay-fixture.ts`](../src/engine/simulation/replay-fixture.ts)).

---

## Repository map

```
regular-mario/
├─ index.html                  # single module entry → src/main.ts
├─ src/
│  ├─ main.ts                  # shell front controller: routing, menu, sessions, content loading
│  ├─ engine/                  # ── FUNCTIONAL CORE (pure, deterministic, no Phaser) ──
│  │  ├─ domain/               #   value types, branded units, validation, LevelSpec
│  │  ├─ simulation/           #   the per-frame game logic (~47 modules) — stepSimulation
│  │  └─ levels/               #   authored level fixtures + external-format importers
│  │     └─ import/            #     VGLC text, VGLC-SMB, Tiled JSON, compatibility checks
│  └─ shell/                   # ── IMPERATIVE SHELL (Phaser, DOM, audio, persistence) ──
│     └─ scenes/boot-scene.ts  #   the one big Phaser scene: bridges engine ↔ rendering
├─ scripts/                    # content pipeline: ROM decode/extract, asset+map builders, sprites, policy checks
├─ public/game-content/        # generated static release content (git-ignored; built by scripts)
├─ tests/browser/              # Playwright browser tests (+ tests/support/)
└─ docs/                       # this guide, architecture, terminology, formats, decisions, QA, agents
```

Unit tests live **next to the code** they cover (`src/**/*.test.ts`, run by
Vitest in Node). Browser tests live in `tests/browser/*.spec.ts` (Playwright).

---

## The engine, part by part

Three layers under [`src/engine/`](../src/engine/): `domain/` (vocabulary),
`simulation/` (frame logic), `levels/` (fixtures + importers). All pure and
immutable — `stepSimulation` takes state and returns new state.

### `domain/` — value types, branded units, validation

The vocabulary layer: types, smart constructors, and validators shared by
everything above. No frame logic; never imports from `simulation/`.

- [`brand.ts`](../src/engine/domain/brand.ts) — `Brand<Value, Name>`, the nominal-typing primitive that makes a `PixelPosition` un-interchangeable with a raw `number`.
- [`units.ts`](../src/engine/domain/units.ts) — all branded scalar units + validating constructors: `FrameIndex`, `PixelPosition/Distance/Delta`, `TileCoordinate`, `VelocityPixelsPerSecond`, `AccelerationPixelsPerSecondSquared`, `FrameDurationMilliseconds`, `ColliderDimensionPixels`, `TilePoint`, …
- [`identifiers.ts`](../src/engine/domain/identifiers.ts) — branded id types `TileId`, `ActorId`, `EntityId` and their validated constructors.
- [`result.ts`](../src/engine/domain/result.ts) — `DomainResult<Value, Failure>` (`{ ok: true, value }` / `{ ok: false, errors }`) + `succeed()`/`fail()`; the error-handling idiom used instead of exceptions for construction/validation.
- [`validation-error.ts`](../src/engine/domain/validation-error.ts) — `ValidationError`, `ValidationErrorCode`, `makeValidationError()`; the failure payload in a `DomainResult`.
- [`level-spec.ts`](../src/engine/domain/level-spec.ts) — the central authored-level model: `LevelSpecInput` (raw) → validated `LevelSpec`; enums `TileCollisionKind`, `ActorRole`; inputs for tiles, actors, vine/fall transitions, loop zones, platforms, frenzies, firebars, podoboos, hazard spawners. Everything reads this. See [`terminology.md`](terminology.md#actors-actorrole--super-mario-bros-names).
- [`compatibility-profile.ts`](../src/engine/domain/compatibility-profile.ts) — `CompatibilityProfile`, overridable physics-constant ids so an imported level can tune the engine toward a target ROM's behavior.
- [`content-sets.ts`](../src/engine/domain/content-sets.ts) — build-time split of visual/audio **asset set** vs level **map set**, composed into a runtime manifest. See [decision 0019](decisions/0019-local-asset-and-map-sets.md).
- [`user-asset-manifest.ts`](../src/engine/domain/user-asset-manifest.ts) — schema + deep validation (`parseUserAssetManifest`) for uploaded asset/level packs. See [decision 0013](decisions/0013-user-asset-import-boundary.md).
- [`game-title.ts`](../src/engine/domain/game-title.ts) — `GameTitle` branded type + constructor.

### `simulation/` — the deterministic core

Each subsystem follows the same shape: a `SubsystemState` type, a
`makeEmpty…`/`makeInitial…` constructor, an `assertValid…` runtime validator, and
a pure `resolve…`/`step…` transition. `stepSimulation` composes them in a fixed
order each frame.

**Orchestration & state**

- [`step-simulation.ts`](../src/engine/simulation/step-simulation.ts) — **the state-advancing entry point.** `stepSimulation(state, input, constants, levelSpec, coopInputs?)` advances one frame. Also owns the per-enemy damage debounce, stomp-rebound, hazard-damage tiering, and score/lives aggregation.
- [`simulation-state.ts`](../src/engine/simulation/simulation-state.ts) — `SimulationState`, the whole-world snapshot; `PlayerRuntime`/`SimulationPlayers` (uniform player array — index 0 is P1, 1..15 are co-op; `maxSimulationPlayers = 16`); the frame-0 constructors; `initialLivesCount = 3`.
- [`simulation-units.ts`](../src/engine/simulation/simulation-units.ts), [`input-command.ts`](../src/engine/simulation/input-command.ts) — the `nominalSixtyHertz…` frame duration + assert-and-brand helpers, and `SimulationInputCommand` (horizontal / jump / run / fire / up / down).
- [`movement-model.ts`](../src/engine/simulation/movement-model.ts), [`movement-measurements.ts`](../src/engine/simulation/movement-measurements.ts) — `MovementConstants` and the speed-indexed jump physics (tier latched at launch); metrics derived from the constants for tuning. See [decision 0005](decisions/0005-initial-movement-model.md) and [game-feel measurements](game-feel/current-movement-measurements.md).

**Player kinematics** — [`horizontal-movement.ts`](../src/engine/simulation/horizontal-movement.ts) (walk/run/friction), [`vertical-movement.ts`](../src/engine/simulation/vertical-movement.ts) (gravity, jump launch/cut), [`position-movement.ts`](../src/engine/simulation/position-movement.ts) (integrate velocity), [`climbable-interaction.ts`](../src/engine/simulation/climbable-interaction.ts) (vines/ladders), [`player-state.ts`](../src/engine/simulation/player-state.ts) (`PlayerSimulationState`, collider sizing, `resizePlayerForVitality`), [`player-tile-span.ts`](../src/engine/simulation/player-tile-span.ts) (which tiles the player overlaps).

**Terrain collision** — [`solid-tile-collision.ts`](../src/engine/simulation/solid-tile-collision.ts) (stops the player at walls/ground, reports block bumps from head-bonks), [`tile-collision-support.ts`](../src/engine/simulation/tile-collision-support.ts) (tile-set builders + lookup), [`tile-point-state.ts`](../src/engine/simulation/tile-point-state.ts) (tile-position validators).

**Blocks, collectibles, power-ups** — [`interactive-block-state.ts`](../src/engine/simulation/interactive-block-state.ts) (`?`-blocks + the spawned-actor system: items emerge from bumped blocks), [`breakable-block-state.ts`](../src/engine/simulation/breakable-block-state.ts) (bricks a big player shatters), [`collectible-interaction.ts`](../src/engine/simulation/collectible-interaction.ts) (coins/1-Ups), [`power-up-interaction.ts`](../src/engine/simulation/power-up-interaction.ts) (mushroom/flower/star), [`actor-collection-state.ts`](../src/engine/simulation/actor-collection-state.ts) + [`actor-interaction.ts`](../src/engine/simulation/actor-interaction.ts) (generic collect + per-actor collider sizes), [`player-actor-overlap.ts`](../src/engine/simulation/player-actor-overlap.ts) (the ROM-accurate object hurtbox, smaller than the terrain collider). See decisions [0011](decisions/0011-power-up-acquisition.md) and [0014](decisions/0014-interactive-blocks.md).

**Enemies** — [`enemy-motion.ts`](../src/engine/simulation/enemy-motion.ts) (per-role movement: patrol, flying, chasing, armored/koopa shells, throwing, aerial-throwing, piranha), [`enemy-interaction.ts`](../src/engine/simulation/enemy-interaction.ts) (stomp/contact outcomes + the consecutive-defeat score chain), [`enemy-contact-response.ts`](../src/engine/simulation/enemy-contact-response.ts) (side-contact knockback — see [decision 0008](decisions/0008-enemy-side-contact-response.md)), [`stomp-reaction.ts`](../src/engine/simulation/stomp-reaction.ts) (cosmetic burst), [`hatched-spiny-state.ts`](../src/engine/simulation/hatched-spiny-state.ts) (Lakitu eggs → Spinies).

**Projectiles & hazards** — [`projectile-state.ts`](../src/engine/simulation/projectile-state.ts) (player fireballs — see [decision 0015](decisions/0015-projectiles.md)), [`timed-hazard-projectile-state.ts`](../src/engine/simulation/timed-hazard-projectile-state.ts) (hammers, spiny eggs, Bullet Bills, cannon fire), [`flame-hazards.ts`](../src/engine/simulation/flame-hazards.ts) (firebars/podoboos — stateless, pure of `levelSpec` + frame index), [`cheep-frenzy-state.ts`](../src/engine/simulation/cheep-frenzy-state.ts) + [`aerial-frenzy-state.ts`](../src/engine/simulation/aerial-frenzy-state.ts) (RNG-driven frenzy spawners).

**Player status & outcome** — [`player-vitality.ts`](../src/engine/simulation/player-vitality.ts) (the Small/Powered/Fire/Recovering power state machine — see decisions [0009](decisions/0009-player-vitality-before-damage-recovery.md)/[0010](decisions/0010-powered-damage-recovery.md)), [`player-invincibility.ts`](../src/engine/simulation/player-invincibility.ts) (star), [`player-outcome.ts`](../src/engine/simulation/player-outcome.ts) (Active/Defeated/Finished + reasons), [`player-reaction.ts`](../src/engine/simulation/player-reaction.ts) (cosmetic "ouch").

**World features** — [`level-contact.ts`](../src/engine/simulation/level-contact.ts) (goal/hazard/pit detection), [`level-timer-state.ts`](../src/engine/simulation/level-timer-state.ts) (countdown), [`pipe-state.ts`](../src/engine/simulation/pipe-state.ts) (pipe entry + warp teleport — see [decision 0016](decisions/0016-travel-pipes.md)), [`platform-state.ts`](../src/engine/simulation/platform-state.ts) (rideable lifts), [`loop-zone-state.ts`](../src/engine/simulation/loop-zone-state.ts) (castle-maze loopbacks).

**Scoring, audio, determinism, replay** — [`game-score.ts`](../src/engine/simulation/game-score.ts) (`Score` + all scoring formulas), [`sound-events.ts`](../src/engine/simulation/sound-events.ts) (derives per-frame `SoundEvent`s the shell plays), [`pseudo-random.ts`](../src/engine/simulation/pseudo-random.ts) (**the determinism primitive** — a faithful port of SMB's LFSR register, advanced exactly once per frame), [`replay-fixture.ts`](../src/engine/simulation/replay-fixture.ts) (replays an input stream to assert bit-for-bit reproducibility — see [decision 0007](decisions/0007-replay-fixture-storage.md)).

**Co-op** — [`coop-player-kinematics.ts`](../src/engine/simulation/coop-player-kinematics.ts) (the reduced movement step for players 1..n), [`player-player-collision.ts`](../src/engine/simulation/player-player-collision.ts) (players are solid to each other; stacks ride the bottom one).

#### One frame, stage by stage

`stepSimulation` returns a brand-new `SimulationState`. The order matters — each
stage feeds the next:

1. **Advance the clock & validate.** Bump `frameIndex`, then run every
   `assertValid…` guard — the defensive contract at the frame boundary, so an
   invariant violation throws _here_ rather than corrupting a later stage.
2. **Dispatch on outcome.** If `players[0].outcome` is `Active`, run the full
   pipeline; if `Defeated`/`Finished`, carry state forward with the new clock.
3. **Primary-player pipeline:** vitality-recovery & timer ticks → pipe resolution
   (may freeze input or teleport) & crouch → input shaping → **movement**
   (horizontal → climb-or-vertical → position → solid-tile collision → water
   clamp → ride platforms → loop-zone loopback → teleport) → **blocks & spawns**
   (`?`-blocks, breakables, emerging items; head-bonk reactions) → **contacts &
   pickups** (goal/hazard/pit, coins, power-ups → vitality → resize, star) →
   **enemies** (motion, fireballs, stomp/contact, star/shell/projectile kills,
   per-enemy damage debounce) → **damage response** (stomp rebound; big→Recovering
   with knockback, small→defeated) → **timed & frenzy hazards** (`advancePseudoRandom`
   once here — the RNG heartbeat — then cheep/aerial frenzies, hatched spinies,
   flame hazards; all hazards share the same damage tiering) → **outcome &
   scoring** (goal/defeat/pit/timeout; time bonus + goal-height + kill/block
   scores; coin & stomp-chain 1-Ups).
4. **Co-op layer** (outer `stepSimulation`): advance players 1..n through the
   reduced kinematics (10 s spawn invincibility, then removal on contact),
   resolve player-vs-player collisions, and finish the level for everyone if any
   player reaches the goal.

### `levels/` — fixtures & importers

Mostly `LevelSpecInput` fixtures (each exports a `…RouteLevelInput`/`…LevelInput`
constant) used as demos and test scenarios, assembled with the authoring DSL in
[`level-builder.ts`](../src/engine/levels/level-builder.ts). Examples:
[`first-authored-level.ts`](../src/engine/levels/first-authored-level.ts) (the
baseline), plus per-mechanic demos for armored/chasing/flying enemies, stomps,
power-ups, coin blocks, projectiles, pipes, warps, caverns, hard landings,
castle clears, finishes, and multi-level sequences
([`showcase-level.ts`](../src/engine/levels/showcase-level.ts),
[`multi-level-route-level.ts`](../src/engine/levels/multi-level-route-level.ts) —
see [decision 0017](decisions/0017-multi-level-progression.md)).

**`levels/import/`** — external-format importers behind one dispatch entrypoint,
[`level-importer-registry.ts`](../src/engine/levels/import/level-importer-registry.ts)
(`importUserLevel`): [`tiled-json-level.ts`](../src/engine/levels/import/tiled-json-level.ts)
(Tiled editor JSON), [`vglc-text-level.ts`](../src/engine/levels/import/vglc-text-level.ts)
(generic VGLC ASCII grid) and [`vglc-smb-text-level.ts`](../src/engine/levels/import/vglc-smb-text-level.ts)
(SMB-specific decode), plus [`compatibility-profile-application.ts`](../src/engine/levels/import/compatibility-profile-application.ts)
and [`compatibility-conformance.ts`](../src/engine/levels/import/compatibility-conformance.ts)
(how well an import conforms). See [decision 0012](decisions/0012-level-import-pipeline-boundary.md),
[`smb-level-format.md`](smb-level-format.md), and the
[community format study](compatibility/community-level-format-study.md).

---

## The shell, part by part

Everything impure. It imports pure functions/types from the engine and holds
exactly one authoritative `simulationState` it steps each frame.

### `src/main.ts` — the front controller

A single module (no router library) that builds all DOM chrome and owns
navigation:

- **Hash routing** (`applyRoute`): each screen is a shareable URL —
  `#play?skin=&map=&level=&mode=&sound=&bots=&character=&revenge=&renderer=`
  (restores a selection **and** auto-starts), `#menu?...` (restores a shared
  configuration in the open menu without starting), `#design` (the editor),
  `#level=<code>` (a shared level straight into the editor). A `hashchange`
  listener re-routes on back/forward; the app's own navigation uses
  `history.replaceState` to avoid stray events.
- **The `PlayRoute` concept**: the serializable selection captured in the URL —
  `skin`, `map`, `level`, `mode`, `sound`, `bots`, `character`, `revenge`,
  `renderer`. `playRouteFromQuery` parses it; menu changes mirror back into the
  URL.
- **Start menu** (`renderStartMenu`): the dropdown start screen + first-run
  spotlight tutorial; launches the game on Play.
- **Content loading**: fetches the content-sets index and per-bundle manifests,
  loads bundles through the asset loader (memoized).
- **Sessions** (`GameSession`, `startSession`): several games can be suspended
  and resumed via the session bar.
- **Editor host** (`renderEditor`) and **asset-import UI** (`renderImportUi`).

### `src/shell/scenes/boot-scene.ts` — the running game

`BootScene extends Phaser.Scene` is the single bridge between engine and Phaser
(large by design — it is the whole rendering/feel layer). Responsibilities:

- **Input capture** — raw `window` `keydown`/`keyup` by `event.code` + DOM touch
  panels → `SimulationInputCommand` each frame.
- **Game loop** (`update`) — poll keys, call `stepSimulation` once, then render;
  handles pause/replay/scrub branches.
- **Rendering** (`renderSimulationState`) — tiles, actors, projectiles,
  platforms/ropes, flame hazards, frenzies, blocks, pipes, flagpole, the player
  sprite + "bloodiness", swim bubbles; per-entity render-object maps keyed by id.
  The player is always an authored sprite (every game loads a skin); other actors
  fall back to procedural shapes when a skin doesn't cover them.
- **Camera & feel** — zoom, camera shake, ground quake (via
  [`ground-quake.ts`](../src/shell/ground-quake.ts)), landing dust, HUD, score
  popups, victory fireworks.
- **Audio** — a `GameAudio` instance; event-driven music/SFX, star music, death
  jingle, time warning.
- **Death effects** — cause-specific styles (launch/burn/explode/float/impale)
  with AABB body-part physics ([`death-part-physics.ts`](../src/shell/death-part-physics.ts));
  see [death effects & feedback](game-feel/death-effects-and-feedback.md).
- **Co-op & revenge** — bot snapshots/labels/explosions
  ([`coop-bot-input.ts`](../src/shell/coop-bot-input.ts),
  [`coop-bot-names.ts`](../src/shell/coop-bot-names.ts)); revenge mode re-skins
  every enemy as a half-height hero you stomp.
- **Level flow & warps** — WORLD intro cards, warp handling, carried
  lives/score/vitality across levels, castle clear, flagpole slide.
- **Replay / timeline** — a `RunRecorder`, the `RunTimelineOverlay`, thumbnail
  capture, pause/scrub, and export; see
  [`run-recording-format.md`](run-recording-format.md).

### Other shell modules

| File                                                                                                                                                                                                                       | Responsibility                                                                                                                                                                                                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`browser-level-selection.ts`](../src/shell/browser-level-selection.ts)                                                                                                                                                    | Picks the built-in level + config from the URL (`selectBrowserGameBootstrap`).                                                                                                                                                             |
| [`create-game-config.ts`](../src/shell/create-game-config.ts) + [`select-renderer.ts`](../src/shell/select-renderer.ts)                                                                                                    | Phaser game config + the Canvas/WebGL/Auto renderer choice (Phaser-free, persisted). See [decision 0020](decisions/0020-webgl-renderer-evaluation.md).                                                                                     |
| [`user-asset-loader.ts`](../src/shell/user-asset-loader.ts)                                                                                                                                                                | Validates a manifest and loads a full asset bundle (sprites/audio/levels). Image loading runs through a **shared concurrency limiter** (`maxConcurrentImageLoads = 12`) so a large content set never fires hundreds of concurrent decodes. |
| [`game-audio.ts`](../src/shell/game-audio.ts)                                                                                                                                                                              | WebAudio SFX + the three SMB area themes (from decoded numeric note data).                                                                                                                                                                 |
| [`level-editor.ts`](../src/shell/level-editor.ts)                                                                                                                                                                          | The in-browser grid editor (paint/fill/rectangle, undo/redo, minimap, templates, play-test, save/share); doubles as the "upload your own level" path.                                                                                      |
| [`spotlight-tutorial.ts`](../src/shell/spotlight-tutorial.ts)                                                                                                                                                              | Reusable spotlight walkthrough, shared by the editor and start menu.                                                                                                                                                                       |
| [`player-character.ts`](../src/shell/player-character.ts)                                                                                                                                                                  | Costume enum (castaway/luigi/robot1-4/goomba/princess) + sprite-key logic.                                                                                                                                                                 |
| [`run-recorder.ts`](../src/shell/run-recorder.ts), [`run-timeline-overlay.ts`](../src/shell/run-timeline-overlay.ts), [`run-export.ts`](../src/shell/run-export.ts), [`store-only-zip.ts`](../src/shell/store-only-zip.ts) | The replay recorder, the pause/timeline UI, `run.json`/`.zip` export, and a dependency-free ZIP writer.                                                                                                                                    |
| [`content-set-index.ts`](../src/shell/content-set-index.ts)                                                                                                                                                                | Turns the content-sets index JSON into validated dropdown options.                                                                                                                                                                         |
| [`browser-debug-api.ts`](../src/shell/browser-debug-api.ts)                                                                                                                                                                | The `window.__originalBrowserPlatformerDebug` snapshot API the Playwright tests read.                                                                                                                                                      |
| [`reset-stored-state.ts`](../src/shell/reset-stored-state.ts)                                                                                                                                                              | Clears this app's `regular-mario`-prefixed `localStorage` keys (the reset button).                                                                                                                                                         |
| [`deploy-info-footer.ts`](../src/shell/deploy-info-footer.ts)                                                                                                                                                              | Footer stamping the build commit + time (skipped under automation).                                                                                                                                                                        |
| [`default-vglc-smb-sprite-coverage.ts`](../src/shell/default-vglc-smb-sprite-coverage.ts)                                                                                                                                  | Declares the sprite states a skin must cover for completeness checks.                                                                                                                                                                      |

---

## The content pipeline

Node ESM tooling in [`scripts/`](../scripts/) (no bundler). All ROM-derived work
targets a git-ignored `.cache/` and never commits ROM bytes (decisions
[0018](decisions/0018-smb-original-asset-acquisition-and-pixel-verification.md)–[0020](decisions/0020-webgl-renderer-evaluation.md);
enforced by `check-repository-content-policy.mjs`). Groups:

- **SMB acquisition & orchestration** — `acquire-smb-sources.mjs`,
  `prepare-smb.mjs` (acquire → extract → research), `ensure-smb-dev-cache.mjs`
  (the `pnpm run dev` gate), `smb-cache-status.mjs`, `smb-script-args.mjs`,
  `run-node-script.mjs`.
- **ROM extraction / decode** — `extract-smb-rom-assets.mjs` (CHR graphics),
  `smb-rom-format.mjs` (iNES/CHR parsing), `decode-smb-level.mjs` (the numeric
  level decoder — see [`smb-level-format.md`](smb-level-format.md)),
  `decode-smb-music.mjs`, `probe-smb-ppu.mjs` + `smb-emulator.mjs` (headless
  jsnes), `capture-smb-reference-frames.mjs` + `verify-smb-frames.mjs` +
  `compare-png-images.mjs` (pixel verification).
- **Asset + map set builders** — `build-parody-asset-set.mjs` (the original
  "Shabby Castaway" skin, every sprite authored as pixel grids),
  `build-rom-asset-set.mjs` (the local ROM skin), `build-official-map-set.mjs`
  (decode every area), `build-release-content.mjs` (**assemble the public
  release into `public/game-content/`**), `content-sets.mjs`.
- **Sprite / codec generators** — `robot-costume-sprites.mjs`,
  `revenge-costume-sprites.mjs`, `death-effect-overlay-sprites.mjs`,
  `rescued-friend-sprite.mjs`, `png-codec.mjs`, `wav-codec.mjs`,
  `build-sound-packs.mjs`.
- **VGLC import prep** — `prepare-vglc-smb-*.mjs`,
  `prepare-browser-demo-manifest.mjs`, `download-user-level.mjs`,
  `run-user-level-research.mjs`, `user-level-cache-policy.mjs`.
- **Policy / verification** — `check-dependency-policy.mjs`,
  `check-repository-content-policy.mjs`, `check-transitive-license-policy.mjs`,
  `check-vulnerability-policy.mjs`.

`public/game-content/` (git-ignored) is what the public release serves:
`content-sets-index.json`, per-bundle sprite PNGs + numeric level files +
`remote-manifest.json`, and `sound-packs/`. It's produced by
`build:release-content` and loaded at runtime by
[`user-asset-loader.ts`](../src/shell/user-asset-loader.ts).

---

## Conventions that matter

Enforced by review and, where possible, by lint (`pnpm run check`). Full
rationale in [`AGENTS.md`](../AGENTS.md); the essentials:

- **Keep the core pure & deterministic.** No wall-clock time, no
  `Math.random`/`Date.now`, no browser APIs in `src/engine/`. Randomness comes
  only from the seeded [`pseudo-random.ts`](../src/engine/simulation/pseudo-random.ts).
- **Use strong domain types.** Prefer the branded units in
  [`domain/`](../src/engine/domain/) over bare `number`/`string`; `require…`/`make…`
  helpers validate-and-brand.
- **Model alternatives as first-class cases.** No fallbacks or optional
  parameters to hide missing cases; parse/validation failures are explicit
  `DomainResult` errors, and the core fails loudly.
- **`assertValid…` at the boundary.** Every subsystem exposes a validator;
  `stepSimulation` runs the whole battery at the top of each frame.
- **Use the established names.** Refer to gameplay elements by their Super Mario
  Bros. names ([`terminology.md`](terminology.md)); don't invent jargon.

---

## Testing

The pyramid ([`CONTRIBUTING.md`](../CONTRIBUTING.md#testing)):

- **Unit / property tests** (`src/**/*.test.ts`, Vitest, Node) — the bulk, over
  the pure core: movement, collision, actors, blocks, scoring, level transforms,
  importers. Never need a browser.
- **Integration tests** — level loading, importers, asset manifests, scene
  wiring, replay. Recorded `run.json` fixtures re-run pixel-for-pixel headlessly
  ([`replay-fixture.ts`](../src/engine/simulation/replay-fixture.ts),
  [`run-recording-format.md`](run-recording-format.md)).
- **Browser tests** (`tests/browser/*.spec.ts`, Playwright) — boot, rendering,
  input, viewport, and smoke play, driving the real Phaser shell. Key specs:
  `boot.spec.ts` (+ screenshot baselines), `full-journeys.spec.ts`,
  `flow-screens.spec.ts`, `death-effects.spec.ts`, `renderer.spec.ts`,
  `route.spec.ts`, `session.spec.ts`/`multi-session.spec.ts`, `editor.spec.ts`,
  `touch.spec.ts`, `a11y.spec.ts`. Several read the
  [`browser-debug-api.ts`](../src/shell/browser-debug-api.ts) snapshot to assert
  on simulation state.

New core behavior should ship with unit tests; new architectural/policy choices
should add a record under [`decisions/`](decisions/).

---

## Where do I change…?

| Goal                             | Start here                                                                                                                                                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Jump/run feel, gravity, speeds   | [`movement-model.ts`](../src/engine/simulation/movement-model.ts) constants → [`horizontal-`](../src/engine/simulation/horizontal-movement.ts)/[`vertical-movement.ts`](../src/engine/simulation/vertical-movement.ts); verify with [movement measurements](game-feel/current-movement-measurements.md) |
| A new enemy behavior             | [`enemy-motion.ts`](../src/engine/simulation/enemy-motion.ts) (motion) + [`enemy-interaction.ts`](../src/engine/simulation/enemy-interaction.ts) (contact/score); add an `ActorRole` in [`level-spec.ts`](../src/engine/domain/level-spec.ts)                                                           |
| Damage / power-up rules          | [`player-vitality.ts`](../src/engine/simulation/player-vitality.ts), [`power-up-interaction.ts`](../src/engine/simulation/power-up-interaction.ts)                                                                                                                                                      |
| Scoring / lives                  | [`game-score.ts`](../src/engine/simulation/game-score.ts), aggregation in [`step-simulation.ts`](../src/engine/simulation/step-simulation.ts)                                                                                                                                                           |
| A new authored level             | add a `…RouteLevelInput` under [`levels/`](../src/engine/levels/) using [`level-builder.ts`](../src/engine/levels/level-builder.ts)                                                                                                                                                                     |
| Import a level format            | [`levels/import/`](../src/engine/levels/import/) + [`level-importer-registry.ts`](../src/engine/levels/import/level-importer-registry.ts)                                                                                                                                                               |
| A rendering / camera / HUD issue | [`boot-scene.ts`](../src/shell/scenes/boot-scene.ts) (`renderSimulationState`) — **not** the engine                                                                                                                                                                                                     |
| Sound / music                    | [`game-audio.ts`](../src/shell/game-audio.ts) (playback) + [`sound-events.ts`](../src/engine/simulation/sound-events.ts) (what fires)                                                                                                                                                                   |
| The start menu / URLs / sessions | [`src/main.ts`](../src/main.ts)                                                                                                                                                                                                                                                                         |
| A sprite's pixels                | the generator in [`scripts/`](../scripts/) (e.g. `build-parody-asset-set.mjs`, `revenge-costume-sprites.mjs`), then rebuild content                                                                                                                                                                     |
| Replay / export format           | [`run-recorder.ts`](../src/shell/run-recorder.ts), [`run-export.ts`](../src/shell/run-export.ts), [`run-recording-format.md`](run-recording-format.md)                                                                                                                                                  |

---

## Documentation index

Every document in the repo, grouped. This guide is the entry point; the rest are
the depth.

### Getting started & contributing

- [`../README.md`](../README.md) — what it is, controls, features, build & deploy, the public/local content boundary.
- [`../CONTRIBUTING.md`](../CONTRIBUTING.md) — setup, quality gates, testing, coding conventions, dependency & content rules.
- [`../AGENTS.md`](../AGENTS.md) — operating rules for automated contributors, the product goal, and the **IP/originality policy** (mechanics vs. expression).

### Architecture & reference

- [`architecture.md`](architecture.md) — stack, functional-core/imperative-shell split, entry points, module map, per-frame data flow, renderer.
- [`terminology.md`](terminology.md) — the glossary and the engine-role → Super Mario Bros. name mapping.
- [`run-recording-format.md`](run-recording-format.md) — the replay/export format (`run.json`, `.zip`).
- [`smb-level-format.md`](smb-level-format.md) — the numeric level-data decoder reference (pointer tables, object/enemy streams).

### Decision records (ADRs) — [`decisions/`](decisions/)

Numbered architecture & content-policy decisions: package manager & dependency
policy ([0001](decisions/0001-package-manager.md)–[0004](decisions/0004-browser-game-toolchain.md)),
the movement model & player state ([0005](decisions/0005-initial-movement-model.md)/[0006](decisions/0006-initial-player-state.md)),
replay fixtures ([0007](decisions/0007-replay-fixture-storage.md)), damage/vitality
([0008](decisions/0008-enemy-side-contact-response.md)–[0010](decisions/0010-powered-damage-recovery.md)),
power-ups & blocks ([0011](decisions/0011-power-up-acquisition.md)/[0014](decisions/0014-interactive-blocks.md)),
the import & user-asset boundaries ([0012](decisions/0012-level-import-pipeline-boundary.md)/[0013](decisions/0013-user-asset-import-boundary.md)),
projectiles, pipes & progression ([0015](decisions/0015-projectiles.md)–[0017](decisions/0017-multi-level-progression.md)),
ROM acquisition & content sets ([0018](decisions/0018-smb-original-asset-acquisition-and-pixel-verification.md)/[0019](decisions/0019-local-asset-and-map-sets.md)),
the WebGL renderer evaluation ([0020](decisions/0020-webgl-renderer-evaluation.md)),
and the dev-dependency license scope ([0021](decisions/0021-dev-dependency-license-scope.md)).

### Game feel & QA

- [`game-feel/current-movement-measurements.md`](game-feel/current-movement-measurements.md) — measured movement constants (for tuning; not equivalence claims).
- [`game-feel/death-effects-and-feedback.md`](game-feel/death-effects-and-feedback.md) — cause-specific death animations, sounds, and haptics.
- [`qa/enemy-gauntlet-game-feel-review.md`](qa/enemy-gauntlet-game-feel-review.md) — a game-feel QA pass on the enemy gauntlet.
- [`qa/current-authored-rendering-screenshot-review.md`](qa/current-authored-rendering-screenshot-review.md) — an authored-rendering screenshot review.

### Compatibility & dependencies

- [`compatibility/community-level-format-study.md`](compatibility/community-level-format-study.md) — target fidelity for supported external level formats.
- [`dependencies/README.md`](dependencies/README.md) — the per-dependency metadata requirement (license, purpose, maintenance, security).
- [`art-source/README.md`](art-source/README.md) — reviewed project-owned visual source/concept assets.

### Process & continuity

Living planning/status files (read before a task, updated after — see
[`../AGENTS.md`](../AGENTS.md#operating-rules)):

- [`../PLAN.md`](../PLAN.md) — the product plan & scope.
- [`../STATUS.md`](../STATUS.md) — current state of the project.
- [`../DO_NEXT.md`](../DO_NEXT.md) — the prioritized next tasks.
- [`../BUGS.md`](../BUGS.md) — known deltas vs. the reference (e.g. `BoundBoxCtrlData` audit).
- [`../WHAT_WE_DID.md`](../WHAT_WE_DID.md) — the reverse-chronological changelog.

### Agent playbooks — [`agents/`](agents/)

Prompt shapes for the built-in `explorer`/`worker` roles:
[platformer-mechanics-explorer](agents/platformer-mechanics-explorer.md),
[web-game-worker](agents/web-game-worker.md),
[level-pipeline-worker](agents/level-pipeline-worker.md),
[gamefeel-qa-explorer](agents/gamefeel-qa-explorer.md),
[browser-qa-worker](agents/browser-qa-worker.md),
[license-supply-chain-explorer](agents/license-supply-chain-explorer.md).
The reusable skill definitions live under [`.codex/skills/`](../.codex/skills/).
