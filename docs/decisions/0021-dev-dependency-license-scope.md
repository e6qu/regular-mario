# Decision 0021: Dev-Dependency License Scope

## Status

Accepted.

## Date

2026-07-14.

## Decision

Scope the dependency-policy license allowlist to what is actually distributed.
`scripts/check-dependency-policy.mjs` now chooses the allowed set of licenses by
the dependency's `dependencySection`:

- **Runtime `dependencies`** (bundled into the shipped site in `dist/` and
  conveyed under AGPL-3.0-or-later) keep the strict, unambiguously
  AGPL-compatible allowlist: `Apache-2.0`, `ISC`, `MIT`.
- **`devDependencies` / `peerDependencies`** (build- and test-only tooling that
  is never bundled or conveyed) additionally allow permissive and weak
  (file-level) copyleft licenses that impose no obligation on non-distributed
  use: `MPL-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `0BSD` (on top of the conveyed
  set).

All other dependency-policy requirements are unchanged: every dependency still
needs a `docs/dependencies/*.json` metadata file, `agplCompatibility` must be
`"compatible"`, the checked version must be more than 3 days old, and so on.

## Context

The only runtime dependency is `phaser` (MIT) — the sole third-party code vite
bundles into the distributed site. Everything else in `package.json` is a
`devDependency`: Vite, TypeScript, ESLint, Playwright, and the accessibility
scanner `@axe-core/playwright` (MPL-2.0), among others. These run the build and
the test suite; none of them are compiled into or shipped with `dist/`.

The AGPL-compatibility obligation attaches to the **conveyed** work. Applying the
strict conveyed-code allowlist to test/build tooling that is never distributed
was stricter than the license situation requires, and it blocked
`@axe-core/playwright` — the official Playwright integration of Deque's
industry-standard accessibility engine — used only by
`tests/browser/a11y.spec.ts`. MPL-2.0 is itself GPL/AGPL-compatible (MPL-2.0
§3.3), so even a stricter reading is satisfied; scoping by section makes the
intent explicit and keeps the shipped-bundle guarantee unchanged.

See [`0002-dependency-policy.md`](0002-dependency-policy.md) for the base gate.

## Consequences

- The shipped bundle's license guarantee is unchanged: runtime `dependencies`
  are still restricted to `Apache-2.0` / `ISC` / `MIT`.
- Test and build tooling may use the additional permissive / weak-copyleft
  licenses above without special-casing, so the a11y scan is retained.
- Adding a runtime dependency under a non-strict license still fails the gate,
  by design — such a change should update this decision first.
