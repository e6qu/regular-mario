# AGENTS.md

## Operating Rules

Before each task:

- Read `PLAN.md`, `STATUS.md`, `DO_NEXT.md`, `BUGS.md`, and `WHAT_WE_DID.md`.
- Confirm the current task from facts in the repo, commands, official specs, official docs, or explicitly provided requirements.
- Do not guess. If a fact is not available, either find it from an allowed source or record the uncertainty.
- Check git status and keep the task scoped.

After each task:

- Run the relevant fast checks and tests for the changed area.
- Use the relevant review agent or skill lane described below.
- Update `STATUS.md`, `WHAT_WE_DID.md`, `DO_NEXT.md`, and `BUGS.md`.
- Commit a cohesive, non-anemic change. Prefer one commit per completed task.

## Product Goal

Build an original browser platformer inspired by classic side-scrolling platform games.

### IP And Originality Policy (Mechanics vs. Expression)

This distinction governs every asset and design decision:

- **Game mechanics and element types are not copyrightable and may be freely replicated.** Rules, systems, and gameplay element categories — e.g. running/jumping with tuned feel, stomping enemies, growth/gravity power-ups, projectile-shooting flowers, travel pipes, coins/score, flag/goal finishes — are mechanics, not protected expression. The project deliberately implements classic (Super-Mario-style) mechanics and element types.
- **Specific expression IS protected and must be original.** Sprite art, character likenesses, music, sound effects, level layouts, names, and trademarks must be authored by the project and must not copy a third party's specific expression. Do not trace, recolor, or closely imitate another game's sprites, character designs, audio, or distinctive trade dress; do not use third-party character names or trademarks.
- Concretely: a plumber-capped mascot, a growth power-up, a pipe, a stomping enemy, and a projectile flower are fine as **mechanics/element categories with original art and original names**. A copy of a specific copyrighted character's sprite, a specific copyrighted mushroom/flower look, a specific copyrighted pipe-and-plant design, copyrighted music, or copyrighted level maps are not.

The repo must not contain copyrighted content that we did not author or have the right to use.

Compatibility importers may support user-provided local files or documented external level formats, but the project must not ship copyrighted ROMs, maps, sprites, sounds, music, patches, or extraction outputs.

## Architecture

The runtime target is a JavaScript bundle that runs in the browser.

Preferred stack:

- TypeScript for application and engine code.
- Vite for development and production bundling.
- Phaser for browser rendering, scenes, input, camera, audio, and asset loading.
- Custom fixed-step platformer simulation for movement, collision, actors, enemies, block behavior, replay, and game rules.
- Tiled JSON as the primary authored level format.
- VGLC-style text import as an early importer for level-pipeline validation.
- Optional user-file importers as isolated edge adapters.

Architecture style:

- Functional core, imperative shell.
- The functional core owns deterministic simulation, collision, level validation, replay, and rules.
- The imperative shell owns browser APIs, rendering, input devices, asset loading, persistence, CLI/dev entrypoints, and parameter introduction.
- Dependencies point inward toward stable domain types.
- No framework object should be required to test core mechanics.

## Type And API Rules

- Prefer strong domain objects over primitive strings and numbers.
- Use branded types for IDs, pixels, tiles, frames, velocities, asset keys, entity IDs, and level coordinates.
- Avoid magic numbers and magic strings. Name constants and keep units explicit.
- Avoid optional, default, or implicit parameters except at entrypoint/shell boundaries.
- Do not use fallbacks to hide missing cases. Model alternatives as first-class cases.
- Fail loudly. Do not swallow errors.
- Treat parse, validation, and compatibility failures as explicit domain errors.

## Testing Principles

Testing pyramid:

- Most tests should be pure unit/property-style tests for functional core mechanics and level transforms.
- Integration tests should cover level loading, asset manifests, scene wiring, replay, and importer behavior.
- Browser tests should cover boot, canvas rendering, keyboard input, viewport scaling, and smoke-level play.
- Manual or agent-assisted QA should focus on game feel, level pacing, visual correctness, and accessibility gaps.

Each task should include:

- Automatic tests where practical.
- A relevant agent/skill review lane.
- A continuity-file update.
- A commit after tests pass or a clear note explaining any blocked check.

## Skills To Use

Available installed skills:

- `imagegen`: generate original bitmap concepts, sprite sheets, tiles, backgrounds, and mockups.
- `skill-creator`: create project-local skills for platformer mechanics, QA, importers, and architecture.
- `skill-installer`: install curated skills such as Playwright or screenshot tooling when allowed.

Recommended project skills to create:

- `phaser-vite-platformer`: browser game architecture, scene boundaries, asset loading, and bundle structure.
- `classic-platformer-mechanics`: deterministic side-scroller movement, collision, actors, powerups, camera, and replay checks.
- `level-import-pipeline`: `LevelSpec`, Tiled JSON, VGLC text, validation, and optional compatibility importers.
- `web-game-qa`: Playwright checks, screenshots, canvas rendering, viewport behavior, input tests, and performance smoke checks.
- `copyright-safe-original-game`: verifies original assets, names, levels, and import boundaries.

## Agents To Use

Available built-in agent roles:

- `explorer`: codebase and QA research. Use for audits, mechanics review, importer investigation, and test-gap analysis.
- `worker`: bounded implementation. Use for assigned files/modules with clear ownership.
- `default`: general coordination when a specialized role is not needed.

Recommended project agent definitions:

- `platformer-mechanics-explorer`: audit movement, collision, camera, enemy, block, and powerup behavior against documented target mechanics. Report frame/state deltas and missing tests.
- `web-game-worker`: implement bounded TypeScript/Phaser features. Keep core mechanics independent of Phaser physics.
- `level-pipeline-worker`: implement and test `LevelSpec`, importers, validators, and fixtures.
- `gamefeel-qa-explorer`: play/audit the browser game for responsiveness, collision forgiveness, camera comfort, and level pacing.
- `browser-qa-worker`: add Playwright, screenshot, boot, input, canvas, and viewport tests.
- `license-supply-chain-explorer`: audit dependency licenses, package age policy, vulnerability scan output, and generated/binary file risks.

## Dependency And License Rules

- Project license: AGPL-3.0-or-later.
- Dependencies must be compatible with AGPL-3.0-or-later.
- Prefer well-known, actively maintained, widely vetted dependencies.
- Do not add a dependency until its license, purpose, maintenance status, and security posture are recorded.
- New dependency versions must be published more than 3 days before adoption where the package registry provides publish-time metadata.
- Do not vendor minified, compiled, generated, or copyrighted third-party content into the repo.

## Pre-Commit Policy

Use the `pre-commit` framework for fast local checks once the toolchain is introduced.

The pipeline should include:

- Formatting checks.
- Linting.
- Type checking.
- Fast unit tests.
- Dead-code detection.
- Copy-paste detection.
- Vulnerability scanning for repository files and package metadata.
- Secret scanning.
- License compatibility checks.
- A custom dependency freshness and age gate that prefers latest compatible versions but rejects versions published 3 days ago or less.

Slow browser and full integration tests may run outside pre-commit but must be part of the regular task verification workflow.
