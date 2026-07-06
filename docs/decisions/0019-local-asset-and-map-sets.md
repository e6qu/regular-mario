# 0019: Local Asset Sets And Map Sets (Separately Configurable)

## Status

Accepted.

## Context

Faithful SMB mode extracts graphics from a user-supplied ROM (Decision 0018),
but the ROM must not be the only way to skin the game. We want to author our own
sprites/tiles/audio locally and swap them in without repacking a ROM, and we want
the level layout (the map) to be chosen independently of the visual/audio skin.

The runtime `UserAssetManifest` conflates two concerns in one object: the visual/
audio assets (`tileSprites`, `actorSprites`, `playerSprite`, `levelVisuals`,
`sounds`, `music`) and the maps (`levels`). That coupling forces every asset
swap to also restate the levels and vice versa.

## Decision

Introduce two independently-configurable local content sets, composed into the
existing runtime manifest at build time:

- An **asset set** describes only the visual/audio skin: player sprite (with
  per-state frames), actor sprites, tile sprites, level visuals, sounds, and
  music. Its `origin` records where it came from — `rom-extracted` (produced by
  the CHR extractor) or `authored` (our own original art/audio).
- A **map set** describes only the levels: name, import format, level source,
  optional import-metadata and compatibility-profile sources.

A pure `composeRuntimeManifestInput(assetSet, mapSet)` merges one asset set and
one map set into a `UserAssetManifestInput`, which the existing
`parseUserAssetManifest` validates. Any asset set pairs with any map set, so the
two dimensions are swapped independently (VGLC map + ROM assets, VGLC map +
authored assets, authored map + ROM assets, and so on).

Both live only under ignored `.cache/user-levels` (asset sets and map sets in
their own directories). The composition logic and descriptor validation are
functional-core code with unit tests; file layout and CLI wiring are shell
concerns layered on top.

## Consequences

- Authoring an alternative skin means writing an `authored` asset set; the ROM
  extractor is just one asset-set producer, not a hard dependency of play.
- The map and the skin are chosen separately, so a single map set can be viewed
  under multiple asset sets for comparison (including pixel-frame verification).
- The runtime manifest, browser loader, and importer boundary are unchanged;
  content sets are a build-time organization layer that emits the same manifest.
- The content policy still applies: no copyrighted maps, sprites, audio, ROMs,
  or extraction outputs are committed; descriptors and the files they reference
  stay in the ignored cache.
