# BUGS.md

## Known Bugs

- None currently recorded. (2026-07-06: fixed grounded-Koopa stomp reading as a
  contact death, a missing rebound when shelling/kicking, and blurry HiDPI/retina
  rendering.)

## Risks To Track

- **Content-policy boundary (hard rule).** ROM bytes, ROM URLs, ROM-extracted
  pixel/audio outputs, and reference captures must **never** be committed — they
  stay under ignored `.cache/user-levels/`. Committed metadata is numeric-only;
  extraction/decoder scripts carry no copyrighted bytes. CI and fresh clones can't
  run the faithful mode and must skip ROM-dependent checks gracefully.
- **Warp pipes are forward-only.** The return trip (sideways walk-in pipe into a
  world-indexed warp zone) is not modeled — don't claim round-trip warp parity until
  it's implemented and ROM-verified. See `DO_NEXT.md`.
- **Exact-mechanics claims need evidence** (tests, measurements, or source refs).
  Broader parity — per-state colliders, movement constants, timer conversions,
  enemy/behavior timing — is not yet proven from measured source data.
- **ROM skin gaps:** koopa/star/1-up render as vector fallbacks (not in 1-1 memory
  to capture); exact ROM sprites still need disassembly tile numbers or a
  later-level capture.
- **Supply chain:** record a dependency's license/purpose/maintenance/security
  before adding it; the license/age/vulnerability gates need registry access. No
  copyrighted fixtures in importers.
- **Tooling limits:** the jscpd gate analyzes no Markdown (doc duplication is a
  manual concern); secret scanning is heuristic.
- Keep the continuity files (`STATUS.md`, `WHAT_WE_DID.md`, `DO_NEXT.md`, `BUGS.md`)
  updated with each completed task.
