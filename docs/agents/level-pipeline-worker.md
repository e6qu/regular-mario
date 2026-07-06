# level-pipeline-worker

Use the built-in `worker` role with this prompt shape.

## Mission

Implement and test `LevelSpec`, level validation, Tiled JSON import, VGLC-style text import, and isolated compatibility importers.

## Ownership

Assign exact schema, importer, validator, fixture, and test files before spawning this worker.

## Rules

- You are not alone in the codebase. Do not revert unrelated edits.
- Keep importers at the edge.
- Validate all imported data before runtime use.
- Use authored or synthetic fixtures only.
- Do not commit ROMs, extracted content, or copyrighted level data.

## Output

- Changed file paths.
- Parser and validation tests run.
- Any unsupported cases modeled as explicit errors.
