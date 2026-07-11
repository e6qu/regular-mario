# DO_NEXT.md

## Landed: every SMB mechanic and enemy, for every level (2026-07-11)

The full-roster pass is in (see WHAT_WE_DID.md for the commit-by-commit
breakdown): complete terrain decoding, the whole enemy cast, firebars,
podoboos, lifts and balance pairs, aerial frenzies, Bowser + axe endings,
castle maze loops, vines/coin heavens with returns, correct warp zones and
per-world bonus areas, and tiered hazard damage. 52 decoded levels, all
importing and booting; 709 unit + 100 browser tests green.

## Known deltas to polish next (honest list)

- **Progression through shared flag tails.** 1-2's exit pipe lands in 1-1's
  area at page 11 (exactly what the ROM does). Finishing there counts as
  finishing "1-1", so "Next level" offers 1-2 again. The shell needs to carry
  the originating level through cross-level warps for HUD numbering and
  next-level sequencing.
- **Bowser cinematics.** The axe ends the level at the right place, but the
  bridge-collapse + Bowser-fall sequence and the rescue-retainer room ($35)
  are not staged; the retainer needs an original character + message.
- **Lakitu's spiny eggs.** Lakitu throws plain falling projectiles; the eggs
  don't yet hatch into walking Spinies on landing.
- **Winged/behavior visuals.** Paratroopas render with the same body as
  walking koopas (no wings), Bowser variants share the warden sprite, and
  balance-lift ropes/pulleys aren't drawn.
- **Frenzy/hazard tuning.** Cannon/flame cadences, flying-cheep arcs and lift
  speeds use sensible constants; measuring the originals frame-by-frame would
  tighten feel. Star currently protects from firebars (as in SMB) via the
  generic hazard gate — verify edge cases.
- **8-4 water section.** The water sub-area decodes with swimming + firebars;
  a full playthrough of the maze ordering (loop checks + pipe picks) still
  needs a human run.
- **Editor exposure.** The editor can't yet place the new mechanics
  (platforms, firebars, podoboos, loop zones, frenzies, Bowser, axe).
- Earlier backlog still valid: exact ROM movement constants/colliders, ROM
  skin sprites for koopa/star/1-up (+ the new cast), frame verification,
  audio parity, walk-in pipe editor UI.
