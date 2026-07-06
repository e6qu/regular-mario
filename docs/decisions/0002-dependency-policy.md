# Decision 0002: Dependency Policy Gate

## Status

Accepted.

## Date

2026-06-26.

## Decision

Add a local dependency policy checker at `scripts/check-dependency-policy.mjs`.

The checker uses only Node built-ins and does not contact package registries. It enforces the facts this repository can verify locally:

- `package.json` license must be `AGPL-3.0-or-later`.
- `package.json` package manager must remain `pnpm@10.33.3`.
- Every dependency section must be an object when present.
- `optionalDependencies` are rejected by policy.
- Every dependency must have a matching metadata file in `docs/dependencies/`.
- Metadata must include purpose, license, license evidence, AGPL compatibility, registry, checked version, publish time, check time, latest-compatible-version confirmation, and well-known-package evidence.
- The checked version publish time must be more than 3 days old.
- Metadata files without matching dependencies are rejected.

## Context

Registry access is currently forbidden by project instruction, so the project cannot verify latest versions, publish times, license facts, vulnerability state, or maintenance facts directly from package registries.

This decision creates a local gate that can block undocumented dependencies now and can later consume registry-derived metadata when registry access is allowed or explicitly supplied.

## Consequences

- Dependency selection remains blocked until package metadata is available from allowed sources.
- The checker can run before any dependency is installed.
- The checker must be part of the fast check path.
- Future registry-aware tooling should generate or update the same metadata format rather than bypassing it.
