# Contributing

How to build, test, and change this project. For what it is and how to play, see
[`README.md`](README.md); for how the code is organized, see
[`docs/architecture.md`](docs/architecture.md); for vocabulary, see
[`docs/terminology.md`](docs/terminology.md).

## Prerequisites

- **Node.js** (a current LTS release).
- **pnpm** — the package manager (`packageManager: pnpm@10.33.3` in
  `package.json`; run `corepack enable` to get the pinned version). pnpm is
  required; see [`docs/decisions/0001-package-manager.md`](docs/decisions/0001-package-manager.md).

No ROM is needed to build or run the public game.

## Setup and the development loop

```bash
pnpm install
pnpm run dev            # dev server at http://127.0.0.1:5177
```

Edit code; Vite hot-reloads. Before opening a change, run the checks below.

## Quality gates

Every change must pass the full gate suite, which is exactly what CI and
`pnpm run check` run:

| Command                 | Checks                                                                           |
| ----------------------- | -------------------------------------------------------------------------------- |
| `pnpm run typecheck`    | TypeScript (`tsc --build`)                                                       |
| `pnpm run lint`         | ESLint                                                                           |
| `pnpm run format:check` | Prettier formatting (`pnpm run format` to fix)                                   |
| `pnpm run dead-code`    | unused exports/files (knip)                                                      |
| `pnpm run copy-paste`   | duplicate code (jscpd; threshold is 0%)                                          |
| `pnpm run test`         | unit + integration tests (Vitest)                                                |
| `pnpm run test:browser` | browser tests (Playwright)                                                       |
| `pnpm run check`        | the dependency/content/license/vulnerability policy checks plus all of the above |

`pnpm run check` is the authoritative pre-merge gate. A local `pre-commit`
configuration (`.pre-commit-config.yaml`) runs the fast subset on commit; the
slower browser and full-integration tests run as part of task verification. See
[`docs/decisions/0003-pre-commit-local-hooks.md`](docs/decisions/0003-pre-commit-local-hooks.md).

## Project layout

- **`src/engine/`** — the deterministic functional core (simulation, domain
  types, level construction and import). Never imports Phaser.
- **`src/shell/`** and **`src/main.ts`** — the imperative browser shell
  (rendering, input, audio, editor, persistence).
- **`scripts/`** — build, content-generation, and policy-check scripts.
- **`docs/`** — architecture, terminology, formats, and decision records.
- **`tests/browser/`** — Playwright tests.

The full walkthrough — entry points, per-frame data flow, and each module's
responsibility — is in [`docs/architecture.md`](docs/architecture.md).

## Persisted state

The only client-side persistence is `localStorage`, under keys prefixed
`regular-mario` (the renderer choice, the editor's tileset/tutorial flags and
saved levels, the replay timeline-collapsed flag, and the touch-control scale).
`src/shell/reset-stored-state.ts` centralizes clearing them, and the start
menu's "Reset saved data" button calls it. New persisted state must use the same
prefix so the reset covers it.

## Testing

The testing pyramid:

- **Unit / property tests** (most tests) cover the functional core: movement,
  collision, actors, blocks, scoring, and level transforms. These run in Node
  and never need a browser.
- **Integration tests** cover level loading, importers, asset manifests, scene
  wiring, and replay.
- **Browser tests** (Playwright) cover boot, rendering, keyboard/touch input,
  viewport scaling, and smoke-level play. Several read the
  `window.__originalBrowserPlatformerDebug` snapshot API
  (`src/shell/browser-debug-api.ts`) to assert on simulation state.

New behavior in the core should come with unit tests. Replays make regressions
reproducible: a recorded `run.json` re-runs pixel-for-pixel headlessly (see
[`docs/run-recording-format.md`](docs/run-recording-format.md)).

## Coding conventions

These are enforced by review and, where possible, by lint. The full rationale is
in [`AGENTS.md`](AGENTS.md); the essentials:

- **Keep the core pure.** The simulation must stay deterministic — no wall-clock
  time, no `Math.random`/`Date.now`, no browser APIs. Randomness comes only from
  the seeded generator (`src/engine/simulation/pseudo-random.ts`).
- **Use strong domain types.** Prefer the branded types in
  `src/engine/domain/` (pixels, tiles, frames, velocities, scores, entity IDs)
  over bare `number`/`string`.
- **Name constants; avoid magic numbers and strings.** Keep units explicit.
- **Model alternatives as first-class cases.** Do not use fallbacks or optional
  parameters to hide missing cases; treat parse/validation failures as explicit
  domain errors and fail loudly.
- **Use the established names.** Refer to code symbols by their fully-qualified
  names and gameplay elements by their Super Mario Bros. names — do not invent
  internal jargon or new acronyms. See
  [`docs/terminology.md`](docs/terminology.md).
- **Match the surrounding code** in comment density, naming, and idiom.

## Content and copyright boundary

The public repository contains **no copyrighted game assets** — only original
authored art, numeric level data, code, and reverse-engineering notes. When
adding content or importers, keep the line:

- **Public:** all code; the original authored skin; numeric level layouts (tile
  indices, coordinates, timings — no graphics or audio bytes); reverse-
  engineering docs; extraction/decoder scripts.
- **Local only (git-ignored):** any ROM, ROM-extracted sprite/tile/audio output,
  and original-game reference captures. These live under `.cache/user-levels/`.

The mechanics-vs-expression policy that governs every asset and design decision
is documented in [`AGENTS.md`](AGENTS.md#ip-and-originality-policy-mechanics-vs-expression);
the public/local split is summarized in
[`README.md`](README.md#content-boundary-whats-public-vs-local). The
`repository-content-policy` gate enforces it.

## Dependencies

Do not add a dependency until its license, purpose, maintenance status, and
security posture are recorded. Dependencies must be compatible with
AGPL-3.0-or-later, and a new version must be more than three days old before
adoption. See
[`docs/decisions/0002-dependency-policy.md`](docs/decisions/0002-dependency-policy.md);
the `dependency-policy` and `transitive-license-policy` gates enforce it.

## Commits and pull requests

- Keep each change scoped; prefer one commit per completed task with a clear,
  descriptive message.
- Ensure `pnpm run check` passes before opening a pull request.
- When a change makes an architectural or policy decision, add a record under
  [`docs/decisions/`](docs/decisions/).

## License

By contributing you agree your contributions are licensed under
[AGPL-3.0-or-later](https://www.gnu.org/licenses/agpl-3.0.en.html). Contribute
only original work; do not add third-party game assets.
