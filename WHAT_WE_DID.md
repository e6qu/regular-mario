# WHAT_WE_DID.md

Reverse-chronological changelog, grouped by milestone/theme; older granular
entries collapsed. Content boundary held throughout: no ROM bytes, copyrighted
sprites/audio/maps, patches, extraction outputs, or reference captures ever
committed — only numeric metadata, code, docs, and scripts.

## 2026-07-12 — ROM hitbox audit; two discrete collision bugs fixed

- **Full hitbox audit vs the ROM's `BoundBoxCtrlData`.** Traced every game
  object's bounding-box index in the disassembly and compared it to our
  colliders. The collision logic is faithful; the geometry is uniformly larger,
  so the game plays harder than SMB. Two discrete wrong-outcome bugs fixed;
  four systemic geometry bugs characterised in BUGS.md (they need a
  render/collision decouple — see the entanglement note there).
- **BUG 1 — cannon Bullet Bills are stompable.** They are in the ROM's
  EnemyStomped set; our decoded metadata never set `stompable`, so a clean jump
  onto one killed the player. Decoder + parser + the five cannon levels'
  metadata now mark them stompable (Bowser flames stay lethal).
- **BUG 6 — stomp on descent at any overlap depth.** The ROM grants a stomp on
  overlap + downward motion; we additionally required the feet to have been
  above the enemy's top last frame, so a deep descending overlap was wrongly
  harmful. `isEnemyStomp` now keys purely on the descent.
- **BUG 2 — Bowser flame collision box.** Introduced a projectile collision box
  decoupled from the render sprite (`hazardInsetXPixels/YPixels`): the flame
  still renders 24×8 but only its centred ~8×6 core is lethal, so flames are
  dodgeable like the ROM's tiny 4×4 hitbox. Threaded through the decoder,
  metadata, parser, spec, and collision.
- **BUG 3 — player object-hitbox.** Added `playerHurtbox`: the player's
  enemy/hazard/item collisions now use a ROM-sized, feet-anchored box (small
  10×12, big 12×24) centred in the terrain collider, instead of the full
  collider. Terrain/movement is unchanged, so this only makes the player _more
  forgiving_ (head-height threats miss the short box, as in the original).
  Wired through the central `playerOverlapsActorPixel` plus the three ad-hoc
  frenzy/spiny overlap checks; contact tests repositioned and the four
  enemy-contact replay-fixture golden states regenerated deterministically.
- **BUG 5 — enemy object-hitboxes.** Added `makeEnemyHurtbox`: standard 16×16
  enemies now collide the player with their ROM _width_ (goomba/spiny/piranha
  10, koopa/buzzy/lakitu 12, hammer bro 8), centred, keeping the render top and
  height. For a grounded enemy only the width and top affect play, so this is
  the ROM's horizontal near-miss forgiveness with the stomp geometry (which
  keys off the enemy's top) left intact — confirmed by the stomp-heavy headless
  playthrough still completing. Custom-collider enemies (Bowser 28×28) keep
  their box. The four enemy-contact replay fixtures were regenerated again.
- **BUG 4 — crouch (big Mario ducks).** Added a `crouching` flag: when big Mario
  is grounded and holds Down (and isn't entering a pipe), step-simulation
  suppresses his walk and stamps the flag onto the player the collision phase
  reads, so `playerHurtbox` returns the ROM's 12×12 duck box — high hammers and
  flames now sail over him. The stomp/knockback rebuilders intentionally drop
  the flag (they leave the ground), so it self-clears. Unit tests pin the duck
  box and the chest-height miss; a step-sim test pins the walk-stop (and that
  small Mario doesn't crouch). Note: the shipped skins have no crouch sprite, so
  he shows his standing pose while ducking — the mechanic is correct.
  **All six hitbox-audit bugs are now fixed; the collision geometry is
  ROM-faithful.**

## 2026-07-12 — Mobile NES control deck flanking the play area

- **Touch controls flank the canvas (left/right), out of the play area.** On
  coarse-pointer devices the game layer is a flex ROW: two console-grey panels
  sit either side of the game viewport, which narrows to fit between them — so
  the deck never overlaps the game and, crucially, a landscape screen keeps its
  full height (we trade horizontal space, not the precious vertical). Left panel:
  a black cross D-pad (all four directions, incl. a touch Up for vine climbs).
  Right panel: SELECT/START pills over the round red B/A buttons (START = the
  pause/menu). A landscape browser test asserts each panel is entirely to its
  side of the canvas, the canvas is narrower than the window but ~full height,
  every control is present, and pressing Right drives the player.
- **Deep-link any pack level.** A `#play?...&level=` URL naming a warp/bonus
  sub-area (hidden from the menu picker) now boots that level directly instead
  of falling back to the first main — used by the all-54 position check.

## 2026-07-12 — All-54 exact-position verification

- The content census now pins the exact position of every actor, pipe, and
  mechanism per level plus a tile-grid digest, and a browser journey boots all
  54 pack levels and compares the live scene's rendered actor positions to the
  decoded spec at frame 0. See the census/browser entries in the test suite.

## 2026-07-12 — Piranha-in-pipe occlusion, flag-ball scoring, jscpd boyscout

- **Piranha plants retract into their pipes.** A retracted plant now sinks
  `piranhaSunkenPixels` (24px) below its rim rest position — inside the pipe
  and out of contact range — and its render container draws behind the pipe
  tiles (depth -1), so the pipe hides it while it is down, exactly as in the
  original. The emerge interpolation runs from sunken (fraction 0) up to the
  unchanged fully-emerged apex. New unit tests pin the sunken pause, the
  emerged apex, and the player-near hold-hidden behaviour.
- **Flag-ball grab verified end to end.** The flagpole ball at the pole top
  scores the 5000 band; new pure-function tests cover every height band
  (5000/2000/800/400/100), and a step-simulation test asserts a top-of-pole
  grab both finishes the level and awards 5000. (The ball render, flag slide,
  and completion jingle on grab were already wired.)
- **Boyscout: jscpd clone eliminated.** The two official-pack scenario
  regression tests (`down-pipe-standing-entry`, `maze-gate-crossing`) shared
  an identical scaffolding block that had crept the duplicate-code gate over
  its 0.0% threshold at HEAD. Extracted a shared `sim-scenario.test-support`
  (load a pack level, drop the player at a pixel, build inputs, step N frames);
  both tests now read as just the geometry they assert, and the gate is clean.

## 2026-07-12 — The playthrough driver learns the game; two more fidelity bugs

- **Sixth and seventh fidelity bugs fixed**: (6) the loop-command check is
  a STANDING check — the ROM compares Player_Y_Position exactly and
  requires solid ground, when the renderer (a screen ahead) crosses the
  command's page; the old airborne-crossing model could never pass 4-4/7-4
  legitimately. The decoder, the runtime, and the completability proof all
  model the standing+lead mechanism now. (7) a player standing on a solid
  down-pipe mouth could never enter (centre-row mismatch); both the
  standing row and the overlap row now match, with a permanent regression
  test.
- **Driver route intelligence** (all generic, no per-level scripts): trap
  pipes (backward self-warps) refused, only required pipes (forward
  self-warps) taken deliberately, standing gate crossings with
  climb/ground biases from the next gate's band, pit edge-takeoffs mixed
  with ceiling-safe hops, Bowser-flame hops from live projectile state,
  firebar/podoboo wait-outs, springboard held-jump launches, scripted pipe
  mounts, roof-walk dead-end detection, and a monotone per-level progress
  frontier with clock-healthy resume points.
- **Result**: every main level except the two deepest mazes (4-4, 8-4) has
  a verified full headless completion; a three-level smoke playthrough
  runs in the default suite, and SMB_PLAY_FULL=1 runs the exhaustive
  36-level sweep (28/36 in a single stochastic run, rotating with seed).
  4-4 and 8-4 reach ~60-70% depth (gate 2 / checkpoint 2); their
  completability is proven statically and their mechanics unit- and
  live-verified.

## 2026-07-11 — Headless playthroughs of every main level; ROM dev skin completed

- **Headless playthrough test (new)**: a frame-perfect driver steps the real
  `stepSimulation` engine with a seeded exploring controller — run right,
  bounce-jump, hop onto and press into known pipe entrances, swim altitude
  bands, short-hop the goal staircases — keeping immutable state checkpoints
  and rolling back with a fresh seed (and varied hazard-phase arrival) on
  every death or stall; time-ups re-enter the current level with a full
  clock. It follows pipe transfers across sub-areas exactly like the shell.
  Every main level must reach a Finished outcome against the real engine —
  movement, enemies, hazards, mechanisms, pipes, loop zones, timers and
  scoring exercised end to end, everything but rendering.
- **Fifth fidelity bug (the driver caught it)**: walk-in pipes gated on
  `velocity.x`, but collision resolution zeroes velocity against the solid
  mouth — the trigger could still never fire in real play. It now gates on
  the input direction, like the ROM's facing-direction check on its $6c
  side-collision rule.
- **ROM-extracted dev skin completed** (local-only, never committed): the
  extraction map grew from 29 to 86 numeric compositions — every enemy
  metasprite from EnemyGraphicsTable (buzzy, red koopa, paratroopas, the
  spiny and its egg, blooper, cheep, Lakitu, hammer bro, piranha, podoboo,
  the 4x3 Bowser, bullet bill, jumpspring), the mechanism/projectile
  sprites (firebar orb, hammer, flame, lift plank, flag), fire-tier Mario
  palette clones, and all background scenery/castle/water/coral metatiles
  from the Palette MTiles tables. All 32 menu levels now boot under the ROM
  skin's strict coverage validation with correct themes and full casts.
- `build:release-content` now also copies any locally built bundles (the
  ROM skin) into the served dir, so the dev skin stays playable after a
  release rebuild; fresh clones still ship the authored skin only.

## 2026-07-11 — Every level machine-verified start-to-end; four fidelity bugs fixed

- **Completability proof (new test)**: from every one of the 54 levels'
  player starts, a movement-envelope search (walk, ledge drops,
  rise-then-glide jumps, swimming, springs, moving lifts, pipe/vine/fall
  transfers, loop-zone row gates) must reach a finish. All 54 pass; every
  sub-area is also proven reachable from a main level. The proof caught
  three runtime bugs the test suite had never exercised:
  1. **4-4/7-4 maze checkpoints were impassable** — the decoder emitted
     loop-zone rows in NES screen space while the sim compares grid rows
     (two rows lower); no path could ever satisfy the check.
  2. **2-2/7-2/8-4-water exits were sealed** — water-area terrain painted
     solid walls, but the ROM's player-solidity bound ($61 in
     SolidMTileUpperExt) makes water terrain ($69) and solid-block objects
     ($61) swim-through coral. Water terrain above the floor now decodes as
     a non-solid coral tile (new art in both fallback shapes and the skin).
  3. **Walk-in pipes could never trigger** — the sim required the player's
     centre inside the mouth tile, but sideways mouths are solid, so a
     walking/swimming player rests flush and never overlaps. The trigger
     now probes one pixel past the leading edge, like the ROM's
     side-collision rule.
- **SecondaryHardMode enemies restored (fourth bug)**: the "hard bit" in
  enemy streams isn't second-quest-only — the first quest sets
  SecondaryHardMode from 5-3 onward. The old filter stripped those enemies
  everywhere; now 5-3+ correctly gains its extra cast (5-3's offscreen
  Bullet Bill generators over 1-3's layout, red koopas/paratroopas, extra
  hammer bros in worlds 6-8).
- **Content census (new test)**: per-level counts of every actor id, tile
  id, and mechanism pinned to a committed census for all 54 levels, plus
  assertions of well-known original facts (1-1's 16 goombas + 1 koopa,
  halfway at 82, one boss per castle, the frenzy placements, 5-3's
  bullets).
- **Live-content browser check**: the every-menu-level boot test now also
  compares the running game's snapshot against the parsed spec — level
  dimensions and the full rendered-actor census must match live, for every
  level (it immediately caught a stale release bundle).

## 2026-07-11 — The parody skin is complete: art for every visual element

- **Scenery sprites** (24 tiles): clouds, bushes, generated hill slopes with
  speckled peaks, driftwood fence, tree canopies + bark trunks, mushroom
  stems, bridge rope rails, castle masonry (wall/battlement/window/door),
  and water/lava surface+body bands. The tile renderer already preferred
  skin images, so decoded levels now draw them everywhere.
- **Mechanism art + renderer wiring**: firebar orbs and podoboos (pooled by
  kind), lift rafts (stretched driftwood plank), the goal pennant, player
  fireballs, and the pooled timed hazards routed by id prefix — cannon
  bullets (the slug), castle flame jets, hurled hammers, Lakitu's eggs —
  all render skin art with direction flips, falling back to the old shapes
  for sets without it.
- **Player tiers look different now**: powered wears a crimson-dyed tunic
  and the fire tier sun-bleached whites (palette swaps, the classic way);
  the shell resolves fire → powered → bare for sets without fire art.
- **New cast art**: the "hurler" (hammer-bro stand-in) and "cloud tosser"
  (Lakitu peeking over his cloud) replace the goomba-lookalike rendering;
  buzzies are now bare charcoal shells. Every editor palette actor id
  (buzzy-beetle, chomp-bud, hammer-bro, cloud-tosser, spike-hunter,
  snapper-red/winged, urchin, keep-warden) is covered — no fallback
  capsules anywhere. 86 sprites total (was 37).
- **Boyscout fixes**: (1) hidden blocks placed over background scenery no
  longer punch a sky-colored hole that telegraphs them — the renderer
  continues the neighboring scenery art behind the invisible cell; (2) the
  projectile render pool destroyed nothing, leaking one hidden container
  per shot forever — stale entries are destroyed now; (3) dying while
  holding a direction key no longer instantly rewinds the death-replay
  timeline (held keys are ignored by the scrubber until re-pressed) — this
  was also the root cause of the flaky enemy-contact browser test.

## 2026-07-11 — ROM-exact player physics: speed-indexed jump tiers, real accel/friction

- **Jump tiers** (JumpMForceData/FallMForceData/PlayerYSpdData): jump physics
  are latched from |horizontal speed| at launch — below 60 px/s launches
  -240 px/s with 450/1575 rising/falling gravity, 60–93.75 gets the floatier
  421.875/1350 band, and full run speed launches -300 px/s with 562.5/2025.
  Standing jumps apex exactly 4 tiles and running jumps 5, like the
  original. Releasing the button while rising applies the tier's falling
  gravity (the ROM dumps VerticalForceDown into VerticalForce). The latched
  tier lives on the player state (`jumpTierIndex`) so replays stay
  deterministic.
- **Ground accel/friction from FrictionData**: walking 133.6 px/s²,
  running 200.4, deceleration 182.8 (was 455/640/580 — over 3× too strong).
  Reaching full run speed now takes ~45 frames, like the game.
- **Terminal fall speed** 270 px/s ($04 + $80/256 before the clamp).
- **Swim strokes from tier 5**: stroke -90 px/s, rising 182.8, sinking
  140.6, horizontal capped at 60 px/s regardless of B.
- Replay-fixture golden values regenerated (every route keeps its semantic
  scenario; the collectible route now genuinely collects its shard); the
  browser stomp fixture jumps ~80px out to match the floatier walk-speed arc.

## 2026-07-11 — Playthrough sweep: parody skin covers the piranha (boot fix)

- **An automated playthrough sweep** (bot walks every main level via the
  menu's #play route) caught that **31 of 36 levels failed to boot with the
  parody skin**: the skin had no sprite for `vglc-smb-piranha`, and boot
  validation rejects a level whose actors lack sprites — every level with a
  pipe-dwelling snapping plant. Previous probes had coincidentally used
  piranha-free levels (1-1, castles, bridges).
- Added an original "kelp trap" sprite (carnivorous beach pod on a kelp
  stalk) to the parody set and mapped it to the piranha actor id.
- **New browser test boots every menu level** into a running simulation
  (with a real reload per level) so a missing sprite or import failure on
  any level can't slip through again.
- Verified the fore-scenery decode byte-exactly against the ROM table while
  investigating: type 2 walls (2-1/3-1 style) and type 3 water bands are
  correct; the bridge levels genuinely have no drawn water in the original.

## 2026-07-11 — The scenery layer + halfway checkpoints, flag scoring, first quest

- **Scenery decoded — levels read populated.** The decoder now paints the
  ROM's background scenery tables (three styles × 48 columns, repeating
  every three pages, tracked through mid-level alter-attributes): clouds,
  bushes, hills, fences and trees land in their original columns. Tree
  ledges grow trunks and mushroom ledges grow stems; bridges get rails;
  every level with a start/end castle draws it from CastleMetatiles
  (walls, battlements, windows, door). All of it imports as 24 new
  decorative empty-collision tile ids rendered as flat shapes at
  background depth (skin coverage exempts empty/hidden collision tiles).
- **Castle pits are lava, not water**: both the "hole with water" objects
  and the fore-scenery band render with lava glyphs/colors inside castle
  areas — the ROM draws the same tiles and lets the palette make them red.
- **Halfway checkpoints**: HalfwayPageNybbles decoded per world/slot
  (castles have none); dying at/past the checkpoint column respawns there
  (defeat only — never after a warp, never on time-up back-at-start rules).
- **Flagpole height scoring**: the grab height pays 100–5000 like the
  original's slide bands; tracked separately in the sim state and added
  into the total score.
- **First-quest filtering**: enemy connections flagged hard-mode-only in
  the stream are skipped, matching a first playthrough.
- Pack regenerated: **54 levels committed** (numeric glyph grids only).

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
