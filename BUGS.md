# BUGS.md

## Known Bugs

- None currently recorded. (2026-07-11, latest sweep: four fidelity bugs
  found by the new completability proof and fixed — 4-4/7-4 loop-zone rows
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
