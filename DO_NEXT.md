# DO_NEXT.md

## Landed: playability audit (2026-07-17)

- Water solidity per the ROM's lower-bound rule (exits enforced by the end
  funnels again); warp zones: {5} restored, piranhas culled, banner+numbers;
  cheep bridge levels verified finishable by the driver. Water mains are
  BFS-proven but excluded from stochastic-driver expectations (its swimmer
  can't thread solid coral).

## Landed: spawn-faithful enemies (2026-07-17)

- Dead enemy records culled at decode; warp arrivals cull everything behind
  the entry page like the ROM (fixes the 1-2 exit insta-death); ROM group
  spacing; coins protected from displaced enemy glyphs.

## Landed: duck-through crawls (2026-07-17)

- Big Mario's crouch shrinks the terrain collider (feet-anchored, ROM duck
  probes) with headroom-gated stand-up and covered-crawl input, unsticking
  the 1-2/4-2 one-tile crawl routes.

## Landed: whole sideways pipes (2026-07-16)

- Exit/intro/water pipes now render the ROM's four-column sideways layout
  (mouth + horizontal shaft + joint + full-height vertical shaft; intro caps
  at row 7) with six new side-pipe tiles in both skins — no more "half a
  pipe" over the bonus-room exits.

## Landed: bonus-room exit unsealed + ROM-size small player (2026-07-16)

- Decoder fixes (both SMBDIS-verified): sideways exit-pipe mouth one row
  lower, alter-attributes applied from the _next_ column — the 1-2/4-2 bonus
  room's exit pipe now has an opening.
- Small Mario's terrain collider is the ROM's single tile (14×16,
  feet-anchored), so the canonical one-tile crawl routes (1-2, 4-2) are
  passable; ~60 unit tests migrated to the new geometry, replay goldens
  re-derived, playthrough driver clears 1-2/1-3.

## Landed: flagpole finale + honest pipes (2026-07-16)

- Full flag cutscene (ball knock on any grab, full flag drop, slide, walk into
  the castle), goal-reach import fix, ROM-height pipes with real pipe art and
  a two-tile enterable-mouth cue, structure-preserving enemy placement, and
  hidden-blocks-standable in the completability model (8-4's ROM route).

## Landed: replay death visibility, flagpole cutscene, cutscene/Bowser coverage (2026-07-15)

- Timeline replay re-anchors recorded camera views by their bottom edge so the
  death animation (and all ground action) is visible above the replay bar.
- Flagpole finish fixed on real maps: dismount base from adjacent-column
  ground, full flag drop at any grab height, top-grab knocks the ball off.
- New browser suite tests/browser/cutscenes.spec.ts (flag slide ×2, castle
  clear fixture + real castle with Bowser, fireworks) plus engine tests for
  Bowser mechanics; debug hooks: teleportPlayer + cutscene snapshot.

## Landed: mobile touch-deck session fix (2026-07-15)

- Suspended sessions no longer leave their NES touch panels visible beside the
  next game's canvas (double decks, squeezed play area), and closing a session
  tab now really destroys the game (destroy-then-wake for a synchronous
  teardown; teardown on `DESTROY` too). See WHAT_WE_DID / BUGS.
- Follow-up landed the same day: all per-session DOM (canvas, touch deck,
  replay overlay) now lives in one per-session root element that the session
  manager hides/shows/removes atomically — the scene does no per-element
  suspend/resume bookkeeping at all, deleting the bug class structurally.

## Landed: session state, mobile UX, WebGL renderer (2026-07-12, ninth pass)

- **Session-persistent lives, coins, score, and power tier** — all persist
  across levels/deaths and reset on a new game (see WHAT_WE_DID / terminology).
- **End-of-level time-bonus countdown** (time → score, 50/unit, ticking).
- **Selectable renderer** (Canvas/WebGL/Auto) via a start-menu dropdown and
  `?renderer=` param; fidelity + context-loss verified (decision 0020).
- **Mobile-landscape UX** — menu/editor/replay overlay fit without scroll;
  perf: DPR cap on touch, thumbnail throttle, render-loop set caching.
- **Reset saved data** button; **developer docs** (architecture, terminology,
  CONTRIBUTING).

### Candidate next steps

- **WebGL as the default**: needs the `boot.spec` screenshot baselines
  regenerated (and confirmed to match the CI rendering environment). Currently
  opt-in with Canvas default.
- **Suspended-session WebGL context release** (bound context count with many
  simultaneous WebGL games) — optional; Phaser already recovers a lost context.
- Stabilize the timing-sensitive `boot.spec` "authored enemy-only contact" test.

## Landed: fidelity sweep (2026-07-12, eighth pass)

- **Piranha plants retract into their pipes** (sink 24px, render behind the
  pipe; sim + occlusion tested).
- **Flag-ball grab verified** end to end (top-of-pole = 5000; every height
  band pinned).
- **Exact-position verification for all 54 levels**: census pins every
  actor/mechanism position + a tile-grid digest, and a browser journey boots
  all 54 pack levels (deep-linking sub-areas) and compares live rendered actor
  positions to the decoded spec at frame 0.
- **Mobile NES control deck** moved outside the drawing surface (canvas shrinks
  to make room; cross D-pad + A/B + START); landscape browser test drives it.
- **ROM hitbox audit** + two discrete collision fixes (Bullet Bills stompable;
  stomp-on-descent).
- **All-54 headless playthrough mode** (`SMB_PLAY_ALL=1`) added. Measurement at
  budget scale 2: the mains behave as documented (single-run stochastic
  variance; the union across rounds finishes all but 4-4/8-4). The warp/bonus
  sub-areas do NOT complete from a _cold_ start — e.g. the `smb-warp-2-2-w*`
  rooms are full 160-wide sub-levels whose real entry is a walk-in pipe reached
  in-context, so their bare `PlayerStart` leaves the stochastic driver with no
  route (it stalls at x≈34). This is a cold-start/context limitation of the
  driver, not a level defect: every sub-area is proven completable by the
  static BFS, live-verified for exact content/positions, and traversed
  in-context when a main run takes its entering pipe. Making the cold-start
  all-54 pass would need context-aware warp-room pipe entry + seed sweeps.

## Landed: collision geometry is ROM-faithful; water music; crouch (ninth pass)

- **All six ROM hitbox-audit bugs fixed** (see BUGS.md / WHAT_WE_DID): Bullet
  Bills stompable, stomp-on-descent, Bowser flame inset box, player hurtbox
  (10×12 / 12×24), per-enemy ROM widths, and big-Mario crouch (walk-stop +
  12×12 duck box + a duck sprite in the parody skin). Object collision is now
  decoupled from render/terrain via `playerHurtbox` / `makeEnemyHurtbox`.
- **Water music.** Decoded the ROM's swimming theme (fourth theme) and gave the
  water levels an "underwater Morty" effect bus (lowpass wobble + nasal peak +
  tremolo waver).
- **Mobile NES controls finished**: flank the canvas, haptics, size toggle
  (persisted), pointer-capture thumb-roll, iOS callout/tap-highlight suppression.

## Landed: full-pack verification (2026-07-11, sixth pass)

- Machine proofs over all 54 levels: start-to-end completability (movement
  envelope + transfers + loop gates), a pinned per-level content census,
  and a live browser check that every menu level's running game holds its
  full decoded content. Four fidelity bugs found and fixed (loop-zone rows,
  water coral solidity, walk-in pipe triggers, SecondaryHardMode enemies).

## Landed: the parody skin is complete (2026-07-11, fifth pass)

- Authored art for every visual element: 24 scenery tiles, mechanisms
  (firebars, podoboos, lifts, flag), all projectile kinds, palette-swapped
  powered/fire player tiers, and the full editor cast. No vector fallbacks
  remain with the shipped skin. Plus three boyscout fixes (hidden-block
  scenery holes, projectile render-pool leak, timeline scrub key leak).

## Landed: scenery + checkpoints + scoring (2026-07-11, third pass)

- **Scenery layer decoded** — clouds/bushes/hills/fences/trees, trunks and
  stems under ledges, bridge rails, start/end castle buildings, water bands,
  and lava (not water) in castle pits. Levels no longer read as empty.
- **Halfway respawn checkpoints** (ROM HalfwayPageNybbles; castles none),
  **flagpole height scoring** (100–5000 by grab height), and **first-quest
  hardOnly enemy filtering** are in.

## Landed: the polish deltas are done (2026-07-11, second pass)

Everything from the previous "known deltas" list is now in:

- **Warp progression** — runs keep their origin's HUD number and next-level
  chain through flag-tail/bonus warps; warp-zone jumps retitle the run and
  advance within the new world; clearing 8-4 returns to the menu.
- **Water-level exits** — 2-2/7-2 end by swimming into their sideways water
  pipe (into the shared flag tail, like the ROM), and **8-4's water section
  exits back into the castle past the final loop checkpoint** — the maze's
  true completion path. A committed-pack coherence test now guards every
  cross-level transfer, 8-4's checkpoint/bypass wiring, and every castle's
  boss staging.
- **Castle-clear cinematic** — reaching the axe chops the bridge planks away
  from the axe side, drops the boss, and shows an original rescue message
  (final castle: the friend is freed; others: "in another keep").
- **Spiny eggs hatch** — Lakitu's landed eggs become walking Spinies (capped
  at three), harmful on contact, fireball-killable.
- **Visuals** — paratroopas carry winged sprites/fallback wings until
  stomped; balance lifts draw their pulley ropes.
- **Tuning** — Bullet Bill speed set from the ROM's 3x-walker ratio; a test
  pins star invincibility ignoring flame/hazard contact.
- **Editor** — places the red snapper, winged snapper, urchin and the
  five-fireball warden, plus firebars, podoboos and three lift kinds
  (share-URL codes J-Z); official-level imports round-trip their mechanisms.

## Landed: ROM-exact player physics (2026-07-11, fourth pass)

- Speed-indexed jump tiers (standing 4-tile / running 5-tile apex, latched
  at launch), FrictionData ground accel/friction, terminal fall 270 px/s,
  swim strokes from tier 5. Player movement constants are now source-derived
  from the disassembly's tables, not tuned approximations.

## Landed: headless playthroughs + complete ROM dev skin (2026-07-11, seventh pass)

- A headless engine playthrough test drives every main level to a finish
  (checkpointed exploring controller over the real stepSimulation); the
  walk-in pipe trigger was fixed to gate on input direction (fifth fidelity
  bug). The local ROM-extracted skin now covers the entire cast, mechanisms,
  scenery, and fire-tier player frames (86 numeric compositions).

## Remaining: the stochastic player vs the two deepest mazes

- The headless driver has fully completed every main level except 4-4 and
  8-4 (it reaches their second gates/checkpoints). Their completability is
  machine-proven, their mechanics are unit- and live-verified, and a
  direct regression test proves 4-4's second gate accepts the legitimate
  grounded bottom crossing (the firebar guarding it remains lethal to a
  small player — the real difficulty). What is missing is only an
  automated player skilled enough to chain the full maze runs. Options:
  seed sweeps (SMB_PLAY_SEED), longer budgets, or an authored TAS-style
  input plan per maze executed on the real engine.

## Remaining backlog (pre-existing, unchanged)

- Loop zones and frenzy regions are decoder-level region mechanics — not
  editor paint objects (by design; author them via level JSON metadata).
- Balance-lift pairs aren't editor-placeable (pairing UI); single lifts are.
- Per-state player colliders and exact timer conversions (movement constants
  are now ROM-derived; enemy/lift/cadence tuning is still sensible-not-measured).
- Frame verification (`verify:smb-frames` palette reconciliation), audio
  parity, editor UI for connecting walk-in pipes.
- A human playthrough pass over the full 32-level run for feel/pacing.

## Fidelity backlog (remaining after the 2026-07-19 batch)

- Fire flower as a distinct stationary item when already super (block
  contents by player size); Lakitu respawn after defeat.
- Springboard compression squash animation (the A-boost + boing shipped).
- A vine-grow sound event.
