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

- **Fixed (2026-07-15): mobile session switches doubled the NES touch deck.**
  Each game session mounts its own touch control panels in the shared game
  layer, but suspending a session (ESC/START to menu, "Next level", switching
  tabs) left them attached and visible, so the next game booted flanked by two
  decks per side with its viewport squeezed between them. Panels now hide on
  session suspend and restore on resume. Two adjacent leaks fixed with it: the
  scene's DOM teardown (panels, window key listeners, replay overlay) only ran
  on Phaser's `SHUTDOWN`, which `game.destroy()` never fires (it fires `DESTROY`)—
  now registered for both; and closing a suspended session's tab never actually
  destroyed the game because `Game.destroy()` defers to the next loop step and a
  suspended loop is asleep — the destroy is now flagged first and the loop then
  woken, whose synchronous tick runs the full teardown immediately. Regression
  test: `touch.spec.ts` "a suspended game's deck never doubles up". A same-day
  follow-up removed the bug class structurally: every session's DOM (canvas,
  panels, overlay) now lives in one per-session root that the session manager
  hides/shows/removes atomically, so no per-element bookkeeping remains to
  drift.

- **Fixed (2026-07-15): the timeline replay played the death animation
  off-screen** (top-anchored camera restore + the replay bar's shorter canvas
  cropped the ground away) — recorded camera views are now re-anchored by
  their world-space bottom edge.

- **Fixed (2026-07-15): the flagpole slide cutscene never ran on the real SMB
  maps** (their pole column is goal tiles all the way down, so the dismount
  scan found no in-column solid base and bailed; any grab froze the player at
  the contact point). The base now falls back to the adjacent columns'
  ground; the flag always lowers fully; a very-top grab knocks the pole's
  ball off. Covered by tests/browser/cutscenes.spec.ts.

- **Fixed (2026-07-16): the flag stopped mid-pole, the ball never dropped, no
  exit march, pipes floated and read as crates.** The goal column painted pole
  art sky-to-ground (fixed with the invisible goal-reach trigger); the ball
  knock was gated to top grabs (now any grab); there was no walk-into-the-
  castle cutscene (added); the decoder drew every vertical pipe one row short
  (ROM-verified size+1 fix) and the skin rendered all pipe tiles as the same
  bamboo square (proper mouth/body sprites + a real enterable-mouth cue).
  Cutscene/pipe regressions covered in tests/browser/cutscenes.spec.ts and
  the regenerated census/completability proofs.

- **Fixed (2026-07-16): the 1-2/4-2 shared underground bonus room sealed the
  player in** ("Mario is stuck here"). Two decoder bugs, both verified against
  the disassembly: the sideways exit pipe's mouth rendered one row too high
  (ExitPipe places the mouth at playfield rows length−1/length, we used
  length−2), and alter-attributes background switches applied one column early
  (AreaParserCore renders a column's terrain _before_ processing that column's
  objects, so the switch takes effect the _next_ column) — together they
  buried the exit pipe's opening inside the wall. With the corrected maps the
  canonical exit route is the ROM's one-tile crawl, which exposed that our
  small player was 24px tall: **small Mario's terrain collider is now the
  ROM's one tile (14×16, feet unchanged)**, so 1-2/4-2's crawl gaps work
  everywhere. Verified by the regenerated census, the completability proofs,
  and the stochastic playthrough driver clearing 1-2/1-3.

- **Fixed (2026-07-16): bonus-room exit pipes rendered as "half a pipe"** — a
  one-tile-wide shaft hanging from the ceiling over a disconnected up-capped
  stub, which didn't read as an enterable side mouth at all (the walk-in exit
  worked mechanically, but nothing about the picture said "walk in here").
  Per the disassembly's RenderSidewaysPipe the sideways pipe is FOUR columns:
  a two-column left-facing mouth (end + horizontal shaft tiles), joint tiles,
  and the vertical shaft's right half running the full height. The decoder
  now paints all four columns; six new side-pipe tile ids ship in both skins
  (ROM CHR metatiles $1c/$1d/$1e/$1f/$20/$21; rotated-culm art in the parody
  skin); intro pipes cap at playfield row 7 like the ROM instead of hanging
  from the ceiling; and water pipes reuse the sideways end tiles (their exact
  ROM CHR tiles).

- **Fixed (2026-07-16): big Mario was hard-stuck at 1-2's one-tile crawl**
  (columns 52-55; the map is VGLC-verified correct — the brick stack really
  leaves only a one-tile gap at the floor). In the ROM, ducking lowers the
  player's terrain probes, so a running duck slides through; our crouch only
  shrank the enemy hurtbox and left the 32px terrain collider, making the
  canonical route impassable for big Mario. Crouching now shrinks the terrain
  collider to the small one-tile box (feet-anchored) and standing back up is
  gated on headroom, so a ducked player under a low ceiling stays ducked.
  One deliberate deviation: ducked movement is a slow crawl (40% walk speed)
  everywhere, and a duck-slide above crawl speed keeps its momentum — the
  original forbids ducked walking entirely, which made the crawl unusable
  from a standstill and let you soft-lock by stalling mid-slide. Engine tests
  cover the shrink, the pass-through, the crawl speed, the covered no-stand,
  and the open-ground stand-up; browser-verified end to end on the real 1-2
  (new debug hook `setPlayerVitality`).

  Follow-up fix (same day): the crouch flag survived the frame pipeline's
  object spreads and never cleared, and the headroom probe (which assumes
  the ducked box) could re-shrink a standing player jumping near a low
  ceiling — big Mario got stuck crouching forever, re-crouching after every
  jump. The returned player now explicitly clears the flag, and only a
  genuinely ducked collider can be held crouched (regression tests).

- **Fixed (2026-07-17): walking out of 1-2's exit pipe into 1-1's tail was
  instant death, and a phantom goomba sat near 1-1's start.** Three decoder /
  engine fixes, all disassembly-verified: (a) enemy records already behind
  the screen can never spawn (ProcessEnemyData consumes them) — the famous
  dead goomba in 1-1's data at column 6 (and dead records in 6-2 and the coin
  heavens) are no longer spawned; (b) warp arrivals now apply the same rule
  the ROM applies on mid-level entry — at entry page P everything before
  column (P+1)\*16 never spawns — so the tail's goombas cannot be waiting on
  the arrival tile (in the original, entering 1-1 at page 11 spawns zero
  enemies); (c) group enemy records use the ROM's 24px (1.5-column) spacing,
  and an enemy glyph can no longer erase a coin when displaced. Verified in
  the browser: the 1-2 exit now lands in an enemy-free tail.

- **Fixed (2026-07-17): big Mario exited pipes half-buried in the ground.**
  `teleportPlayerToTilePosition` put the collider's TOP at the target tile —
  exact for the one-tile small player, one tile too deep for the 32px big
  player. Arrivals are now feet-anchored on the target tile's bottom edge
  (identical for small, standing for big). Unit test pins both sizes;
  browser-verified on the 1-2 → 1-1 exit.

- **Fixed (2026-07-17): sideways pipe mouths read as blocked hatches.** The
  parody skin's side-mouth tiles drew green tube panels behind a narrow
  throat, which framed like a closed door. The mouth interior is now fully
  dark behind the rim ring — an unmistakably open end.

- **Fixed (2026-07-17): ghost lift planks floated in the next level after a
  pipe warp** ("mario can jump through the platform"). `destroyLevelObjects`
  cleared the runtime render collections (lift planks/ropes, spawned actors,
  projectiles, frenzy fish, flame jets…) without destroying the Phaser
  objects — anything alive at warp time survived the rebuild as an intangible
  sprite (1-2's end-of-level lift showed up hovering in 1-1's tail). Every
  runtime render object is now destroyed at level teardown.

- **Not a bug — stomp bounce parity (2026-07-17):** bouncing off an enemy
  gives the original's two heights: hold jump through the stomp for the full
  ~6-tile bounce (how 1-3's gaps are crossed off koopas), release it for the
  small ~1.5-tile hop. Now pinned by an engine test.

- **Fixed (2026-07-17): water levels could be swum straight past their exit
  pipes** — 2-2/7-2 dead-ended behind the funnel because ALL water terrain
  had been made swim-through by a misreading of the ROM's solidity table
  (SolidMTileUpperExt is a LOWER bound per palette group: metatile >= bound
  is solid; an earlier fix read it as an upper bound). Water terrain, coral
  pillars and the end funnels are solid again; the exit swim-in is verified
  live and all completability proofs pass. The known limitation moves to the
  stochastic driver: its swimmer cannot reliably thread solid coral mazes,
  so water mains are excluded from driver expectations (they remain
  BFS-proven and hand-verified).

- **Fixed (2026-07-17): warp-zone fidelity — dead {5} warp, piranhas, missing
  banner/numbers.** (a) 4-2's single-pipe {-,5,-} zone mapped the lone pipe
  to the blank LEFT slot (the ROM picks the slot by screen position — a lone
  pipe is the middle), leaving the warp dead; it now targets world 5.
  (b) The ROM's warp-zone object kills every piranha (ScrollLockObject_Warp
  → KillEnemies), so warp pipes are now piranha-free (1-2's zone, 4-2's
  both zones). (c) The "WELCOME TO WARP ZONE!" banner now shows for ANY
  cross-world warp pipe (it required two distinct targets, hiding it in
  4-2's {5} zone) and each pipe draws its destination world number above
  it, like the original. Screenshot-verified in all three zones.

- **Fixed (2026-07-18): the death animation was effectively invisible in the
  replay flow.** The full sequence (dismemberment/burn/impale/float) only
  re-played if you clicked ▶ Play and watched the whole run from frame 0 —
  and a held Right arrow at the moment of death cancelled playback outright.
  Every death now cuts to an automatic INSTANT REPLAY: the run's final three
  seconds play back on their own and, for contact deaths, end on the full
  death animation as the finale. Keys still held from before the pause no
  longer count as scrub intent (fresh presses still scrub, and Retry always
  interrupts). Covered by death-effects.spec, which now asserts the replay
  fires with no Play click.

- **Fixed (2026-07-18, follow-up): the death-finale corpse persisted over
  every scrubbed frame.** The timeline's button/drag seeks bypassed the
  keyboard path's teardown, so after the instant replay's finale the
  scattered pieces stayed drawn mid-level while scrubbing showed live-run
  frames — and a stale `deathArcStarted` flag then blocked the finale from
  ever re-firing. Every seek now tears the finale down (centralised in
  seekToFrame) and fully resets the effect state, so scrubs render clean and
  playing to the end re-fires the death each time. Regression-tested in
  death-effects.spec.

- **Fixed (2026-07-18, second follow-up): the death frames are now part of
  the timeline — scrubbable back and forth.** The finale used to play only
  in realtime; stepping through it was impossible and the aftermath stuck
  over other frames. Contact deaths now append 180 death-animation frames to
  the recorded run: every seek deterministically rebuilds the effect at
  `frame − pauseFrame` (the effects use no randomness), so the timeline
  buttons and drag step through the explosion/burn/impale/float frame by
  frame in both directions; playback replays the death sound once when it
  crosses the death moment; the realtime replayingDeath machinery is gone.
  One correction found on the way: the auto instant replay must only run for
  DEFEATS — a finish pause keeps showing the live tableau without seeking
  (teleport-assisted runs do not re-simulate past the teleport, which the
  cutscene fixtures exposed).

- **Fixed (2026-07-18): every lift rode one row too low — 8-4's lava-pit
  shuttle spawned inside the lava.** A platform hovers at its spawn row: the
  record's y nibble is a screen row mapping 1:1 onto the grid, but the lift
  metadata reused the walker painter's +1 "settle onto the floor" correction.
  All lifts corrected; 8-4's shuttle now skims the lava surface like the
  original (screenshot-verified).

- **Verified (2026-07-18): 8-4 IS finishable — the maze is the rule, not a
  bug.** Walking past a checkpoint page loops you back by design (the ROM's
  loop command demands the pipe-arrival Y, which walkers can never match);
  the full canonical route was driven live: pipe at x=81 → 114, pipe at
  x=152 → 194, pipe at x=228 → the water room (swim to the mouth at x=69) →
  return at 258 past the final checkpoint → Bowser. Each correct pipe lands
  beyond its checkpoint, so the run progresses only via them — exactly the
  original's maze.

- **Fixed (2026-07-18): 8-4's lava shuttle swept into the pit wall and shoved
  its rider inside the tiles** ("I got stuck in the wall"). Two layers:
  a horizontal lift's ±48px sweep is now clamped to the free span on its row
  (an off-centre base could carry the plank into a side wall), and the
  platform carry is re-resolved against solid tiles, so no plank can ever
  embed its rider (the carry used to apply after collision resolution,
  unchecked). Engine regression test sweeps a walled lift a full period.

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
