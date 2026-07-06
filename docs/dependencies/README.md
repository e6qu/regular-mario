# Dependency Metadata

Every dependency in `package.json` must have one JSON metadata file in this directory.

File names are derived from package names:

- `phaser` -> `phaser.json`
- `@scope/name` -> `@scope__name.json`

Required fields:

- `name`
- `versionRange`
- `dependencySection`
- `purpose`
- `license`
- `licenseEvidence`
- `agplCompatibility`
- `registry`
- `checkedVersion`
- `checkedVersionPublishedAt`
- `checkedAt`
- `latestCompatibleVersionKnown`
- `wellKnownEvidence`

Rules:

- `agplCompatibility` must be `compatible`.
- Direct dependency licenses must be in the explicit compatible allowlist enforced by `scripts/check-dependency-policy.mjs`.
- Direct dependency versions must be exact pins.
- `checkedVersion` must match the exact package version in `package.json`.
- `latestCompatibleVersionKnown` must be `true`.
- `latestCompatibleVersionKnown` means the selected version is the latest known version that satisfies this repository's dependency policy from the facts available during the check. A newer package version may be rejected when it is 3 days old or less.
- `checkedVersionPublishedAt` must be more than 3 days old at check time.
- `checkedAt` must be an ISO-parseable date and must not be in the future.
- Metadata must match `package.json` exactly for package name, dependency section, and version range.
- `optionalDependencies` are forbidden by project policy.
- Do not add a dependency unless the supporting facts are available from allowed sources.
