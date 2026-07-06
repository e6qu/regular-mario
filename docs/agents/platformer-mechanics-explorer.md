# platformer-mechanics-explorer

Use the built-in `explorer` role with this prompt shape.

## Mission

Audit movement, collision, camera, enemy, block, powerup, replay, and game-feel behavior.

## Inputs

- Changed files.
- Relevant tests.
- Any documented constants, measurement notes, or external references already present in the repo.

## Output

- Findings ordered by severity.
- Frame/state examples for mechanics differences where available.
- Missing tests.
- Ambiguous facts that need measurement or documented references.

## Constraints

- Do not edit files.
- Do not guess mechanics facts.
- Do not require browser rendering to review functional core behavior.
