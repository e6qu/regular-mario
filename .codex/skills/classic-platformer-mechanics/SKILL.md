---
name: classic-platformer-mechanics
description: Use for deterministic side-scrolling platformer movement, collision, actor state, enemy behavior, block interactions, camera rules, replay checks, and game-feel audits.
---

# Classic Platformer Mechanics

Use this skill when changing movement, collision, physics constants, actor state machines, enemy behavior, block behavior, camera rules, replay systems, or mechanics tests.

## Rules

- Put mechanics in the functional core.
- Use a fixed-step simulation.
- Use explicit units for frames, pixels, subpixels, tile coordinates, velocities, and accelerations.
- Brand domain values instead of passing primitive numbers and strings through the core.
- No hidden fallbacks for collision, missing tiles, invalid states, or unsupported actor types.
- Model each gameplay case explicitly.
- Do not claim exact parity with an external game unless backed by documented measurements, source references, or tests.

## Checks

- Add or update unit tests for movement and collision changes.
- Add replay tests for behavior that spans multiple frames.
- Record constants and their source or measurement method.
- Verify that rendering and input frameworks are not required to run mechanics tests.

