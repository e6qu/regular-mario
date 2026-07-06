# Decision 0009: Player Vitality Before Damage Recovery

## Status

Accepted; implemented. Superseded by Decision 0010 for powered/recovering vitality rules.

## Date

2026-06-26.

## Decision

Introduce explicit player vitality state before adding multi-frame damage recovery, invulnerability, or power-down behavior.

The next implementation should add a first-class player vitality domain state to the fixed-step simulation. The first authored runtime state should represent the current vulnerable small-player rule, where harmful enemy side contact still resolves to the existing enemy-contact defeat outcome.

The vitality model must be separate from `PlayerOutcomeState`, `EnemyInteractionState`, and `EnemyContactResponseState`. Outcome remains the terminal level/result state; vitality is the player survivability state that later determines whether side contact defeats immediately, powers the player down, starts invulnerability, or starts multi-frame knockback.

The first implementation should not add a power-up item, hidden health fallback, or implicit recovery timer. It should make the existing small-player rule explicit, validate it loudly, expose it in browser debug snapshots, and route enemy-contact defeat through the vitality state.

## Facts Used

Facts came from current repository source and command output on 2026-06-26.

- `src/engine/simulation/player-outcome.ts` currently derives enemy-contact defeat directly from `EnemyInteractionState`.
- `src/engine/simulation/simulation-state.ts` owns explicit top-level simulation substates for player, outcome, contacts, collectibles, enemies, enemy contact response, and enemy motion.
- `src/engine/simulation/enemy-contact-response.ts` now records the enemy side-contact response before the existing defeat outcome freezes the simulation.
- `src/engine/simulation/step-simulation.ts` freezes player, contact, enemy response, and outcome state after non-active outcomes.
- `tests/browser/boot.spec.ts` asserts debug snapshot copies for outcome, collectibles, enemies, and enemy contact response.
- `pnpm run check`, `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright pnpm run test:browser`, and `pre-commit run --all-files` passed after explicit enemy side-contact response was added.

## Criteria

Required:

- Player survivability must be explicit state, not inferred from outcome text, contact arrays, or rendered feedback.
- The initial authored player vitality state must preserve current behavior: harmful enemy side contact defeats the player.
- The vitality state must be validated loudly when malformed.
- The outcome resolver must receive vitality as an explicit input when deciding enemy-contact defeat.
- Browser debug snapshots must expose a copied vitality state.
- Retry must rebuild the initial vitality state.
- Tests must prove initial vitality, malformed vitality rejection, enemy-contact defeat through small-player vitality, browser snapshot copying, and retry reset.

Preferred:

- Keep the first implementation behavior-preserving except for the new explicit state contract.
- Keep powered-player, power-down, invulnerability, and multi-frame recovery out of this increment until their constants and timing rules are documented.
- Make the state name broad enough for future first-class cases without implying a numeric health model.

## Alternatives Considered

### Add Multi-Frame Knockback Immediately

Rejected for the next increment.

The current enemy-contact rule freezes the simulation on defeat. A multi-frame knockback timer would either be invisible after freeze or would require changing terminal outcome behavior before player survivability is explicit.

### Add Invulnerability Without Vitality

Rejected.

Invulnerability needs to answer what state becomes invulnerable and what enemy contact does while invulnerable. Adding it without vitality would make contact handling depend on an isolated timer rather than a clear player survivability model.

### Add Numeric Health

Rejected for now.

Classic platformer behavior is better represented first as explicit player states such as small, powered, recovering, or defeated. A numeric health counter would be a separate design choice and is not required to preserve the current authored mechanics.

## Consequences

- Add a player vitality module and include it in `SimulationState`.
- Update player outcome resolution so enemy-contact defeat is a consequence of small-player vitality plus harmful enemy contact.
- Expose vitality through the browser debug API.
- Update replay and browser tests to pin the new state.
- Revisit this decision before adding powered-player damage, invulnerability windows, or multi-frame knockback recovery.
