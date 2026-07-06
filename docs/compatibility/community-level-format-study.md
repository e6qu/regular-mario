# Community Level Format Study

## Goal

The compatibility target is exact simulation fidelity for supported source formats: level layout, actor identities, actor dimensions, collider sizes, spawn positions, movement constants, timers, interaction rules, and level transitions must be represented explicitly before we claim compatibility.

## Copyright Boundary

- The repository must not contain ROMs, extracted original maps, copied original level data, sprites, sounds, music, patches, or generated extraction outputs.
- Tests for copyrighted originals must run only against user-provided local files or ignored cache files, such as `.cache/user-levels`.
- Download helpers may accept user-specified URLs for legal community files, but must not ship built-in URLs to copyrighted maps, ROMs, or extracted original content.
- Original-game compatibility should use local user-owned ROM or patch inputs, transform them in ignored temp/cache paths, and validate the resulting data without committing it.

## Formats To Study

### Tiled JSON

Primary reference: `https://doc.mapeditor.org/en/stable/reference/json-map-format/`

Current support is intentionally narrow:

- one finite tile layer with numeric global tile ids,
- object layers for actors,
- square tile dimensions,
- tileset tile metadata for collision ids.

Fidelity gaps before broad community support:

- infinite maps and chunked layers,
- encoded/compressed layer data,
- gid flip/rotation flags,
- multiple tile layers with priority/semantics,
- object dimensions and custom properties,
- typed class/property metadata.

### VGLC-Style Text

Reference corpus to study: `https://github.com/TheVGLC/TheVGLC`

The VGLC README describes the corpus as "easily parseable formats" and points to the 2016 paper. The repository root includes a `Super Mario Bros` directory with `Original`, `Processed`, `Multi-layer`, `Paths`, and `smb.json`; the repository license file is MIT. The SMB metadata file maps direct corpus symbols including `X`, `S`, `-`, `?`, `Q`, `E`, pipe pieces, `o`, `B`, and `b`.

Current support has two cases:

- `vglc-text`: project-local JSON wrapper with tile and actor legends plus separate tile/actor grids.
- `vglc-smb-text`: direct SMB-style raw text rows for the subset of symbols the current `LevelSpec` can represent without silently inventing missing source metadata.
- `vglc-smb-multi-layer`: direct SMB multi-layer structural rows. The primary level file is the structural layer text; optional `importMetadataSource.multiLayer.playerPathLayer` can carry the matching player-path layer text.

The direct SMB importer currently accepts:

- terrain: `-`, `X`, `<`, `>`, `[`, `]`;
- empty/used question blocks: `Q` as a solid used block;
- breakable blocks: `S` as a breakable tile; powered players break upward-hit blocks, while small players bump them as solid;
- cannon tiles: `B` as a solid hazard cannon top and `b` as a solid cannon bottom;
- actors/items: `E`, `o`;
- synthetic harness/test markers for metadata the raw corpus does not carry: `P` for player start and `G` for exit.
- optional JSON sidecar metadata through `importMetadataSource`, currently `playerStart: { "x": number, "y": number }`, `exits: [{ "x": number, "y": number }]`, full-question-block defaults via `questionBlockContentsDefault`, per-block overrides via `questionBlocks`, named path annotations via `paths`, pipe transitions via `transitions`, and explicit frame timers via `timer` or `timers`;
- full question blocks: `?` only when `importMetadataSource` includes either `questionBlockContentsDefault: "coin" | "power-up"` for every unlisted `?`, or `questionBlocks: [{ "x": number, "y": number, "contents": "coin" | "power-up" }]` for per-coordinate contents. Per-coordinate entries override the default, so the importer can map each block to an explicit interactive tile with known contents.
- level timers: `timer: { "id": "level-timer.frames", "value": positiveInteger }` or `timers: [{ "id": "level-timer.frames", "value": positiveInteger }]`; `unit` defaults to `"frames"`, and explicit `"smb-time-units"` values are converted to frames by multiplying by 24. The runtime decrements the timer once per simulation frame and defeats the player with `time-up` when it reaches zero.
- timed cannon projectiles: `cannonProjectiles: [{ "spawnerId": string, "x": number, "y": number, "direction": "left" | "right", "intervalFrames": positiveInteger, "initialDelayFrames": nonNegativeInteger, "speedPixelsPerSecond": positiveNumber, "widthPixels": positiveNumber, "heightPixels": positiveNumber, "lifetimeFrames": positiveInteger }]`; each coordinate must point at a `B` cannon-top symbol, and runtime shots move as hazard projectiles that defeat the player on overlap.
- path annotations: lowercase `x` cells in VGLC `Paths/*_Annotated_Path.txt`-style grids are preserved as `pathAnnotations` while mapping to empty gameplay tiles. Sidecar `paths: [{ "id" | "pathId": string, "points": [{ "x": number, "y": number }] }]` can also supply named path traces for local research inputs.
- level transitions: sidecar `transitions: [{ "id": string, "x": number, "y": number, "targetLevelName"?: string, "targetTileX": number, "targetTileY": number }]` maps source pipe coordinates to runtime pipe actors. Each source coordinate must point at a supported pipe symbol.
- multi-layer structural data: `vglc-smb-multi-layer` maps currently represented structural symbols such as `-`, `#`, `|`, pipes, `?`, `M`, `O`, `+`, `*`, `H`, `B`, `C`, `c`, `V`, `X`, `Y`, `y`, `g`, `o`, `k`, `K`, `t`, and `h`. The `V` and `X` plant symbols map to a static `plant-hazard` tile; this preserves hazard collision but is not exact emerging plant timing or pipe behavior. The `Y` spring top maps to a first-class spring tile that launches the player upward with an authored `springLaunchSpeed`; `y` maps to its solid spring base. The `O` multi-coin brick maps to a repeatable coin-content interactive block with an authored finite spawn limit; exact source-specific timer/count rules are not verified. The `+` extra-life brick maps to an interactive block containing an explicit extra-life actor with an authored one-spawn limit; exact hidden/reveal conditions, score/life table behavior, and source timing remain unverified. The `*` star block maps to an interactive block containing a source-neutral invincibility power-up with an authored 600-frame duration; exact source-specific duration, music, scoring, speed, palette, and enemy-combo rules remain unverified. The `H` beanstalk block maps to an interactive block containing a source-neutral climbable vine actor; exact source-specific vine growth timing, destination routing, bonus-area transition, animation, and scroll rules remain unverified. The `k` and `t` symbols map to the currently modeled armored enemy role, including kicked/sliding shell motion, obstacle/world-boundary reversal, player harm, and enemy defeat-on-overlap; exact source-specific shell speed, wake-up timing, scoring, per-state colliders, and animation remain unverified. `K` maps to the currently modeled flying enemy role, and `h` maps to a source-neutral throwing enemy role with deterministic diagonal hazard projectiles. This is represented runtime behavior, not a claim that every source-specific enemy frame, collider, movement pattern, projectile arc, or timing is exact. Source-specific objects whose behavior is not yet modeled fail loudly instead of being approximated. Optional `multiLayer.playerPathLayer` text preserves `x` path cells as runtime-visible path annotations.

A raw `?` without sidecar contents metadata is rejected instead of guessing its contents. `questionBlockContentsDefault` is also rejected when the level has no `?` cells, so stale sidecar data is not silently ignored. The primary VGLC SMB `smb.json` file lists symbol labels, including `B`/`b` cannon tiles, but does not carry per-level timers or cannon firing schedules; those must come from user-provided sidecar/profile data.

Fidelity gaps before claiming VGLC compatibility:

- conversion from corpus symbols to actor dimensions and behaviors,
- treatment of unknown or game-specific symbols as explicit unsupported cases.
- richer original-source metadata beyond the current player-start, exit, and question-block contents sidecar fields.

### User-Owned Original Game Data

Compatibility with original commercial levels must be based on user-owned local files. The project can provide extraction adapters that read local ROM/patch data from ignored paths and convert it to `LevelSpec` or a future richer compatibility model.

Fidelity gaps before original-level compatibility:

- source-specific level object decoding,
- enemy/object stream decoding,
- area headers, exits, pipes, scroll/camera rules, and timers,
- actor/collider dimensions by identity and state,
- exact spawn positions and screen/page coordinates,
- behavior profiles for each source game's rules,
- conformance tests that run only when the user supplies local source files.

### Community Patches And Hacks

Patch formats such as IPS/BPS should be treated as user-provided inputs, not bundled content. A future workflow can accept a base ROM path plus a patch path in `.cache/user-levels`, apply the patch in an ignored temp directory, and run the same extractor. The repo must not ship base ROMs, patched ROMs, or copyrighted extraction outputs.

## Required Engine Work For 100% Fidelity

`LevelSpec` currently models actors by tile position and role. Several simulation paths assume one-tile actor bodies. To support exact imported behavior, the engine needs:

- per-actor sprite dimensions and collider dimensions,
- per-state collider dimensions for player and enemies,
- source-format actor identities separate from original project actor roles,
- compatibility profiles for movement constants and timers,
- broader level-transition metadata for non-pipe exits and multi-area routes,
- importer conformance reports that list unsupported objects instead of silently approximating.

`CompatibilityProfile` is now the code-facing model for the actor-size, collider-size, behavior-profile, movement-constant, timer, and unsupported-feature parts of that list. User level manifest entries may reference an optional `compatibilityProfileSource`, and the browser loader validates that user-provided JSON profile beside the level. Loaded profiles now produce conformance reports for unsupported features, unmapped actor profiles, and actor role mismatches; the browser import UI blocks those issues before booting gameplay. When a profile is conformance-clean, its actor sprite/collider dimensions and positive frame-count timers are applied to imported runtime `LevelSpecInput`, actor overlap paths use those collider dimensions, and runtime level timers can count down through `LevelTimerState`.

The first profile-backed behavior constants are the complete spawned power-up movement triplet:

- `spawned-power-up.velocity-x`
- `spawned-power-up.gravity`
- `spawned-power-up.terminal-fall-velocity-y`

Supplying only part of that triplet is invalid; this avoids silently mixing source-specific values with authored defaults. The remaining parity blockers are per-state colliders, broader movement constants, source-specific timer conversions, and source-specific behavior profiles.

## Safe Download Helper

Run `node scripts/download-user-level.mjs --url <https-url> --sha256 <hex> --out .cache/user-levels/<file>`.

The helper has no built-in URLs, requires SHA-256 verification, requires HTTPS, and writes only under ignored `.cache/user-levels` paths.

## VGLC SMB Cache Prep

For local fidelity work against the public VGLC repository, keep the clone under the ignored cache and generate a manifest plus sidecar metadata there:

```sh
git clone --depth 1 https://github.com/TheVGLC/TheVGLC.git .cache/user-levels/vglc
pnpm run prepare:vglc-smb-research -- --smb-root ".cache/user-levels/vglc/Super Mario Bros" --out-dir .cache/user-levels/vglc-smb-research
pnpm run research:user-levels -- --manifest .cache/user-levels/vglc-smb-research/research-manifest.json
```

The prep step currently targets VGLC SMB `Processed/*.txt` files. It derives `playerStart`, `exits`, and path annotations from matching `Paths/*_Annotated_Path.txt` files, adds `questionBlockContentsDefault` only for levels that contain raw `?` cells, and writes all generated sidecars under `.cache/user-levels`. Do not commit the clone, generated manifest, generated metadata, or any copied corpus files.

When the VGLC SMB `Multi-layer/Structural Layer` directory is present, the prep step also writes `multi-layer-research-manifest.json` and `multi-layer-unsupported-symbols.json` under the ignored output directory. The multi-layer manifest is an audit input for current gaps; it is expected to fail the research harness while source-specific symbols such as lakitu remain unmodeled. Plant symbols currently import as static hazards, not exact source plant behavior; spring symbols import as explicit spring top/base tiles with authored launch tuning; `O` imports as a finite repeatable coin-content block, not source-verified exact multi-coin brick timing/count parity; `+` imports as a one-spawn extra-life block, not exact source hidden/reveal or life-table parity; `*` imports as a timed invincibility power-up with authored duration, not source-verified exact star behavior; `H` imports as a climbable vine block, not source-verified exact vine growth or routing parity; `h` imports as a throwing enemy with authored projectile behavior, not source-verified exact Hammer Bro parity. The unsupported-symbol report is the source of truth for prioritizing those next compatibility chunks.

Annotated path cells are normalized left-to-right before deriving sidecar `playerStart`, `exits`, and path points. That ordering is a local research assumption for horizontal SMB corpus levels; it is not a general proof of source-authored route order for every future format.

## Browser Demo Cache Pack

The research manifest uses pathful local file sources that are suitable for the Node research harness. Browsers do not expose selected local files by full path, so generate a flattened ignored demo bundle before loading the same research inputs through the website. For the default Vite dev-server demo, use:

```sh
pnpm run prepare:vglc-smb-browser-demo
pnpm run dev
```

That wrapper reads the VGLC SMB research manifest, writes the default website cache at `.cache/user-levels/vglc-smb-browser-demo`, and lets `/` fetch the generated remote manifest through the guarded `/__user-level-cache/` route. It merges `.cache/user-levels/vglc-smb-assets/fragment.json`, so local user-provided sprites/audio become part of the dev-server default.

The generated cache contains a file-picker manifest and a relative-URL manifest. Use the former when selecting files manually in the import UI; the website uses the latter for the default `/` route. For non-default outputs, call `prepare:browser-demo-manifest` directly with `--research-manifest`, `--out-dir`, and optional `--asset-fragment`.

The default wrapper fails unless `.cache/user-levels/vglc-smb-assets/fragment.json` exists; use `--allow-map-only` only for importer-only testing:

```sh
pnpm run prepare:vglc-smb-browser-demo -- --allow-map-only
```

The fragment uses the same sprite/audio fields as `UserAssetManifest`, with `file` sources under `.cache/user-levels`. Build it from local cache files with:

```sh
pnpm run prepare:vglc-smb-asset-fragment -- --player-sprite .cache/user-levels/<sprite>.png --player-frame 0,0,16,32
```

Optional `--player-transparent-color red,green,blue,tolerance`, `--actor-transparent-color key=red,green,blue,tolerance`, and `--tile-transparent-color key=red,green,blue,tolerance` entries declare a chroma color to remove at browser load time. The browser validates each byte value and fails loudly if it cannot process the image through canvas. Optional `--actor-sprite`/`--actor-frame` and `--tile-sprite`/`--tile-frame` pairs add actor and tile image entries. The helper only writes ignored cache files and does not download or commit assets.

After `pnpm run prepare:vglc-smb-browser-demo`, the wrapper validates the packed default `remote-manifest.json` before the dev server boots. `playerSprite` must exist for the default cache. If the packed default level source is JSON, the wrapper also checks that every tile id in the selected level has a `tileSprites` entry and every non-player actor id has an `actorSprites` entry. If the packed default source is VGLC text, the wrapper does not parse it as JSON; converted tile/actor sprite coverage is enforced by the browser import path after the real importer produces `LevelSpecInput`.

## SMB 1-1 Fidelity Gap Ledger

Do not describe the current engine as 100% original SMB 1-1 parity. Current status:

- Default dev loading: implemented for ignored local VGLC SMB map/metadata plus required ignored sprite coverage. The auto-load path requires `playerSprite`, `tileSprites` for every tile id in the selected level, and `actorSprites` for every non-player actor id in the selected level before booting.
- Original-looking sprites: partial. The loader supports player, actor, and tile sprites, including explicit manifest-declared chroma transparency for ignored local sprite crops, but the current local verification uses cropped ignored PNGs rather than a complete transparent sprite sheet for every player/enemy/tile/item state. The latest default-dev screenshot confirms the current local crop fragment is not visually faithful. The selected-level coverage check prevents incomplete manifests from booting, but does not verify that supplied sprites match exact source animation states or are legally redistributable.
- Player mechanics: partial. Run/jump, coyote/buffer, variable gravity, powered collider resize, enemy stomp rebound, spring rebound, side contact recovery, pits, pipes, projectiles, breakable blocks, coin blocks, coins, and timers exist, but exact SMB frame data, acceleration curves, state-specific hitboxes, skid/duck/climb/swim/fire-state animation coupling, and source-verified movement constants remain incomplete.
- Enemy mechanics: partial. Basic walking enemies, flying/chasing/armored/throwing original roles, stomp/body-contact distinction, activation, patrol obstacle checks, kicked/sliding shells with obstacle/world-boundary reversal, moving-shell player harm, moving-shell enemy defeat-on-overlap, and deterministic throwing-enemy hazard projectiles exist. Multi-layer plant symbols import as static hazard tiles only. Source-specific goomba/koopa/parakoopa/piranha/hammer-bro/lakitu/bullet-bill/cheep-cheep/blooper/bowser behavior, exact shell speed/wake-up/scoring/combo rules, and per-state enemy colliders are not complete.
- Block and item mechanics: partial. Coins, question blocks, breakable blocks, block-spawned coin popup, finite repeatable coin blocks, spawned power-up movement, power-up collection, extra-life pickup counting, authored timed invincibility, and climbable vine actors exist. Hidden blocks, source-exact star timing/scoring/music/palette/combo rules, source-exact vine growth/routing, fire flower/fireball parity, score/combo/life tables, exact block bump timing, and source-verified multi-coin brick timer/count rules are incomplete.
- Level/import coverage: partial. VGLC SMB processed levels import with generated metadata; multi-layer `V`/`X` plant symbols now map to a static hazard tile, `Y`/`y` spring symbols map to spring top/base tiles, `O` maps to a finite repeatable coin-content block, `+` maps to a one-spawn extra-life block, `*` maps to an invincibility block, `H` maps to a climbable vine block, and `k`/`K`/`t`/`h` enemy symbols map to explicit currently modeled enemy roles. Multi-layer unsupported symbols still include lakitu.
- Audio/UI: partial. Runtime can import audio and music, but the repo ships only original synthesized audio. Original SMB audio must be supplied locally through ignored runtime assets.

## Local Research Harness

Run `pnpm run research:user-levels -- --manifest .cache/user-levels/research-manifest.json`.

The harness runs the real importer registry, optional compatibility profile parsing, conformance checks, profile application, and `makeLevelSpec` validation against files already stored under `.cache/user-levels`. It rejects URL sources in the research manifest; download or copy legal user-provided files into the ignored cache first.

Minimal manifest shape: `version: "1"` plus `levels`, where each level has `name`, `format`, `source`, and optional `importMetadataSource` / `compatibilityProfileSource` file sources.

Rules:

- The manifest and every referenced file must be under `.cache/user-levels`.
- The harness must not be used to commit generated conversion outputs.
- Conformance issues are failures; unsupported objects belong in the profile report before we claim import support.
- Common ROM and patch/archive formats remain blocked by `.gitignore` and repository content policy.
