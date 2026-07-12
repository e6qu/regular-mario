# BUGS.md

## Known Bugs

### Collision geometry vs the ROM (from the 2026-07-12 hitbox audit) — all fixed

A full audit against the ROM's `BoundBoxCtrlData` (disassembly) found our
collision _logic_ faithful but the collision _geometry_ systematically larger
than the original. **All six of the audit's bugs are now fixed**: cannon Bullet
Bills stompable; stomp keys on descent at any depth; the Bowser flame has a
small inset collision box; the **player uses a ROM-sized feet-anchored hurtbox**
(`playerHurtbox`, small 10×12 / big 12×24); **enemies narrow to their ROM
widths** (`makeEnemyHurtbox` — goomba/spiny/piranha 10, koopa/buzzy/lakitu 12,
hammer bro 8), keeping the render top so the stomp geometry is unchanged; and
**big Mario crouches** (Down held on the ground → can't walk, hurtbox shrinks to
the ROM's 12×12 duck box, so he ducks hammers/flames). The collision geometry is
ROM-faithful and the game is no longer harder than SMB.

A dedicated crouch sprite now ships (`castaway-crouch` in the authored skin,
palette-swapped for powered/fire, resolved by the render as the `crouch`
action), so big Mario shows a ducking pose while crouching. Minor
player-favouring collision deltas remain, documented and not blocking: player
fireball 6×6 vs ROM 8×8, hammers 6×6 vs 8×8, power-ups 16×16 vs 12×12, podoboo
12×12 vs 10×6.

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
