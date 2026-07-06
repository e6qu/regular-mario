# Decision 0011: Power-Up Acquisition

## Status

Accepted.

## Date

2026-06-27.

## Decision

Introduce a first-class `power-up` actor role that grants the powered player vitality when collected during play, so the powered damage recovery loop (Decision 0010) is reachable without a debug-only fixture.

Acquisition rules (first authored placeholders, not exact-mechanics claims):

- Collecting a power-up while the player is `small` transitions vitality to `powered`.
- Collecting a power-up while the player is already `powered` or `recovering` consumes the power-up (it disappears) without changing vitality.
- Power-up collection is explicit simulation state (`PowerUpInteractionState` with collected entity ids), not a render-only effect.
- Power-up vitality transition applies after the recovery tick and before enemy-contact resolution, so a same-frame collect-then-side-contact resolves as powered recovery rather than small-player defeat.

## Facts Used

Facts came from current repository source on 2026-06-27.

- Decision 0010 documents powered/recovering vitality but defers acquisition to a later increment.
- `src/engine/domain/level-spec.ts` validated actor roles as a discriminated union with an exhaustive `makeActorRole` parser.
- `src/engine/simulation/collectible-interaction.ts` provided the parse-dont-validate pattern reused for power-up interaction state.
- `src/engine/simulation/player-vitality.ts` owns vitality transitions; `applyPowerUpCollectionToVitality` was added there to keep survivability rules cohesive.

## Consequences

- `ActorRole` gains a `power-up` member; every exhaustive switch over roles is a compile error until it handles the new case.
- Simulation state carries an explicit `powerUps` field with loud validation.
- A source-neutral `power-up-route` browser fixture lets QA collect the power-up, become powered, and survive a subsequent enemy side contact.
