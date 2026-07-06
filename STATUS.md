# STATUS.md

## Current State

An original browser platformer with faithful classic-side-scroller mechanics,
built as a deterministic functional-core simulation plus a Phaser/Vite shell.
Preparing for a public beta/demo release. **678 unit tests + 100 browser tests
pass; all gates green.**

What exists now:

- **Deterministic pure simulation + replay.** A fixed-step core (movement,
  collision, enemies, blocks, projectiles, pipes, scoring, lives, timers) steps
  once per frame and is fully replayable: a recorded input log reproduces any run
  pixel-for-pixel headlessly.
- **Faithful SMB mechanics.** Small↔Powered↔Fire tiers, breakable bricks,
  question/multi-coin blocks, hidden blocks, coins/score with the classic scoring
  paths (stomp chains, shell kill chains, 1-UPs), star/projectile kills, extra
  lives, enterable pipes, flagpole finish with slide, and the death arc.
- **Faithful enemy roster.** Goomba, Koopa (full shell lifecycle: stomp → resting
  shell → kick into a slide that flattens enemies → stop, re-emerges into a
  walking koopa with a wobble tell), Buzzy Beetle (fireproof armored — fireballs
  bounce off), Paratroopa (flying), Piranha Plant (pipe emerge, non-stompable,
  fireball-killable), Hammer Bro, Lakitu, Chaser, Blooper (water squid that
  pursues the swimmer in 2D and harms on contact), and Bullet Bill cannons/
  projectiles.
- **Level editor / designer.** Paint tiles (mouse + touch, two-finger scroll),
  coin blocks (stack coins, embed into any block keeping its look), brick/question
  blocks, hidden blocks, cannons, piranha plants; multiple areas with placeable,
  connectable **warp pipes**; per-area colour themes; guided tutorial; play-from-
  creator with round-trip of official levels.
- **Themes + water.** Overworld / underground / castle / water themes drive tile
  palette, backdrop, and parallax; official levels are themed from the ROM area
  type and pipe warps switch a section's theme. Water uses slower, floatier swim
  physics (tap to stroke up, gentle sink, capped at the water surface so strokes
  can't carry you off the top); underwater you swim rather than stomp, so enemy
  contact harms you. The castaway becomes a side-profile **merman** (fish tail,
  arm-stroke + tail-flick animated only when moving, mirrored to his travel
  direction) trailing translucent white-rimmed air bubbles.
- **Audio.** ROM-decoded music (all 3 channels, numeric data only) at the correct
  tempo with per-theme songs, plus original synthesized SFX. Two soundtracks: the
  default **Shabby** sings the melody as a baritone "ba ba ba" (formant vocal
  synthesis) over chiptune bass/harmony; **Classic** is all-chiptune.
- **Faithful HUD + background.** MARIO / 6-digit score / coins / WORLD / TIME
  (counts down from the decoded per-area limit) on every skin; SMB-style parallax
  (two-tone hills, bushes, clouds).
- **Crisp window-filling viewport.** The canvas renders at the display's native
  resolution (window × devicePixelRatio, so HiDPI/retina is sharp) and an integer
  camera zoom expands — not stretches — the world to fill the window.
- **Pause/replay video-editor timeline.** Opens on `P` or any run end: 60fps
  playback with camera restore, keyboard/button/drag scrub, a full-frame filmstrip,
  and export to a replayable `run.json` or `.zip`. Format in
  `docs/run-recording-format.md`.
- **Classic level order + progression.** Official levels ordered by world (1-1 …
  8-4, warps last) with classic HUD numbering. On finishing, the pause/replay bar
  promotes itself into a glistening "LEVEL COMPLETE" banner with a prominent
  "Next level" button (or press N).
- **Deploy stamp.** Every page footers the deployed commit SHA + build time in the
  viewer's own timezone (skipped under automation).
- **Multi-session tabs.** Multiple games/editors run as switchable sessions with a
  session bar; input routes only to the active game.
- **Mobile.** Landscape play with console-style thumb controls and a rotate prompt.
- **Authored "Shabby Castaway" skin.** A complete original beach-themed pixel skin
  (sprites generated deterministically at build time from a committed script, no
  ROM), selectable alongside the ROM-extracted skin; asset-set × map-set chosen
  independently in the start menu.
- **ROM-decoded numeric level layouts.** All 36 SMB areas (1-1 … 8-4) decoded from
  the ROM's own level data into the engine grid; format in
  `docs/smb-level-format.md`.

## Content Boundary

- ROM bytes, ROM URLs, ROM-extracted pixels/audio, and original-game reference
  captures **never** enter git — they stay under ignored `.cache/user-levels/`.
- Committed content is numeric-only metadata (tile indices, palette RGB arrays,
  coordinates, timings) plus all code, the reverse-engineering docs, and the
  extraction/decoder scripts.
- The public release ships the authored skin, the numeric SMB level layouts, all
  code, the RE docs, and the extraction scripts. The NES ROM and every
  ROM-extracted asset stay local only.
