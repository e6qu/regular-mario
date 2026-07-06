# Decision 0007: Replay Fixture Storage

## Status

Accepted.

## Date

2026-06-26.

## Decision

Keep deterministic replay fixtures as typed TypeScript test fixtures for now.

Do not move replay fixtures to JSON or another committed data format until the project has an explicit replay fixture schema, parser, and validation boundary.

## Facts Used

Facts came from current repository source and command output on 2026-06-26.

- `src/engine/simulation/replay-fixture.ts` defines typed `ReplayFixture` values, branded `ReplayFrameCount`, and a pure `runReplayFixture` function.
- `src/engine/simulation/replay-fixture.test.ts` covers enemy-only, hazard-only, hazard-plus-enemy, collectible, finish, and multi-segment replay routes.
- `pnpm run check`, `PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright pnpm run test:browser`, and `pre-commit run --all-files` passed after replay fixture coverage was added.
- The repository does not currently contain a JSON schema, parser, or importer for replay fixture files.

## Criteria

Required:

- Replay fixtures must use explicit input commands and explicit frame counts.
- Replay fixture frame counts must validate loudly.
- Replay tests must remain deterministic and must not depend on browser timing.
- Fixture storage must not bypass branded domain construction or validation boundaries.
- Fixture storage must not introduce generated, minified, binary, copyrighted, or third-party game content.

Preferred:

- Minimal implementation surface while the replay model is still changing.
- Strong TypeScript feedback for route fixtures and expected states.
- Easy refactoring while movement and collision behavior are still under active development.

## Alternatives Considered

### Typed TypeScript Test Fixtures

Accepted for now.

This matches the current replay runner, keeps fixture construction typechecked, and avoids adding a second parser/validation surface before the replay model stabilizes.

### JSON Replay Fixture Files

Rejected for now.

JSON fixtures would be useful once replay data needs to be shared with tools, editors, or non-TypeScript pipelines. The project does not yet have a replay JSON schema or parser, so adopting JSON now would either bypass validation or require adding a new boundary before there is a concrete external consumer.

### Generated Replay Files From Browser Runs

Rejected.

Generated replay captures would add provenance and regeneration questions, and they would conflict with the current rule against committing generated content unless the regeneration path and policy are explicit.

## Consequences

- Keep replay route fixtures in TypeScript tests for the current simulation milestone.
- Add a replay fixture schema and parser before accepting external replay data files.
- Revisit this decision when replay fixtures need to be consumed outside Vitest or shared with level/import tooling.
