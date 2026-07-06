# Decision 0004: Browser Game Toolchain

## Status

Accepted.

## Date

2026-06-26.

## Decision

Add the initial browser game toolchain:

- `phaser@4.2.0`
- `typescript@6.0.3`
- `vite@8.0.16`
- `vitest@4.1.9`
- `@playwright/test@1.61.0`
- `@types/node@26.0.0`

All versions are exact-pinned in `package.json`.

## Facts Used

Facts came from npm registry metadata queried during this task.

- `typescript@6.0.3`: Apache-2.0, published `2026-04-16T23:38:27.905Z`.
- `vite@8.0.16`: MIT, published `2026-06-01T09:50:43.261Z`.
- `phaser@4.2.0`: MIT, published `2026-06-19T13:55:36.930Z`.
- `vitest@4.1.9`: MIT, published `2026-06-15T07:23:00.326Z`.
- `@playwright/test@1.61.0`: Apache-2.0, published `2026-06-15T10:06:35.237Z`.
- `@types/node@26.0.0`: MIT, published `2026-06-19T07:14:52.347Z`.

The task check time was `2026-06-25T22:41:38Z`.

## Publish-Age Decisions

The project requires selected package versions to be published more than 3 days before adoption.

- `vite@8.1.0` was not selected because npm metadata reported it was published `2026-06-23T11:34:04.988Z`.
- `@playwright/test@1.61.1` was not selected because npm metadata reported it was published `2026-06-23T19:49:12.825Z`.
- `@types/node@26.0.1` was not selected because npm metadata reported it was published `2026-06-24T20:33:01.352Z`.

## TypeScript Configuration

`skipLibCheck` is set to `true`.

Reason:

- `phaser@4.2.0` declaration files currently fail TypeScript 6 declaration checking in `node_modules`.
- The project still typechecks application, test, and config code with strict compiler options.
- This setting is limited to third-party declaration internals and does not relax project source checking.

## Consequences

- `pnpm-lock.yaml` is committed for deterministic installs.
- `node_modules/`, `.cache/`, `dist/`, Playwright browser downloads, and build outputs remain ignored.
- Browser tests require Playwright browsers under `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright`.
- The initial Phaser bundle is large and is tracked as a performance risk.
