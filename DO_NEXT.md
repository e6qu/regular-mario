# DO_NEXT.md

## Water / enemy mechanics — landed, and one honest gap

Landed (all measured/tested, not guessed):

- **Enemies in water/underground/castle levels.** The ROM decoder now emits Buzzy
  Beetle, Hammer Bro, green Paratroopa, Lakitu, red Koopa, and the water Blooper
  (squid) — e.g. 2-2 has 14 Bloopers, castle 8-4 has a Hammer Bro + Buzzy Beetles
  - Paratroopas. Authored parody fish/squid sprites cover them.
- **Underwater rules match SMB.** You can't stomp underwater (swim, don't stomp),
  so Bloopers/Cheeps harm on contact; instead a water level starts Mario with
  **fire power** so he can fight them. A drawn **water surface** (jagged waterline
  at grid row 2, below the HUD) with a matching swim clamp keeps him from swimming
  off the top. A Blooper pursues the swimmer in 2D but gently (avoidable).
- **Buzzy Beetle is fireproof** (fireballs bounce off; still shell-stompable on land).
- **Full-height playfield.** Levels are 15 grid rows (2 HUD rows + a 13-row
  playfield with the standard two-row ground), matching the NES — previously the
  ground was a single-row sliver, which read as "too short."

**Gap — Cheep-cheep schools.** Verified: **zero** Cheep-cheeps decode across all 41
levels. In SMB the swimming/jumping Cheep schools come from _frenzy generators_
(continuous spawners keyed off special enemy-stream objects), not direct placements.
Adding them faithfully needs (a) accurate frenzy-generator decoding — the raw
`decodeLevel(w,l)` path currently disagrees with the `decodeAllLevels` output and
yields garbage high IDs for water areas, so it isn't trustworthy yet — and (b) a new
continuous-spawner simulation feature. Both are real work with real guessing risk;
don't fake positions or spawn cadence. Do the generator decode against the SMB
disassembly's frenzy tables first, then model the spawner, then wire it.

## Clearest next item: finish the warp-pipe return trip

The round trip is now **mechanically possible** but not yet exposed/wired. Landed:

- **Walk-in pipe entry** — pipes carry an `entryDirection` ("down" default, or a
  sideways "left"/"right" walk-in). The pipe state machine enters a sideways pipe
  when the player moves into its mouth at pace (unit-tested in `pipe-state.test.ts`).
- **Mutual addressability** — a multi-area level now includes its main area in the
  warp map, so a sub-area pipe can warp back to it (the return target exists).

Remaining:

- **Editor UI** to place a walk-in/return pipe and point it at the main area
  (today the editor only creates down-warps).
- **Official warp-zone content**: the decoded coin room needs a walk-in return pipe
  wired to the source, and the shared warp zone's **world-indexed return
  connections** still need decoding — with **ROM-verified** landing placement back
  near the source flag. That last part needs the ROM + an in-game playthrough and
  can't be verified here; don't claim round-trip parity until it is.

## Other candidates

- **Exact ROM koopa/star/1-up sprites for the ROM skin.** They never appear in 1-1
  memory to capture; source tile numbers from the SMB disassembly graphics tables
  or capture from a later level, verify visually, then map them in the rom asset set.
- **Fidelity polish:** measured NES movement constants, exact per-state colliders/start
  placement, camera left-lock, HUD glyph/format parity, animation/palette timing, and
  audio parity (user recordings, then an APU-accurate renderer from the user's own ROM).
- **Frame verification:** reconcile the extraction palette with `verify:smb-frames`
  (references and extracted sprites use different NES palette RGBs) to hit 0-diff checkpoints.
- More authored levels; route/enemy-placement tuning after playtesting.
