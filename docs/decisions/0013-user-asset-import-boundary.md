# Decision 0013: User Asset Import Boundary

## Status

Accepted.

## Date

2026-06-28.

## Decision

Add a browser-only user asset import path that lets players load their own original or community assets and maps at runtime. The repository ships only the loader, parser, and validation code; no copyrighted assets, ROMs, extracted sprites, audio, or level data are committed.

Scope:

- A documented JSON manifest format (`UserAssetManifest`) describes user-provided image, audio, music, and level files.
- A runtime browser loader reads the manifest and the referenced files (via `File` handles or fetch URLs), validates content types and size limits, and produces an in-memory `UserAssetBundle`.
- The import UI accepts either local files or a user-provided manifest URL (`?importAssets=1&manifestUrl=...`). Remote manifest URL sources may be relative to the manifest location; the browser resolves them before fetching maps, sprites, audio, metadata, or compatibility profiles.
- The bundle feeds optional runtime overrides: tile/actor/player sprites replace authored vector rendering when present; audio buffers replace synthesized tones; user levels feed the existing `LevelSpecInput` pipeline.
- A compatibility importer registry dispatches user level files to the appropriate edge parser (`tiled-json`, `vglc-text`, `vglc-smb-text`, or direct `original-json`) and runs the result through `makeLevelSpec`.
- Level entries may reference optional importer sidecar metadata with `importMetadataSource`; direct VGLC SMB text currently uses this for player-start, exit, and full-question-block contents metadata that raw corpus rows do not carry.
- The default dev-server route now attempts to load an ignored local browser-demo manifest from `.cache/user-levels/vglc-smb-browser-demo/remote-manifest.json`. That cache may include user-provided maps, sprites, and audio when prepared locally; missing cache data or a missing default player sprite fails visibly in the import UI instead of falling back silently.

Guardrails:

- Only allowed MIME types are accepted: `image/png`, `image/webp`, `audio/wav`, `audio/mpeg`, `audio/ogg`, `application/json`, `text/plain`. JSON-bearing remote files accept `text/plain` because raw repository hosts often serve JSON text with that content type; the loader still parses and validates the JSON body.
- A per-file and total-bundle size cap rejects unexpectedly large inputs.
- Assets live only in browser memory (`URL.createObjectURL`, `AudioBuffer`, `HTMLImageElement`) and are never written to disk or tracked by the repo.
- Manifest validation is loud: unknown fields, missing required sources, invalid frame rectangles, and unsupported sound events are explicit errors.
- Custom manifest/file import remains available through explicit query parameters or the import UI. The repository does not ship copied third-party maps, sprites, audio, ROMs, patches, extraction outputs, or a hardcoded catalog of third-party copyrighted repositories; users provide the manifest URL or ignored-cache files at runtime.

## Facts Used

- `AGENTS.md` / `PLAN.md` require shipped expression (sprites, music, maps) to be original; mechanics and documented compatibility may be replicated.
- `.codex/skills/copyright-safe-original-game/SKILL.md` and `.codex/skills/level-import-pipeline/SKILL.md` forbid shipping copyrighted level data, extracted assets, ROMs, or patches.
- Existing edge importers (`parseVglcTextLevel`, `parseTiledJsonLevel`) already convert external formats to `LevelSpecInput` and are validated by `makeLevelSpec`.
- Current repository-tracked rendering is original vector art and synthesized audio; copied maps/sprites/audio are loaded only from user-provided runtime inputs or ignored local cache.

## Consequences

- Players can supply their own asset packs and maps, including for the default local dev demo, without the repo containing any third-party copyrighted content.
- The browser shell gains optional image/audio rendering paths while the core simulation remains independent of Phaser and asset loading.
- A new importer registry makes adding future documented formats a matter of registering a parser function.
- Tests use synthetic fixtures and `File`-like blobs, never copyrighted files.

(End of file - total 50 lines)
