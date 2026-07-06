# Decision 0012: Level Import Pipeline Boundary

## Status

Accepted; implemented.

## Date

2026-06-27.

## Decision

Start Milestone 5 by introducing an original VGLC-style text importer at the edge of the system, converting an external text-grid level format into the existing validated `LevelSpecInput`.

The importer owns only format conversion and character/legend/dimension validation. It does not perform gameplay validation and does not fall back to another format. All gameplay-level invariants (tile collisions, actor roles, unique entity ids, exactly one player-start, at least one exit, bounds) remain the responsibility of `makeLevelSpec`, which the importer feeds.

Format (original, not derived from any copyrighted game):

- `tileLegend`: single-character keys mapping to `{ tileId, collision }`.
- `actorLegend`: single-character keys mapping to `{ actorId, role }`.
- `tileRows`: equal-length strings; every character must appear in `tileLegend`.
- `actorRows`: equal-length strings; a space means no actor, any other character must appear in `actorLegend`.
- Imported actors get deterministic entity ids `${actorId}-${occurrence}`.

Importer failures are explicit `ValidationError` results with dedicated codes (`vglc-tile-character-unknown`, `vglc-actor-character-unknown`, `vglc-grid-width-mismatch`, `vglc-grid-height-mismatch`, `vglc-legend-key-invalid`).

## Facts Used

- `src/engine/domain/level-spec.ts` validates the internal level shape; importers must only produce `LevelSpecInput`.
- `.codex/skills/level-import-pipeline/SKILL.md` requires importers at the edge, no fallback parsing, validation before runtime, and synthetic/authored fixtures for parser tests.

## Consequences

- Milestone 5 (Level Pipeline) is started: the VGLC-style text importer exists with full valid/invalid coverage plus a runtime smoke test driving the simulation from an imported level.
- The Tiled JSON importer was added under the same boundary contract (see `src/engine/levels/import/tiled-json-level.ts`).
- No source-format-specific runtime logic enters the simulation; imported levels are indistinguishable from authored ones after conversion.
