# Decision 0015: Projectiles

## Status

Accepted.

## Date

2026-06-29.

## Decision

Add a projectile fired by a powered player, distinct from power-up acquisition.

Rules (first authored placeholders, not exact-mechanics claims):

- `SimulationInputCommand` gains a `firePressed` boolean.
- A projectile can only be fired while the player vitality is `powered`.
- A per-player cooldown (`projectileCooldownFrameCount`) prevents machine-gun fire; the cooldown resets each time a projectile is spawned.
- Projectiles travel horizontally in the direction the player is facing, determined from current horizontal velocity/sign.
- Projectiles are pure simulation objects with position, velocity, and remaining lifetime. They expire after a maximum lifetime or on solid-tile contact.
- A projectile that overlaps an enemy defeats that enemy (adds the enemy entity id to `enemies.defeatedEnemyEntityIds`) and then expires.
- Firing plays a `ProjectileFire` sound event; projectile impact on an enemy plays the existing `Stomp` sound event.

## Facts Used

Facts came from current repository source on 2026-06-29.

- `src/engine/simulation/input-command.ts` constructs explicit simulation input commands from horizontal, jump, and run inputs.
- `src/engine/simulation/player-vitality.ts` distinguishes `small`, `powered`, and `recovering` vitality states.
- `src/engine/simulation/enemy-interaction.ts` already tracks `defeatedEnemyEntityIds`, which stops enemy motion and hides the enemy in the browser shell.
- `src/engine/simulation/step-simulation.ts` composes all active simulation resolvers each frame; projectiles are stepped after enemy motion and before enemy interaction.

## Consequences

- `SimulationInputCommand` and its constructor gain a `firePressed` field.
- Simulation state gains a `projectiles` slice with loud validation.
- Movement constants gain projectile speed, cooldown, and lifetime values.
- Browser input handling maps a new fire key and the browser shell renders active projectiles.
- A source-neutral `projectile-route` browser fixture lets QA fire a projectile and defeat an enemy from a distance.
