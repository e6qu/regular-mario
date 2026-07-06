# Decision 0008: Enemy Side-Contact Response

## Status

Accepted; implemented. Superseded by Decision 0010 for powered/recovering vitality behavior.

## Date

2026-06-26.

## Decision

Model non-stomp enemy contact as an explicit side-contact response before defeat.

The next implementation should introduce a first-class player/enemy contact response state that records the contacted enemy id, contact side, response frame, and response velocity. The response must be separate from defeated enemy state and from enemy patrol state.

The first implementation should keep the current no-health outcome rule: side contact still leads to the existing enemy-contact defeat outcome. Before that outcome freezes the simulation, the step that detects the contact should expose an explicit knockback response in the returned simulation state and browser debug snapshot.

## Facts Used

Facts came from current repository source and command output on 2026-06-26.

- `src/engine/simulation/enemy-interaction.ts` distinguishes harmful enemy contact from downward stomp defeat.
- `src/engine/simulation/enemy-motion.ts` owns runtime enemy patrol positions and velocities.
- `src/engine/simulation/player-outcome.ts` already treats harmful enemy contact as a defeat reason.
- `src/shell/browser-debug-api.ts` exposes copied simulation snapshots for Playwright QA.
- `tests/browser/boot.spec.ts` covers enemy-only side contact, hazard-plus-enemy contact, enemy stomp, and rendered patrol movement.
- `pnpm run check`, `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright pnpm run test:browser`, and `pre-commit run --all-files` passed after explicit enemy patrol movement was added.

## Criteria

Required:

- Side-contact response must be explicit state, not inferred from outcome text or rendered animation.
- The response must identify the enemy entity id involved in the contact.
- The response must distinguish contact from the left and right sides.
- The response must use typed velocity constants and branded velocity construction.
- The response must fail loudly for malformed state.
- The response must not hide or replace the existing enemy-contact defeat outcome.
- Browser QA must assert both debug snapshot state and a rendered/canvas-visible effect or stable visual consequence.

Preferred:

- Keep the first response one-frame and deterministic.
- Keep health, shrinking, invulnerability windows, and multi-hit state out of the first increment.
- Keep enemy patrol behavior unchanged except where contact detection reads runtime enemy positions.

## Alternatives Considered

### Side Contact Immediately Defeats Without Knockback State

Rejected for the next increment.

This is the current behavior. It is simple, but it gives browser QA and later game-feel work no explicit state to inspect or tune.

### Add Health Or Power-State Before Knockback

Rejected for now.

Health or power-state would make side contact more game-like, but it adds a larger player-state contract before the project has explicit damage response or invulnerability rules.

### Treat Knockback As Render-Only Feedback

Rejected.

Render-only feedback would duplicate simulation facts in the shell and make the behavior hard to test in pure replay and step tests.

## Consequences

- Add a small domain state for enemy side-contact response before adding health or invulnerability.
- Add pure tests for side direction, response velocity, malformed response state, and interaction with the existing defeat outcome.
- Add browser QA using an explicit route where the player contacts an enemy from the side.
- Revisit this decision when player health, shrinking, or invulnerability windows are introduced.
