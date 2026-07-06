# DO_NEXT.md

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
