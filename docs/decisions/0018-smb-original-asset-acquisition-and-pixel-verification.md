# 0018: SMB Original Asset Acquisition And Pixel Verification Boundary

## Status

Accepted.

## Context

The engine implements classic SMB-style mechanics, and the VGLC importer can load
the real World 1-1 map layout. But faithfulness cannot be proven — or even tuned —
against placeholder art: collider sizes, animation timing, camera behavior, HUD
layout, and overall feel are only verifiable when the engine runs with the original
graphics and is compared frame-by-frame against the original game's output.

The project accepts this and adopts a local-only original-asset workflow with a
pixel-exact verification harness, while keeping the repository free of copyrighted
content.

## Decision

### What the repository ships

- Engine, importers, and prep/verification tooling.
- `scripts/acquire-smb-sources.mjs`: ensures the MIT-licensed VGLC corpus is cloned
  into the ignored cache, and resolves a **user-supplied** ROM (local path, or a URL
  the user configures). Verifies the ROM by iNES header and SHA-256 checksum.
- `scripts/extract-smb-rom-assets.mjs`: decodes CHR ROM pattern tables (documented
  iNES/2bpp planar formats), renders tiles through the documented NES master
  palette, and composes game sprites using a committed numeric layout map.
- `pnpm run prepare:smb`: one-command orchestration of acquire → extract → asset
  fragment → browser-demo bundle, all inside `.cache/user-levels/`.
- `pnpm run verify:smb-frames`: deterministic scripted replay with canvas captures
  at declared frame checkpoints, compared pixel-exact against user-supplied
  reference frames.
- **Numeric metadata only** in tracked files: tile indices, palette ids, sprite
  layout coordinates, frame-timing tables, and file checksums. These are facts, not
  protected expression.

### What the repository must never contain

- ROM files or any byte ranges copied from them.
- Hardcoded ROM download URLs or catalogs of infringing hosts. The ROM source is
  provided by the user via `--rom <path-or-url>`, the `SMB_ROM` environment
  variable, or a pre-placed file at `.cache/user-levels/smb/rom.nes`.
- Extracted pixel or audio data (PNGs, sheets, PCM, etc.) — extraction outputs live
  only under ignored `.cache/user-levels/`.
- Reference screenshots or video captures of the original game — the user captures
  these from their own emulator into `.cache/user-levels/smb-reference-frames/`.

### Default dev behavior

`pnpm run dev` targets a fully playable SMB 1-1 by default:

- If the cache bundle is complete, boot it.
- If incomplete and a ROM source is configured, run the acquisition/extraction
  pipeline automatically, then boot.
- If incomplete and no ROM source is configured, fail visibly with exact setup
  instructions. No silent fallback to placeholder assets in this mode.

### Audio (including music)

Faithful audio is a required part of the milestone, not an optional extension.
NES music and sound effects are 6502 code driving the APU, not stored audio
data, so there are two stages:

1. **User-provided recordings** loaded through the existing manifest
   sounds/music entries (the user captures audio from their own emulator).
2. **APU-accurate playback from the user's own ROM**: a minimal 6502+APU
   renderer (NSF-style) that runs the game's sound engine and produces PCM
   locally — rendered into the ignored cache or in real time via WebAudio.

In both stages, no audio data, recordings, or rendered PCM are ever committed.

### Verification standard

A declared set of frame checkpoints (first visible frame plus checkpoints along a
scripted run) must be **pixel-identical at 256x240** to the user-captured reference
frames. The existing `compare:images` tooling reports per-checkpoint diffs; the
milestone is complete only when all checkpoints report zero differing pixels and a
human can play 1-1 end-to-end.

## Consequences

- Faithfulness work becomes measurable: every engine change can be validated
  against concrete frame diffs instead of subjective judgment.
- Every developer must supply their own ROM and reference captures; CI and fresh
  clones cannot run the faithful mode and must skip these checks gracefully.
- Checksum pinning means ROM revision mismatches fail loudly instead of producing
  confusing pixel diffs.
- The repository content policy gains a new risk surface (extraction outputs) that
  stays safe only while cache paths remain ignored; the content policy checker and
  `.gitignore` must keep covering them.
