# WHAT_WE_DID.md

Reverse-chronological changelog, grouped by milestone/theme; older granular
entries collapsed. Content boundary held throughout: no ROM bytes, copyrighted
sprites/audio/maps, patches, extraction outputs, or reference captures ever
committed — only numeric metadata, code, docs, and scripts.

## 2026-07-11 — Polish deltas: true endings, hatching spinies, cinematics, editor mechanics

- **Warp progression fixed**: the scene tracks the main level a run belongs
  to. Flag-tail and bonus-room warps (mid-page landings) keep the origin's
  HUD number and next-level chain; a warp-zone jump landing at another main
  level's start retitles the run and advances within the new world; clearing
  8-4 returns to the menu.
- **Water-level exits decoded**: swimming right into the sideways water
  pipe's lower half transfers via the active connection (the ROM's
  CheckSideMTiles $6c rule). 2-2/7-2 now end in the shared flag tail, and
  8-4's water section exits back into the castle at page 16 — past the
  final pipe-gated checkpoint, completing the maze exactly like the
  original (54 levels committed).
- **Castle-clear cinematic**: reaching the axe chops the bridge planks away
  from the axe side, drops the boss off the severed bridge, then shows an
  original rescue message before the finish overlay.
- **Spiny eggs hatch**: Lakitu's landed eggs convert into walking Spinies
  (three live max, goomba-style gravity, harmful on any contact through the
  tiered hazard path, fireball-killable — the fireball is consumed).
- **Visuals**: winged sprites (and fallback wing markers) for paratroopas
  until their wings drop; balance lifts draw their pulley ropes.
- **Tuning**: Bullet Bill speed derives from the ROM's 3x-walker ratio
  (BulletBillXSpdData $18 vs the $08 walker) = 120 px/s; a test pins star
  invincibility ignoring flame/hazard contact.
- **Editor mechanics**: palette entries for the red snapper (ledge-staying),
  winged snapper, urchin (spiked) and the keep warden (five fireballs), plus
  firebar/podoboo/lift markers that export into the mechanics metadata and
  survive import round trips. Share-URL codes for the new items use J-Z
  (A-I stay coin-brick counts); the tutorial tip now stays clear of the
  session tab bar.
- **Pack coherence test**: a committed-content suite validates every level
  parses, every cross-level transfer (pipes, vines, fall exits) targets a
  real in-bounds level, 8-4's checkpoints all have bypass pipes, and every
  castle stages boss + bridge + flames.

## 2026-07-11 — Every SMB mechanic and enemy, for every level

Nine-commit pass that closes the gap between the decoded levels and the full
original game. All facts sourced from the SMBDIS disassembly (the project's
cited RE source) and validated by re-decoding the user's ROM; only numeric
data committed.

- **Complete terrain decoding**: header semantics (timer/entrance/scenery/
  style), the 16 TerrainRenderBits floor/ceiling patterns with mid-level
  alter-attributes (castles and undergrounds finally have their ceilings and
  thick floors), tree/mushroom ledges, bullet-bill cannon columns, bridges,
  exact pipe heights, fixed-row ?-block rows, springs (Y/y), vine bricks (H),
  hidden coin/1-up blocks (i/I), power-up bricks (m), castle demoted to
  scenery. Stream-ordered, **world-scoped area connections**: every warp pipe,
  side exit, intro pipe and vine resolves its true destination; the shared
  underground bonus room returns each world to its own level; warp zones
  derive {4,3,2}/{-,5,-}/{8,7,6} exactly like the game; sub-areas materialize
  per world (52 levels).
- **Full enemy roster**: red Koopas turn at ledges; Paratroopas are winged
  armored enemies (glider/vertical/hopper) whose first stomp drops the wings;
  Spinies hurt when stomped; the Lakitu id bug ($14 vs $11) is fixed so
  4-1/6-1/8-2 get theirs; Piranha Plants auto-spawn in every pipe outside 1-1
  and hold while the player is near.
- **Castle hazards**: rotating firebars ($1B-$1F variants, ~205/146-frame
  revolutions, 6/12 orbs) and leaping podoboos — both pure functions of the
  frame (replay-exact, no new serialized state).
- **Moving lift platforms**: vertical/horizontal oscillators, wrapping
  elevators, drop lifts, rope-linked balance pairs that detach past the rope
  limit; the player lands on, rides, and is carried by them.
- **Aerial frenzies**: leaping flying-Cheeps over the bridge levels and
  offscreen Bullet Bill volleys (worlds 5+ only — the ROM's world gate is why
  1-3 and 5-3 share an area but only 5-3 gets bullets). Both stompable.
- **Bowser guards every castle**: spiky (stomping hurts), five fireballs to
  fell (new multi-hit tracking), flame volleys from the $15 spawners, hammers
  from world 6 (throwing-enemy variant); the **axe ends the level** where the
  original's bridge chop does, behind a real plank bridge.
- **Castle maze loops**: the LoopCmd checkpoints for 4-4, 7-4 (two three-part
  groups) and 8-4's pipe-gated water maze — wrong row ⇒ back four pages.
- **Vines & coin heavens**: vine climbs transfer to the cloud bonus areas
  (and 4-2's {8,7,6} warp zone) via a synthetic pipe entry; cloud areas use
  the cloud terrain override and return the player to their source level's
  entrance page when they drop off the end.
- **Tiered hazard damage**: hammers/bullets/cheeps/flames/hazard tiles now
  shrink big Mario into the recovery window instead of defeating outright;
  recovery and star protect.
- **Skin coverage**: parody sprites for the new cast (red snappers, urchin,
  castle warden, bullet slug, driftwood cannons, vine springs, plank
  bridges); hidden blocks exempted from sprite-coverage validation (they're
  invisible). All 52 levels import, boot, and play; 709 unit + 100 browser
  tests green.

## 2026-07-06 — Deploy stamp, level-complete UX, water world & shabby soundtrack

- **Deploy-info footer**: every page stamps the deployed commit SHA + build time
  in the viewer's own timezone (Vite `define` bakes in GITHUB_SHA / git HEAD + build
  time); pointer-events:none and skipped under automation so it can't perturb
  screenshot baselines.
- **Level-complete bar**: on a finish the pause/replay bar promotes itself — a
  gold-bordered glowing background, a glistening "LEVEL COMPLETE / Press N" banner,
  and a bigger shimmering "Next level" button; pressing N advances to the next level.
- **Water-world merman**: the swim sprite is a side-profile fish-person (profile
  head, stroking arm, teal tail + aqua fluke) that mirrors to face his travel
  direction; two frames animate an arm-stroke/tail-flick only while moving, and he
  holds the swim pose for all water movement. Air bubbles are near-transparent with a
  white-blue rim + specular highlight. Horizontal water resistance makes swimming
  slower and floatier (tuned-to-feel; SMB swim constants aren't source-verified).
- **Shabby soundtrack** (new default "Sound" option): the melody channel is sung as
  a baritone "ba ba ba" — a sawtooth glottal buzz + vibrato through three "ah"-vowel
  formant filters, gated by a "ba" plosive envelope, folded into the baritone
  register — while bass/harmony stay chiptune. "Classic" keeps the all-chiptune track.

## 2026-07-06 — Enemy-contact & rendering fixes

- **Faithful Koopa stomp on the ground**: `isEnemyStomp` keyed the stomp on the
  post-landing velocity, so a fast drop onto a grounded enemy (which lands the same
  frame, zeroing velocity) read as a harmful side contact and killed the player.
  Now keyed on the actual descent past the enemy's top; a persistent side overlap
  still stays harmful.
- **Stomp rebound for shells**: only defeating a simple enemy bounced the player up;
  shelling a koopa or kicking a shell did not, so the player stayed on the fresh
  shell and it could hit him the next frame. Now every stomp/shell/kick rebounds,
  lifting him clear.
- **Crisp HiDPI/retina rendering**: the RESIZE scale mode sized the canvas to CSS
  pixels, so retina upscaled a half-resolution canvas and blurred everything (HUD
  text most visibly). Now the backing store is window × devicePixelRatio at the CSS
  box size — native resolution — sized before the camera is configured to avoid a
  first-frame scroll transient. HUD text is also larger and rasterized at on-screen
  size.

## 2026-07-05/06 — Level editor/designer, enemies, music, themes, mobile

- **Level editor / designer**: paint tiles (mouse + touch, two-finger scroll),
  brick/question/hidden blocks, coin blocks (stack coins; painting a coin embeds it
  into any block keeping the block's look), Bullet Bill cannons, piranha plants;
  multiple areas with placeable, connectable **warp pipes** (teleport in play);
  per-area overworld/underground/castle colour themes; prominent menu button + a
  guided tutorial; shabby-only tileset with persisted choices; play-from-creator
  that preserves areas across play and round-trips official levels.
- **Enemies**: Piranha Plant (pipe emerge, non-stompable, fireball-killable), Buzzy
  Beetle (fireproof armored), Hammer Bro / Lakitu / Chaser exposed in the editor,
  Bullet Bill projectiles. Full faithful Koopa lifecycle: stomp → resting shell →
  kick into a slide (flattens enemies) → stop → re-emerge into a walking koopa with
  a wobble tell. Removed the spurious 1-1 start Goomba.
- **Scoring parity**: faithful stomp-chain sequence (100/200/400/800/1000 + 1-UP)
  and kicked-shell kill chains scoring the full rising sequence.
- **Audio**: decoded the original ROM music (all 3 channels, numeric-only) at the
  correct tempo and play it per theme; a transcribed per-theme song suite.
- **Themes + water**: overworld/underground/castle/water themes drive palette,
  backdrop, and parallax; official levels themed from the ROM area type; pipe warps
  switch a section's theme. Water swimming physics + swimming sprite + air bubbles.
- **Progression + HUD**: official levels ordered by world (1-1 … 8-4, warps last)
  with classic HUD numbering and a "Next level" button on the end-of-level overlay.
- **Multi-session tabs**: several games/editors as switchable sessions with a
  session bar; input routes only to the active game.
- **Mobile**: landscape play with console-style thumb controls + a rotate prompt.
- Two-tone parallax hills; dedicated climb pose; shabby head-bonk feedback.

## 2026-07-03 — Viewport, replay timeline, warp pipes (forward)

- Scale.FIT → RESIZE with an integer camera zoom so the world fills the window;
  flagpole finish with slide.
- **Pause + video-editor timeline** (`P`, or on run end): a DOM overlay recording
  every run (per-frame input + a state keyframe every 300 frames + a thumbnail every
  30), with 60fps playback (camera restored), scrub, a filmstrip, and export to a
  replayable `run.json` or `.zip` (verified pixel-for-pixel). See
  `docs/run-recording-format.md`.
- **Forward warp pipes**: the ROM decoder links an enterable pipe-warp to its
  destination sub-area and emits a transition; the shell loads the target and drops
  the player in (verified 1‑1 → underground coin room). Return trip still open.

## 2026-06-26 → 07-02 — Foundation through faithful mechanics (Milestones 0–8)

- **Toolchain + governance**: `pnpm` (TypeScript/Vite/Vitest/Playwright), AGPL, and
  pre-commit gates (format, lint, typecheck, dead-code, copy-paste, vulnerability,
  license, dependency-age); continuity docs.
- **Deterministic functional core**: branded types/units, validated `LevelSpec`,
  fixed-step simulation (movement, solid collision, contacts, outcomes,
  collectibles, enemy interactions, post-outcome freeze, retry), coyote-time, jump
  buffering, variable jump height, pit/underside defeat, and replay fixtures.
- **Phaser/Vite shell**: input→command mapping, render-from-state, camera follow,
  outcome feedback, Playwright QA; VGLC-text and Tiled importers to `LevelSpecInput`.
- **Faithful mechanics + scoring**: power-up tiers, koopa/shell gravity, goombas
  walk off ledges, classic scoring/lives, faithful HUD, parallax background.
- **Content sets (Decision 0019)**: composable asset sets × map sets with a
  `content-sets` CLI, a Skin × Map × Game-Mode start menu behind a fail-loud
  sprite-coverage gate; the authored "Shabby Castaway" parody skin (build-time
  generated sprites, no ROM).
- **ROM pipeline (Decision 0018)**: `acquire`/`extract`/`prepare`/`capture`/`verify`
  scripts (no hardcoded sources) turning the user's own ROM into numeric palette
  sheets + documented sprite compositions and headless reference-frame checkpoints,
  all under ignored `.cache/`.
- **ROM level decoder** (`scripts/decode-smb-level.mjs`): follows SMB's area/enemy
  pointer tables into the engine grid; all 36 areas (1-1 … 8-4) build into the map
  pack (`docs/smb-level-format.md`). Replaced the lossy VGLC reconstruction.
- **Compatibility importers (Milestone 7)**: VGLC SMB text + multi-layer importers
  with metadata sidecars and a `CompatibilityProfile` model, each fail-loud on
  unrepresented symbols; browser user-asset import; corpus/assets kept under ignored
  `.cache/user-levels`.
