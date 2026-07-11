# BUGS.md

## Known Bugs

- None currently recorded. (2026-07-11: warp progression fixed — a run keeps
  its origin's HUD number and next-level chain through flag-tail and
  bonus-room warps, and a warp-zone jump retitles the run to the target
  world and advances from there.)

## Risks To Track

- **Content-policy boundary (hard rule).** ROM bytes, ROM URLs, ROM-extracted
  pixel/audio outputs, and reference captures must **never** be committed — they
  stay under ignored `.cache/user-levels/`. Committed metadata is numeric-only;
  extraction/decoder scripts carry no copyrighted bytes. CI and fresh clones can't
  run the faithful mode and must skip ROM-dependent checks gracefully.
- **Mechanics tuning is sensible, not measured.** Cannon/flame cadences,
  flying-cheep arcs, lift speeds/amplitudes, podoboo leaps and Bowser's feel
  use documented structure + chosen constants; frame-by-frame measurement
  against the original would tighten them. Exact movement constants,
  per-state colliders and timer conversions remain unproven.
- **Uncinematic castle clear.** The axe ends the level correctly but without
  the bridge-collapse/Bowser-fall staging or a rescue room; Lakitu's eggs
  don't hatch into Spinies yet. See DO_NEXT.md.
- **8-4 needs a human playthrough** (maze ordering, water section, loops).
- **Supply chain:** record a dependency's license/purpose/maintenance/security
  before adding it; the license/age/vulnerability gates need registry access. No
  copyrighted fixtures in importers.
- **Tooling limits:** the jscpd gate analyzes no Markdown (doc duplication is a
  manual concern); secret scanning is heuristic.
- Keep the continuity files (`STATUS.md`, `WHAT_WE_DID.md`, `DO_NEXT.md`, `BUGS.md`)
  updated with each completed task.
