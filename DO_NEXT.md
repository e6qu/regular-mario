# DO_NEXT.md

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

## Remaining backlog (pre-existing, unchanged)

- Loop zones and frenzy regions are decoder-level region mechanics — not
  editor paint objects (by design; author them via level JSON metadata).
- Balance-lift pairs aren't editor-placeable (pairing UI); single lifts are.
- Per-state player colliders and exact timer conversions (movement constants
  are now ROM-derived; enemy/lift/cadence tuning is still sensible-not-measured).
- ROM-skin sprites for koopa/star/1-up and the new cast (authored skin covers
  them; the ROM skin falls back to shapes).
- Frame verification (`verify:smb-frames` palette reconciliation), audio
  parity, editor UI for connecting walk-in pipes.
- A human playthrough pass over the full 32-level run for feel/pacing.
