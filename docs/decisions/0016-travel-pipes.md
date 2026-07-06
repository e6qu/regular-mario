# Decision 0016: Travel Pipes

## Status

Accepted.

## Date

2026-06-29.

## Decision

Add travel pipes that the player can enter to warp within a level or to the next level in a sequence.

Rules (first authored placeholders, not exact-mechanics claims):

- A new `Pipe` actor role marks a pipe mouth tile.
- Each pipe actor declares an optional `targetLevelName` and a required `targetTilePosition` within the destination level.
- The player enters a pipe by overlapping the pipe mouth while holding down and pressing jump.
- Pipe entry begins a short fixed-frame countdown (`pipeEntryFrameCount`). During the countdown the player is frozen and drawn descending into the pipe.
- On countdown completion:
  - If `targetLevelName` is provided and matches a level in the current sequence, the shell advances to that level.
  - Otherwise the player is teleported to `targetTilePosition` in the current level, and a short exit cooldown prevents immediate re-entry.
- Pipe entry/clearance plays a `PipeWarp` sound event.

## Facts Used

Facts came from current repository source on 2026-06-29.

- `src/engine/domain/level-spec.ts` validates actor definitions and placements; actor roles are the natural place to add a pipe marker.
- `src/engine/simulation/player-state.ts` owns the player position and movement state; teleportation updates position and zeros velocity.
- `src/shell/browser-level-selection.ts` maps browser level keys to a single `BrowserGameBootstrap`; multi-level sequences build on this by supplying a level sequence.

## Consequences

- `ActorRole` gains a `pipe` member; every exhaustive switch over roles is a compile error until handled.
- Simulation state gains a `pipeEntry` slice with loud validation.
- Movement constants gain pipe entry and exit cooldown frame counts.
- Browser rendering draws a simple pipe shape for pipe actors.
- A source-neutral `pipe-route` browser fixture lets QA enter a pipe and warp within a level.
