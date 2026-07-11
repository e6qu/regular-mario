# BUGS.md

## Known Bugs

### Collision geometry is oversized vs the ROM (from the 2026-07-12 hitbox audit)

A full audit against the ROM's `BoundBoxCtrlData` (disassembly) found our
collision _logic_ faithful but the collision _geometry_ systematically larger
than the original, so the game plays harder than SMB. Two discrete
wrong-outcome bugs from that audit are **fixed** (cannon Bullet Bills now
stompable; stomp keys on descent at any depth). The remaining four are
**characterised but not yet fixed** because they need a render/collision
decouple that a naive edit gets wrong (see the entanglement note):

- **BUG 3 — player object-hitbox too big.** ROM small Mario is 10×12 and big
  Mario 12×24 (feet-anchored); ours is 14×24 / 14×32. Hazards/enemies passing
  above the ROM box hit us. **Entanglement (found while attempting a fix):**
  our small terrain collider is itself 24px tall (1.5 tiles) rather than the
  ROM's ~16px, so anchoring a 12px hurtbox to the bottom of the 24px box puts
  it on the legs only — wrong. A correct fix must first reconcile the terrain
  collider height (which cascades into jump/ground tuning) OR introduce a
  hurtbox offset expressed relative to the _sprite_, and then re-derive; both
  ripple through the replay-fixture golden states and ~9 contact tests. Do this
  as its own carefully-playtested change, not a drive-by.
- **BUG 5 — every enemy uses a 16×16 collider.** ROM boxes: goomba/spiny 10×6,
  koopa/buzzy 12×12, hammer bro 8×24, piranha 10×6, Bowser two 16×19 halves.
  Needs per-enemy collision boxes (distinct from the 16×16 render tile),
  feet-anchored with the ROM offsets. Same render/collision decouple as BUG 3.
- **BUG 2 — Bowser flame hitbox 24×8 vs ROM 4×4.** The flame collides with its
  full 24×8 sprite; ROM entry 8 is a 4×4 box at sprite offset (6,4). Needs the
  projectile's collision box decoupled from its render size (a smaller, offset
  box), so Bowser fights aren't harder than the original.
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
