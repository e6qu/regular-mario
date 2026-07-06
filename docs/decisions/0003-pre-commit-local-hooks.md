# Decision 0003: Pre-Commit Local Hooks

## Status

Accepted.

## Date

2026-06-26.

## Decision

Add `.pre-commit-config.yaml` with local hooks only.

Initial hooks:

- `dependency-policy`: runs `scripts/check-dependency-policy.mjs`.
- `repository-content-policy`: runs `scripts/check-repository-content-policy.mjs`.
- `package-json-valid`: verifies `package.json` parses as JSON.

## Context

The project currently forbids registry/network access. External pre-commit hook repositories and package-manager-installed tools are therefore out of scope for this task.

`pre-commit 4.6.0` is locally available. The initial configuration uses `language: system` hooks so it can run before project dependencies are installed.

## Consequences

- Fast local policy checks can run immediately.
- Formatter, linter, type checker, dead-code detector, copy-paste detector, browser tests, and full vulnerability scanning remain pending until dependencies and tool metadata can be selected from allowed facts.
- `PRE_COMMIT_HOME` should be set inside the repo when running checks in this environment to avoid writing outside the project directory.
