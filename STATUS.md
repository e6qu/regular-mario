# STATUS.md

## Current State

An original browser platformer with faithful classic-side-scroller mechanics,
built as a deterministic functional-core simulation plus a Phaser/Vite shell.
Preparing for a public beta/demo release. **849 unit tests + browser journeys
pass; all gates green.** 2026-07-17: big Mario ducks through one-tile crawls
(the crouch shrinks the terrain collider like the ROM's duck probes, with
headroom-gated stand-up). 2026-07-16 (later): sideways pipes render whole (the
ROM's four-column mouth/joint/shaft layout, capped intro pipes, faithful
water-pipe tiles); the 1-2/4-2 underground bonus
room's sealed exit is fixed (two ROM-verified decoder bugs: exit-pipe mouth
row, alter-attributes column) and **small Mario's terrain collider is now the
ROM's single tile (14×16)** so the original one-tile crawl routes are
passable. Earlier 2026-07-16: the flagpole finale plays in full (ball
knock, full flag drop, slide, exit march into the castle), poles/pipes render
honestly (invisible goal-reach trigger; ROM-height pipes with real pipe art),
and the regenerated pack keeps every enemy and all completability proofs. Latest fixes (2026-07-15): suspended sessions no
longer double the mobile NES touch deck (per-session DOM roots, see BUGS.md);
the timeline replay shows the death animation on screen (bottom-anchored
camera restore); and the flagpole slide cutscene works on the real SMB maps —
full flag drop, dismount at the base, and a very-top grab knocks the pole's
ball off — with cutscene + Bowser coverage in tests/browser/cutscenes.spec.ts
and new engine tests (five-fireball soak, spiky stomp, point-blank flames).

What exists now:

- **Deterministic pure simulation + replay.** A fixed-step core (movement,
  collision, enemies, blocks, projectiles, pipes, platforms, hazards, scoring,
  lives, timers) steps once per frame and is fully replayable: a recorded input
  log reproduces any run pixel-for-pixel headlessly.
- **Faithful SMB mechanics — complete for every decoded level.** Small↔Powered↔
  Fire tiers, breakable bricks, question/multi-coin/hidden blocks, coins/score
  with the classic scoring paths, star/projectile kills, extra lives, enterable
  and walk-in pipes, springboards, flagpole finish with slide, the death arc,
  **moving lift platforms** (vertical/horizontal oscillators, wrapping
  elevators, drop lifts, rope-linked balance pairs that detach past the limit),
  **rotating firebars** and **leaping podoboos** in every castle, **castle maze
  loop checkpoints** (4-4, 7-4, 8-4's pipe-gated water maze), **vine climbs to
  the coin heavens and 4-2's warp zone** with drop-off returns, warp zones
  decoded like the game ({4,3,2} / {-,5,-} / {8,7,6}), and **tiered hazard
  damage** (hammers/bullets/flames shrink big Mario; recovery/star protect).
- **Faithful enemy roster — the full cast.** Goomba, green Koopa (full shell
  lifecycle), **red Koopa (turns at ledges)**, Buzzy Beetle (fireproof),
  **Paratroopa variants** (winged armored enemies: horizontal glider, vertical
  oscillator, forward hopper — a stomp drops the wings into a walking koopa),
  **Spiny** (spiked: stomping hurts), Piranha Plant (**auto-spawned in every
  pipe outside 1-1**, holds while the player stands near), Hammer Bro, Lakitu
  (real `$11` id — 4-1/6-1/8-2 have theirs), Chaser, Blooper, swimming
  Cheep-cheep frenzy, **leaping flying-Cheep frenzy** over the bridge levels,
  **offscreen Bullet Bill volleys** (worlds 5+ only, matching the ROM's world
  gate), Bullet Bill cannons, **Bowser guarding every castle bridge** (spiky,
  five fireballs to fell, flame volleys; throws hammers from world 6) with the
  **axe ending the level** where the original's bridge chop does.
- **ROM-decoded levels — all 54 areas.** Full terrain (floor/ceiling patterns
  with mid-level alter-attributes, tree/mushroom ledges, bullet-bill cannon
  columns, bridges, exact pipe heights, castle bridges), stream-ordered
  world-scoped area connections (every warp pipe, side exit pipe, intro pipe
  and vine goes to its true destination; the shared underground bonus room
  returns each world to its own level; 1-2's exit really lands in 1-1's flag
  tail, as in the ROM), per-world bonus/cloud sub-areas, and hidden blocks.
- **The scenery layer** — levels read populated, not empty: background
  clouds/bushes/hills/fences from the ROM's repeating three-page scenery
  tables, tree trunks and mushroom stems under ledges, bridge rails, start/end
  castle buildings (walls, battlements, windows, door), water bands under
  bridges and **lava in castle pits** (the castle palette's take on the same
  "hole with water" objects and the fore-scenery band). All drawn as
  decorative empty-collision tiles at background depth.
- **Halfway checkpoints, flag-height scoring, first-quest filtering.** Dying
  past a level's ROM halfway page respawns there instead of the start (castles
  faithfully have none); flagpole scoring pays by grab height (100–5000); the
  ROM's hard-mode-only enemy connections are excluded like a first quest.
- **Level editor / designer** (unchanged surface): paint tiles, blocks, hidden
  blocks, cannons, piranha plants, enemies; multiple areas with warp pipes;
  themes; guided tutorial.
- **Session-persistent lives, coins, score, and power tier.** All persist
  across levels and deaths within a play session and reset only on a new game,
  as in the original (lives/coins live in the engine's `SimulationState`; the
  shell carries them across level rebuilds along with the score total and the
  power tier). Coins/score cross the every-100-coins 1-Up and never reset per
  level; a death restarts the level small. See
  `docs/terminology.md#session-persistent-state-lives-coins-and-score`.
- **End-of-level time-bonus countdown** — remaining time converts to score
  (50/unit) with the clock draining and a rapid tick per unit.
- **Selectable renderer (opt-in)** — a start-menu **Renderer** dropdown and
  `?renderer=` parameter choose Canvas (default), WebGL, or Auto; verified
  pixel-faithful and context-loss-recoverable (decision 0020).
- **Reset saved data** — a confirmed start-menu button clears all persisted
  preferences and saved editor levels.
- **Themes + water, audio, HUD, viewport, timeline replay, multi-session tabs,
  mobile** — mobile-landscape menus/editor/replay overlay all fit without
  scrolling; canvas pixel ratio capped on touch devices for performance.
- **Verification layers**: a start-to-end completability proof and a pinned
  content census over all 54 levels, a live browser check that every menu
  level's running game holds its full decoded content, and headless engine
  playthroughs that drive every main level to a finish.
- **ROM-extracted dev skin (local-only)** covers the entire cast, mechanisms
  and scenery from 92 numeric CHR compositions; all 32 menu levels boot
  under its strict coverage validation.
- **Authored "Shabby Castaway" skin is complete** — art for every visual
  element (92 sprites): the full enemy cast (including the hurler, cloud
  tosser, kelp traps, charcoal buzzies), all 24 scenery tiles, mechanisms
  (firebar orbs, podoboos, lift rafts, the goal pennant), every projectile
  kind (fireballs, bullets, hammers, eggs, flame jets), palette-swapped
  powered/fire player tiers, and the whole editor palette. Nothing renders
  as a vector fallback with the shipped skin.

## Content Boundary

- ROM bytes, ROM URLs, ROM-extracted pixels/audio, and original-game reference
  captures **never** enter git — they stay under ignored `.cache/user-levels/`.
- Committed content is numeric-only metadata (tile indices, palette RGB arrays,
  coordinates, timings, mechanics metadata) plus all code, the
  reverse-engineering docs, and the extraction/decoder scripts.
- The public release ships the authored skin, the numeric SMB level layouts,
  all code, the RE docs, and the extraction scripts. The NES ROM and every
  ROM-extracted asset stay local only.
