# PLAN.md

## Mission

Build an original browser side-scrolling platformer with **classic (Super-Mario-style) mechanics** and **original expression** — original sprite art, music, sound, level layouts, and names. Ships as a JavaScript bundle that runs in the browser.

## IP And Originality Policy (Mechanics vs. Expression)

- **Mechanics and element types are not copyrightable and may be freely replicated:** running/jumping feel, stomping enemies, growth power-ups, projectile flowers, travel pipes, coins/score, goal finishes. The project deliberately mirrors them.
- **Specific expression IS protected and must be original:** sprite art, character likenesses, music, sound effects, level layouts, names, and trademarks. No tracing, recoloring, or closely imitating a third party's sprites/characters/audio, and no third-party names or trademarks.
- The repo must never contain copyrighted expression we did not author. License: AGPL-3.0-or-later; dependencies must be compatible.

## Architecture

- **Stack:** TypeScript, Vite (dev/bundling), Phaser (rendering/input/audio/scenes), and a custom fixed-step platformer simulation. Vitest for core tests, Playwright for browser tests, `pre-commit` for fast gates. Tiled JSON authoring plus VGLC-style text and optional user-file importers as isolated edge adapters.
- **Functional core, imperative shell.** The core owns deterministic simulation, collision, level validation, replay, and rules, stepped once per frame; the shell owns browser APIs, rendering, input, and asset loading. Dependencies point inward; no framework object is needed to test core mechanics.
- **Design rules:** strong domain objects and branded types over primitives; named constants with explicit units; loud failures with no hidden fallbacks; parse/validation/compatibility failures modeled as explicit domain errors.

## Graphics: original authored vs local-only ROM extraction

- The shipped skin ("Shabby Castaway") is **original authored** pixel art, generated deterministically at build time from a committed script — no ROM.
- A ROM-extracted skin and ROM-decoded numeric level layouts are supported for local fidelity work, but ROM bytes, ROM URLs, extracted pixels/audio, and reference captures **never enter git** — they live under ignored `.cache/user-levels/`. Only numeric metadata (tile indices, palette RGB arrays, coordinates, timings) and the extraction/decoder scripts are committed. See `docs/decisions/0018` and `0019`.

## Target

Faithful SMB feel — mechanics, HUD, background, physics, and level layouts modeled to the original and verified against user-supplied local reference frames (`verify:smb-frames`, target 0 differing pixels at 256×240). The engine is only "done" when real-asset play verifies it. Milestones 0–7 (governance, toolchain, domain core, simulation, browser shell, level pipeline, original content/game-feel, compatibility importers) are largely achieved; current work is Milestone 8 (faithful SMB 1-1) fidelity closure.

## Commit Policy

- One cohesive commit per completed task, with tests or a note on why they don't apply. Do not combine unrelated work.
- Never commit build outputs, dependency folders, ROMs, copyrighted assets, secrets, or local caches.
