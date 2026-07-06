# Decision 0017: Multi-Level Progression

## Status

Accepted.

## Date

2026-06-29.

## Decision

Add multi-level progression so finishing one level can load the next level in an authored sequence without reloading the page.

Rules (first authored placeholders, not exact-mechanics claims):

- `BrowserGameBootstrap` gains an optional `levelSequence: readonly LevelSpecInput[]` and `levelIndex: number`.
- The shell always boots from the level at `levelSequence[levelIndex]`. When no sequence is provided, the bootstrap behaves as before with a single `levelInput`.
- When the player outcome becomes `finished` and there is a next level in the sequence, the shell advances `levelIndex` by one and rebuilds the level, simulation state, camera, and rendered objects in place.
- While advancing, the previous Phaser game objects for tiles, actors, and the player are destroyed and recreated so the new level renders cleanly.
- The outcome feedback text after finishing a non-final level reads "Gate reached — next level loading..." briefly before the advance occurs.
- A `LevelComplete` sound event plays when a level is finished, in addition to the existing `Finish` event.
- The debug snapshot exposes the current `levelIndex` and `levelCount` so QA can observe progression.

## Facts Used

Facts came from current repository source on 2026-06-29.

- `src/shell/scenes/boot-scene.ts` owns level spec creation, initial simulation state, rendering, and the per-frame `update` loop.
- `src/shell/browser-level-selection.ts` already centralizes level selection into `BrowserGameBootstrap`; extending it with a sequence is the least invasive path.
- `src/engine/simulation/player-outcome.ts` defines the `finished` outcome kind and `PlayerOutcomeKind` enum.

## Consequences

- `BrowserGameBootstrap` and its construction functions change shape; existing single-level bootstraps continue to work through an explicit single-item sequence.
- `BootScene` gains a `advanceToNextLevel` path that rebuilds all level-dependent state and objects.
- Browser QA can use a new `multi-level-route` fixture with two short levels and assert the level index changes after finishing the first.
