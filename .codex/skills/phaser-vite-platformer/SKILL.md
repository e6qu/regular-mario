---
name: phaser-vite-platformer
description: Use for architecture and implementation guidance for the browser game shell, Phaser scene boundaries, Vite bundle shape, asset loading, input wiring, and keeping the deterministic core independent from rendering.
---

# Phaser Vite Platformer

Use this skill when changing browser shell code, build entrypoints, Phaser scenes, rendering adapters, asset manifests, input adapters, or the Vite integration.

## Rules

- Keep Phaser in the imperative shell.
- Do not put gameplay rules, collision, or movement decisions in Phaser scene objects.
- Convert browser input into explicit command objects before it reaches the simulation.
- Render from immutable or read-only simulation snapshots.
- Treat asset keys as typed domain values, not free-form strings.
- Do not introduce defaults for scene parameters, canvas size, asset paths, or input bindings.
- Fail loudly when an asset, scene, or required config value is missing.

## Checks

- Confirm core mechanics can be tested without Phaser.
- Confirm browser boot tests cover the entrypoint after the test stack exists.
- Confirm generated bundles and minified output are not committed.
- Confirm public assets are original, authored for this project, or explicitly licensed.

