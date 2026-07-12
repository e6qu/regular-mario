# BUGS.md

## Known Bugs

### Collision geometry is oversized vs the ROM (from the 2026-07-12 hitbox audit)

A full audit against the ROM's `BoundBoxCtrlData` (disassembly) found our
collision _logic_ faithful but the collision _geometry_ systematically larger
than the original, so the game plays harder than SMB. Four of the audit's bugs
are **fixed** (cannon Bullet Bills now stompable; stomp keys on descent at any
depth; the Bowser flame now has a small inset collision box; the **player now
uses a ROM-sized feet-anchored hurtbox** for object collisions — small 10×12,
big 12×24 — via `playerHurtbox`, distinct from the terrain collider). The
remaining two are **characterised but not yet fixed**:

- **BUG 5 — every enemy uses a 16×16 collider.** ROM boxes: goomba/spiny 10×6,
  koopa/buzzy 12×12, hammer bro 8×24, piranha 10×6, Bowser two 16×19 halves.
  Needs per-enemy collision boxes (distinct from the 16×16 render tile) — the
  same feet-anchored approach the player hurtbox now uses, applied per enemy.
  **Stomp-geometry caveat (needs playtesting):** `isEnemyStomp` keys the stomp
  off the enemy's _top_ (`enemyActor.position.y`); a feet-anchored ROM box
  moves that top downward, so the player must descend lower to stomp. The box
  height and vertical anchor must be tuned per enemy so stomping still feels
  right — this is why it wants a visual pass, not just numbers. Also re-churns
  the replay-fixture golden states (recompute by dumping each fixture's final
  state, as BUG 3 did). The player hurtbox (BUG 3) already delivered most of
  the "not harder than the ROM" gain; this is the finishing refinement.
- **BUG 4 — no crouch mechanic / crouch hitbox.** Big Mario has no duck; the
  ROM shrinks him to 12×12 (entry 2) when Down is held on the ground — the
  canonical way to duck hammers/flames. Add the crouch state + collider.

Minor/player-favouring (documented, not blocking): player fireball 6×6 vs ROM
8×8, hammers 6×6 vs 8×8, power-ups 16×16 vs 12×12, podoboo 12×12 vs 10×6.

- Otherwise none currently recorded. (2026-07-11, earlier sweep: four fidelity
  bugs found by the new completability proof and fixed — 4-4/7-4 loop-zone rows
  were in screen space and impassable; water-area terrain sealed the
  2-2/7-2/8-4 exits (now swim-through coral per the ROM's solidity bound);
  walk-in pipes could never trigger against their solid mouths (now
  leading-edge probed); and the first-quest filter wrongly stripped
  SecondaryHardMode enemies that belong to 5-3+. Earlier same day: missing
  piranha sprite failed 31 levels at boot; warp progression fixes.)

## Risks To Track

- **Content-policy boundary (hard rule).** ROM bytes, ROM URLs, ROM-extracted
  pixel/audio outputs, and reference captures must **never** be committed — they
  stay under ignored `.cache/user-levels/`. Committed metadata is numeric-only;
  extraction/decoder scripts carry no copyrighted bytes. CI and fresh clones can't
  run the faithful mode and must skip ROM-dependent checks gracefully.
- **Mechanics tuning is sensible, not measured.** Cannon/flame cadences,
  flying-cheep arcs, lift speeds/amplitudes, podoboo leaps and Bowser's feel
  use documented structure + chosen constants; frame-by-frame measurement
  against the original would tighten them. Player movement constants are now
  ROM-table-derived (jump tiers, accel/friction, terminal fall, swim
  strokes); per-state colliders and timer conversions remain unproven.
- **Cinematic staging is shell-side visual only** — the sim ends the level at
  the axe; the chop/fall/rescue overlay never affects replay determinism.
- **8-4's maze wiring is machine-verified** (pack coherence test: checkpoint
  bypass pipes, water-section return past the final checkpoint); a human
  feel/pacing playthrough is still worthwhile.
- **Supply chain:** record a dependency's license/purpose/maintenance/security
  before adding it; the license/age/vulnerability gates need registry access. No
  copyrighted fixtures in importers.
- **Tooling limits:** the jscpd gate analyzes no Markdown (doc duplication is a
  manual concern); secret scanning is heuristic.
- Keep the continuity files (`STATUS.md`, `WHAT_WE_DID.md`, `DO_NEXT.md`, `BUGS.md`)
  updated with each completed task.
