# DO_NEXT.md

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

## Remaining: the collision-geometry overhaul (characterised in BUGS.md)

The audit's four systemic geometry bugs (player hitbox 14×24/14×32 vs ROM
10×12/12×24; every enemy 16×16 vs ROM boxes; Bowser flame 24×8 vs 4×4; no
crouch) are **specified but not yet done**. They all need the same missing
piece: a collision box decoupled from the render/sprite size (the ROM's object
bounding box is smaller than the 16px sprite and distinct from terrain
collision). A first attempt at the player hurtbox revealed an entanglement —
our small terrain collider is 24px tall, not the ROM's ~16px, so the hurtbox
can't just be feet-anchored inside it. Do this as a dedicated, playtested
change: reconcile the terrain collider height (re-tuning jump/ground), add
per-entity hurtboxes with ROM offsets, add the crouch state, then regenerate
the replay-fixture golden states. It makes the game _more forgiving_ (matches
the original), so it should not threaten completability.

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
