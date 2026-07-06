# Decision 0010: Powered Damage Recovery

## Status

Accepted.

## Date

2026-06-26.

## Decision

Introduce powered-player damage recovery before multi-frame enemy side-contact knockback.

The next implementation should extend player vitality from the current explicit `small` state to first-class `powered` and `recovering` states. Small-player harmful enemy side contact must keep the current defeat behavior. Powered-player harmful enemy side contact must power the player down into a timed recovery state instead of resolving to `enemy-contact` defeat.

Recovery must be explicit simulation state, not a render-only effect. It should record the source enemy id, contact side, start frame, remaining knockback frames, and remaining invulnerability frames. Timers must use named movement/recovery constants and branded frame-count construction.

The first authored constants are original placeholders, not exact-mechanics claims:

- Knockback duration: 18 simulation frames.
- Invulnerability duration: 120 simulation frames.
- Knockback x velocity: reuse the existing side-contact knockback speed until a later game-feel tuning decision replaces it.

During recovery:

- Enemy body contact must not defeat the player while invulnerability frames remain.
- Enemy stomp contact may still defeat enemies, because it is an offensive interaction rather than harmful body contact.
- The player outcome must remain active unless a hazard, goal, or simultaneous non-enemy terminal condition occurs.
- Knockback velocity applies while knockback frames remain.
- Player horizontal input should be ignored while knockback frames remain and should resume after knockback frames reach zero.
- Invulnerability continues after knockback ends until invulnerability frames reach zero.
- When invulnerability reaches zero, vitality returns to `small`.

## Facts Used

Facts came from current repository source and command output on 2026-06-26.

- `src/engine/simulation/player-vitality.ts` currently defines explicit `small` vitality and makes enemy body contact defeat the small player.
- `src/engine/simulation/enemy-contact-response.ts` records side-contact enemy id, side, frame, and response velocity.
- `src/engine/simulation/step-simulation.ts` currently applies side-contact response velocity in the same active step and then resolves player outcome.
- `src/engine/simulation/player-outcome.ts` now receives player vitality when resolving enemy-contact defeat.
- `tests/browser/boot.spec.ts` covers copied browser debug snapshots, side contact, stomp contact, retry reset, and canvas-visible feedback.
- `pnpm run check`, `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright pnpm run test:browser`, and `pre-commit run --all-files` passed after explicit player vitality was added.

## Criteria

Required:

- Add first-class `powered` and `recovering` vitality variants.
- Preserve small-player side-contact defeat.
- Powered-player side contact must transition to recovering without defeated outcome.
- Recovering state must include source enemy id, contact side, start frame, remaining knockback frames, and remaining invulnerability frames.
- Frame counts and recovery constants must be typed and validated loudly.
- Enemy body contact must not defeat a recovering player while invulnerability remains.
- Recovery timers must decrement deterministically in fixed-step simulation.
- Recovery must reset to `small` when invulnerability expires.
- Browser debug snapshots must expose copied recovery state.
- Browser QA must assert powered side-contact recovery, active outcome preservation, copied recovery snapshot, visible/canvas-stable consequence, and retry reset.

Preferred:

- Keep powered-player acquisition out of this increment unless an authored, source-neutral fixture needs an initial powered state for QA.
- Keep visual flashing optional until the simulation state is stable.
- Keep constants authored and documented as placeholders rather than exact mechanics.

## Alternatives Considered

### Add Recovery As Enemy Contact Response Only

Rejected.

`EnemyContactResponseState` records the contact impulse. It should not own player survivability, invulnerability timers, or power-down rules.

### Add Invulnerability Without Powered State

Rejected.

Invulnerability only matters if there is a non-terminal state after damage. The project now has explicit small-player vitality, so powered and recovering states are the next needed cases.

### Add Power-Up Item First

Rejected for the next increment.

Power-up collection is a content and level-pipeline task. Damage recovery can be tested with an authored source-neutral fixture or explicit initial simulation state before a collectible power-up exists.

## Consequences

- Extend `PlayerVitalityState` beyond the current `small` case.
- Add recovery constants to movement/recovery configuration.
- Update enemy-contact outcome resolution to distinguish small, powered, and recovering vitality.
- Update side-contact response application so powered contact starts recovery and recovering contact respects invulnerability.
- Add pure tests for powered contact, recovery countdown, invulnerable contact, return to small, malformed recovery state, and existing small defeat.
- Add browser QA for a source-neutral powered-contact route.
