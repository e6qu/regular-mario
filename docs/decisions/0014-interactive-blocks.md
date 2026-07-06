# Decision 0014: Interactive Blocks

## Status

Accepted.

## Date

2026-06-29.

## Decision

Add bumpable interactive blocks that behave as solid tiles and can spawn a contained item or power-up when struck from below.

Rules (first authored placeholders, not exact-mechanics claims):

- Interactive blocks use a new `TileCollisionKind.Interactive` value. They collide as solids for player and enemy movement.
- A tile definition may declare an optional `contentsActorId`. The referenced actor id must have role `item` or `power-up`.
- Bumping an interactive block from below records the tile coordinate in `InteractiveBlockInteractionState.bumpedBlockTilePositions` and spawns one instance of the block's contents as a dynamic spawned actor above the block.
- A block can only be bumped once; subsequent upward collisions resolve as with a used block and do not spawn again.
- Spawned actors are tracked in `SpawnedActorsState` and resolved by the existing collectible and power-up interaction resolvers, so a spawned item can be collected and a spawned power-up can grant powered vitality.
- Bumping plays a `BlockBump` sound event and changes the rendered tile to a "used" visual state.

## Facts Used

Facts came from current repository source on 2026-06-29.

- `src/engine/domain/level-spec.ts` validates tile definitions with `TileCollisionKind` and actor definitions with `ActorRole`.
- `src/engine/simulation/solid-tile-collision.ts` resolves upward (underside) collisions and is the natural place to detect a bump from below.
- `src/engine/simulation/collectible-interaction.ts` and `power-up-interaction.ts` resolve collection by iterating authored level actors; they are extended to also check spawned dynamic actors.

## Consequences

- `TileCollisionKind` gains an `interactive` member; `makeSolidTileIds` includes it so interactive blocks behave as solid.
- `TileDefinition` gains an optional `contentsActorId` field.
- Simulation state gains `interactiveBlocks` and `spawnedActors` slices with loud validation.
- Browser rendering distinguishes used vs. unused interactive blocks and renders spawned actors.
- A source-neutral `block-route` browser fixture lets QA bump a block and collect the spawned reward.
