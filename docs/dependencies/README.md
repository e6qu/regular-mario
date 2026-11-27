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

## Security overrides checked on 2026-10-09

The following tooling dependencies are pinned through `pnpm.overrides` so that
linting and bundling resolve patched releases. No direct dependency is added.
Registry metadata was checked with
`pnpm view <package> version time license repository --json`; both selected
versions are the latest registry releases and more than three days old.

| Package                                                       | Selected version / published at   | Purpose and license                                                                                                                                                              | Security fixes                                                                                                                                                                                                                         |
| ------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [brace-expansion](https://registry.npmjs.org/brace-expansion) | 5.0.12 / 2026-09-14T21:59:00.288Z | Minimatch brace expansion used by ESLint; MIT, compatible with AGPL-3.0-or-later. Maintained in [juliangruber/brace-expansion](https://github.com/juliangruber/brace-expansion). | [Recursion in nested groups](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [comma parsing recursion](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p), [quadratic rewrite](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr). |
| [source-map-js](https://registry.npmjs.org/source-map-js)     | 1.2.2 / 2026-09-30T14:08:09.382Z  | Source-map processing used by Vite/PostCSS; BSD-3-Clause, compatible with AGPL-3.0-or-later. Maintained in [7rulnik/source-map-js](https://github.com/7rulnik/source-map-js).    | [Indexed section offset denial of service](https://github.com/advisories/GHSA-68fv-2mgg-jv7q).                                                                                                                                         |

The frozen install and transitive license/audit gates verify the resolved graph;
the full lint, test and build gate verifies its use by existing tooling. Keep
these pins until upstream resolutions select an equally safe version.

## Production container security

The runtime uses Docker's official Node 26.13.1 Debian 13 image, pinned to
`sha256:abe7e5a82b61a8ef67b315b85497c9e65173387ccf2f4a029248184b8e020be5`.
[Docker Hub metadata](https://hub.docker.com/v2/repositories/library/node/tags/26.13.1-trixie-slim)
records publication at 2026-11-24T11:41:05.538038Z, beyond the three-day window
when adopted. Node is MIT-licensed; [the official image](https://github.com/nodejs/docker-node)
contains separately licensed Debian packages. The existing BuildKit pin moved
to the official digest published on 2026-11-20, also beyond the window.

Debian packages resolve against signed main/security snapshots from
`20261124T000000Z`; the build rejects a snapshot inside the admission window.
Historical snapshot expiry is disabled only because the snapshot is deliberately
immutable; archive signature and package hash verification remain enabled.
The existing runtime and trust boundary are unchanged. The alternative of
retaining Debian 12 left fixable apt, PAM, and Perl vulnerabilities in the
container scanned on 2026-11-27.

The image prunes development dependencies after building and removes the base
image's unused npm/npx/Yarn package-manager files. The reported `undici@6.28.0`
and `brace-expansion@5.0.9` findings were in
`/usr/local/lib/node_modules/npm/node_modules/`, not the application's patched
lockfile. The server starts Node directly and needs only its production modules.

The CI-only scanner is [Aqua Trivy 0.76.2](https://github.com/aquasecurity/trivy/releases/tag/v0.76.2),
Apache-2.0, published 2026-11-05. Its official Linux archive is SHA-256 verified
before execution; it is never installed in production. CI builds and boots the
actual unprivileged image, checks that runtime package tools and development
modules are absent, and scans the filesystem. High/critical findings with
available fixed versions and any secret findings fail the gate. Unfixed
advisories remain visible in the log; no advisory is globally suppressed and a
passing gate does not mean all possible vulnerabilities are absent. Scanner
secret-match text is never printed or uploaded.

The image-pin check also rejects adopting a freshly published digest; merely
waiting before suggesting a newer digest did not enforce admission. Its new
negative control failed before the repair and passes afterward.
