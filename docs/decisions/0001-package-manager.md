# Decision 0001: Package Manager

## Status

Accepted.

## Date

2026-06-26.

## Decision

Use `pnpm` as the JavaScript package manager for this project.

The repository records the selected package manager in `package.json`:

```json
{
  "packageManager": "pnpm@10.33.3"
}
```

## Facts Used

These facts came from commands run inside this repository on 2026-06-26:

- `node --version`: `v26.0.0`
- `npm --version`: `11.12.1`
- `pnpm --version`: `10.33.3`
- `yarn --version`: `1.22.22`
- `corepack --version`: command not found

## Criteria

Required:

- Works with TypeScript, Vite, Phaser, Vitest, Playwright, and JavaScript browser bundles.
- Produces a committed lockfile.
- Supports deterministic installs.
- Supports local script execution for checks and tests.
- Does not require adding generated dependency folders to git.

Preferred:

- Strict dependency resolution that makes undeclared dependency use easier to catch.
- Good monorepo/workspace support if the engine, tools, and game shell later split into packages.
- Common use in modern TypeScript projects.

## Alternatives Considered

### npm

Available locally as `11.12.1`.

Rejected for now because `pnpm` is also available and better matches the preferred strict dependency-resolution criterion.

### Yarn Classic

Available locally as `1.22.22`.

Rejected because it is the classic Yarn generation and does not offer a stronger reason than `pnpm` for this project.

### Corepack-managed package manager

Rejected because `corepack` is not available in the current local environment.

## Consequences

- Commit `pnpm-lock.yaml` after dependencies are selected and installed.
- Do not commit `node_modules/`, pnpm store data, build outputs, caches, generated bundles, or minified outputs.
- Dependency selection remains blocked until package registry facts are available or explicitly provided, because this project requires license compatibility checks and a package publish-age gate.
- The dependency freshness script must understand pnpm lockfiles and npm registry metadata.
