---
name: level-import-pipeline
description: Use for LevelSpec design, Tiled JSON import, VGLC-style text import, optional user-file compatibility importers, validation, and level fixture policy.
---

# Level Import Pipeline

Use this skill when changing level schemas, importers, validators, authored fixtures, compatibility boundaries, or runtime level loading.

## Rules

- Convert all source formats into a typed internal `LevelSpec`.
- Keep importers at the edge of the system.
- Validate before runtime use.
- Treat every supported input format as a first-class case.
- Do not use fallback parsing from one format into another.
- Do not ship ROMs, extracted maps, copyrighted level dumps, copyrighted sprites, copyrighted audio, or patch files.
- Use synthetic fixtures or authored project fixtures for parser tests.

## Checks

- Add parser tests for valid and invalid input.
- Add validation tests for dimensions, coordinates, entities, exits, and unknown symbols.
- Confirm importer errors identify the exact source format and failing field.
- Confirm imported levels can be represented without source-format-specific runtime logic.

