# BUGS.md

## Known Bugs

### Multiplayer entry pipes never handed off their target area — fixed (2026-08-05)

The local scene handled a pipe target level, but the authoritative lobby only
held public selectable levels and continued stepping the source map after the
entry animation. It now retains linked bundled areas, records the authoritative
pipe target, and replaces the party runner with the target area at entry
completion. A server regression covers the full handoff; a World 2-1 runner
regression also proves activated piranhas emerge server-side.

### Pipes were not proven beyond the opening multiplayer camera — fixed (2026-08-05)

The opening World 1-1 viewport ends before the first pipe, which made
start-frame checks unable to distinguish an off-screen pipe from a missing one.
A real multiplayer browser regression now runs to the first pipe using
ordinary keys, proves its collision at x≈434, pauses the game, and captures
the authored pipe frame for direct inspection.

### Enemy contact could remain harmless after recovery — fixed (2026-08-05)

The per-enemy damage debounce correctly protects an enlarged player through
the shrink/recovery animation, but it incorrectly survived the transition back
to small vitality. The damaging enemy now re-arms precisely as recovery ends;
a focused full-state regression preserves the debounce map and requires the
next contact to defeat the small player.

### Rejoined empty-paused games accepted no input — fixed (2026-08-05)

The final-member leave path retains one disconnected simulation slot and pauses
a live game. Reclaiming that slot previously left the runner paused, so the
browser showed gameplay but no authoritative frame or input progress. The
runner now records that this was an automatic empty-party pause and resumes it
on first rejoin; explicit member pauses still require P. The browser journey
asserts that a rejoined player advances the authoritative frame after input.

### Remote co-op movement still visibly desynchronizes — open (2026-08-05)

The browser currently predicts a complete local world and interpolates remote
positions from 20 Hz receipts, but no journey yet bounds the perceived remote
correction distance. Add an observable two-browser motion test and fix the
reconciliation/presentation boundary from its measurements.

### Standalone multiplayer could load development-only asset URLs — fixed (2026-08-05)

A plain production build did not set `VITE_STATIC_CONTENT`, so it could replace
the release client with one requesting `/__user-level-cache/` content. The
standalone server correctly has no such development-cache route and returned
`not found (HTTP 400)` before the login UI. The normal build now emits the
same static `game-content/` URLs used by the standalone release build; a real
browser login and Enter-to-lobby smoke test pass.

### Strict quality gate found duplicate multiplayer test setup — fixed (2026-08-05)

The new death-rejoin test repeated the regular-game setup verbatim, which
correctly tripped the repository's zero-tolerance copy-paste check. The setup
is now one test helper; the focused lobby test and copy-paste gate pass.

### The 3 s cadence check observed before delayed state could arrive — fixed (2026-08-05)

The browser cadence gate sampled a fixed two seconds even when the configured
test transport deliberately held snapshots for three. It reported zero state
messages for the expected condition. The sampling window now extends past the
configured delivery delay and asserts live keyframe/delta traffic afterward;
the rebuilt 3 s real journey passes.

### Stomp visual timing could inherit server reaction state — fixed (2026-08-05)

The server's gameplay state includes a stomp event, but the renderer also used
its x/y/timer directly. That made a visual effect depend on receipt timing.
The client now uses that state only to identify a stomp, finds the locally
presented defeated actor, and runs its own fixed-duration pop. Core stomp and
rebuilt multiplayer browser/parity suites pass.

### Predicted frames could reprocess static map work or overwrite a paused frame — fixed (2026-08-05)

The same scene receipt path handled both server corrections and every 60 Hz
client prediction. That needlessly rescanned persistent tiles and allowed a
queued prediction to race a paused server frame. The scene now has explicit
authoritative and predicted presentation lanes: persistent map mutations apply
at the server boundary, while a non-playing receipt disables prediction until
play resumes. Exact two-client paused-frame parity is a browser regression gate.

### A defeated player could be trapped behind the hidden play drawer — fixed (2026-08-05)

Death correctly retained the player as a spectator, but normal playing mode
hides multiplayer controls. A newly defeated player now gets an opened drawer
with Leave game. That API path frees the slot and a real running-party lobby
test proves that the player can immediately join the same game as an active
current-screen spawn.

### Multiplayer player dismemberment did not start — fixed (2026-08-05)

The normal scene update starts and advances local death effects, but the
authoritative-render scene omitted that path after applying reconciled state.
It now starts and advances the existing client-owned dismemberment effect from
the authoritative defeated outcome.

### Server camera receipts caused viewport jerks — fixed (2026-08-05)

The server's shared camera coordinate was applied as a hard 20 Hz transform,
so even a smooth local simulation visibly jumped whenever a receipt arrived.
Camera is now client-local presentation: it smoothly follows the predicted
local player while authoritative state continues to reconcile gameplay.

### World actors and entry flow could feel one step behind — fixed (2026-08-05)

Only the local player transform was presented at browser-frame cadence; coins,
enemies, and other deterministic actors waited for 20 Hz state receipts.
The renderer now consumes the complete locally predicted state each frame and
uses the server stream only as reconciliation. The password is now submitted
by Enter, and lobby Create immediately begins and enters the game rather than
requiring a waiting-room Start action.

When membership changes after play has started, reconciliation also replaces a
prediction baseline whose player count differs from the authoritative snapshot;
otherwise an existing client can retain a one-player predicted world.

### Multiplayer presentation effects and rendering could stall — fixed (2026-08-05)

The renderer decremented frame-based stomp and score effects once for each
20 Hz snapshot, stretching them roughly threefold. It also dirtied and sorted
the complete Phaser display list for every remote state receipt. Presentation
now advances those effects by the authoritative simulation-frame delta and
retains stable object depths. The real browser journey samples two seconds of
animation frames/long tasks and confirms continuous WebSocket state transport.

### Local server could retain a stale ephemeral game between manual starts — fixed (2026-08-05)

The process listening on port 8080 predated the requested manual start and
still held a `Guest` game in memory. A new browser therefore resumed that
server's old membership. The stale process was stopped and the fresh server
has no inherited games/sessions. Browser QA now clicks the actual `Leave game`
control and asserts that the guest returns to the lobby with the creator's game
reduced to one member.

### World 1-1 physical recording trace contained a hidden rollback — fixed (2026-08-05)

The old trace was emitted by a completion controller that restored a checkpoint
once. Replaying those inputs from frame zero therefore died at x≈2769 in the
authoritative server. Trace derivation now records rollback count and accepts
only seed 56's continuous small-player run. The four-player authoritative
runner test and a fresh four-video production recording enter `smb-1-2`.

### Co-op bots could explode into generic body-part art — fixed (2026-08-05)

The per-robot reaction lookup silently borrowed generic part images when a
robot-specific image was absent. It now requires the correct robot part and
burst rasters. Eight real connected browser players and parity checks pass.

### Primary reaction effects could substitute different art — fixed (2026-08-05)

Explode could become a launch death and burn could display a tinted player crop
if authored images were absent. These primary paths now require their exact
reaction rasters; production journey and pixel-parity checks pass.

### Visible tiles could choose procedural scenery and pipe art — fixed (2026-08-05)

The level tile renderer still supplied geometric scenery, collision tiles, and
pipe-mouth overlays if a manifest raster was absent. It now requires visible
tile rasters and only leaves explicitly invisible gameplay cells unpainted.
Release coverage, lockstep, and raw-pixel browser parity pass.

### Dead procedural actor renderer remained after raster migration — fixed (2026-08-05)

After every live call site required manifest art, the old actor-shape renderer
and its supporting constants still remained in source. They are now deleted,
while real production journey and raw-pixel parity checks still pass.

### Dynamic actors could select procedural substitute art — fixed (2026-08-05)

Runtime-spawned items, shots, hazards, airborne enemies, and platforms had
optional asset lookups that produced geometric shapes when coverage was
incomplete. These paths now require their exact manifest raster and fail
loudly. The production journey, eight-player stress, and pixel-parity browser
checks pass.

### Static exit bypassed its authored raster — fixed (2026-08-05)

`renderNonPlayerActors` intentionally selected the procedural actor renderer
for every generic exit, even though the release manifest supplied the original
`public-exit-arch.png`. It now requires the manifest image and has no static
actor vector substitute path. Release raw-pixel local/server and two-client
browser parity pass.

### World 1-1 four-browser completion recording — fixed (2026-08-05)

Relative Playwright waits accumulated input-edge overhead and made the replay
late against moving enemies. The runner now schedules its ordinary keyboard
edges against absolute 60 Hz deadlines and sends the physical `ShiftLeft` run
code expected by the multiplayer input layer. Four real recorded browsers now
finish World 1-1 and render World 1-2; the production stress, journey, visual
parity, and side-by-side suites pass afterwards.

### Hazard-damage fixture used an obsolete fixed spawn — fixed (2026-08-05)

`hazard-damage-tiering.test.ts` placed thorns at the former hard-coded initial
player coordinate. Initial state now correctly derives its position from the
level's `player-start` actor, so neither damage assertion actually contacted a
hazard. The fixture now places thorns in that actor's feet-anchored overlap
footprint; small, powered, invincible, and recovery damage-tier cases all pass
again without changing game collision behavior.

### Delayed snapshots could rewind local prediction at the same simulation frame — fixed (2026-08-05)

`frame` was used to order both snapshots and delta baselines, even though the
server can change from waiting to playing at frame zero and resets that clock
on a course handoff. Delayed packets could therefore restore an older waiting
state, and every 20 Hz old snapshot reconciled the local player before the
server had acknowledged its new input. The protocol now has monotonic
`snapshotSequence`/baseline-sequence validation, Start emits a state keyframe,
and client reconciliation waits for acknowledgement progress. The actual
side-by-side canvas moves within 750 ms under a 3 s injected WebSocket delay;
the complete production suite passes at both 100 ms and 3 s.

### Shared `pipe-route` could not complete — fixed (2026-08-05)

The route had only an exit actor. The deterministic simulation correctly
requires an overlapping goal tile, so a player could run off its map without
finishing. The original shared source now supplies that goal tile; local and
authoritative multiplayer play use the same input. A four-browser recorded
journey completes the route and renders the next shared course.

### Profile refresh could reset the selected public course — fixed (2026-08-05)

Saving a profile asynchronously rebuilt the lobby while old controls remained
interactive. A fast select/create could therefore send the rebuilt selector's
default instead of the visible choice. The lobby is now inert during the
authoritative refresh, and browser QA asserts the real create request body.

### Public multiplayer exit rendered as a castle axe — fixed (2026-08-05)

The default asset bundle mapped the generic `open-gate` simulation actor to a
castle-only axe image, so Party Runway showed an axe in its ordinary opening
environment. Generic exits now render the original public exit arch; castle
presentation must use an explicit castle scene rather than leaking through a
shared actor ID. The production lockstep browser journey passes after the fix.

### Multiplayer frames and music stalled; Party Runway looked empty — fixed (2026-08-05)

The multiplayer shell had layered its own forced Phaser frame on top of the
normal Phaser loop, read every 1280×720 canvas pixel back each rendered frame,
and PNG-encoded it repeatedly for retained diagnostics. Those main-thread/GPU
readbacks produced uneven input and Web Audio. Rendering now uses Phaser's
normal loop, retains only one bounded initial diagnostic PNG, and browser QA
fails if recurring `toDataURL()` capture resumes. The opening route now has
visible original pipe scenery and enemies on elevated platforms while retaining
a safe shared run lane.

### Four-player WebSocket handoff close — fixed (2026-08-05)

The earlier code-1005 report predates the bounded screenshot channel and the
current released-map run. The fresh four-browser World 1-1-to-1-2 recording
keeps all gameplay sockets live through the authoritative handoff, and the
broader production stress/journey/parity suite passes afterwards.

### Multiplayer could render a reduced, backplated, falling game — fixed (2026-08-05)

The previous acceptance tests could compare a paused canvas while missing the
ordinary live journey. That allowed three visible defects: a permanent
waiting-panel sidebar, fallback rectangles behind authored sprites, and
six-tile courses whose level actors were ignored by the initial simulation
spawn. Waiting is now a genuine full-viewport game room with player count,
chat, and actions; it hides the canvas and does not offer Resume. Playing hides
the drawer, authored
primary/remote images replace their fallback bodies, courses use a 15-tile
playfield, and the core starts at the validated `player-start` actor. Client
prediction now reconciles the full state at the correct player slot and steps
locally at 60 Hz. Production side-by-side, exact-parity, four-recording, and
eight-player stress evidence passes; current captures are ignored under
`playwright_adhoc/`.

### Four-player second-course input after an authoritative level handoff — fixed (2026-08-05)

Four recording clients each uploaded a retained lossless debug screenshot over
the gameplay WebSocket. At 1280×720, a later image exceeded the server's old
64 KiB inbound WebSocket payload limit; `ws` closed every socket with code 1009. The browser could still render HTTP-polled state but could no longer
send input, making the second course appear frozen. Debug screenshot uploads
remain throttled to one per client per second and the WebSocket has a separate,
bounded 2 MiB image-aware payload ceiling. The recorded four-player journey
now reaches Cavern Route, with every client receipt showing an open socket and
acknowledged fresh input; the combined production browser suite (recording,
lockstep, exact parity, journey, admin, and eight-player stress) passes.

### Multiplayer full-viewport drawer and input heartbeat (fixed 2026-08-05)

Playing multiplayer now uses the entire browser canvas at 1280×720 in the
standard desktop proof; the control drawer is visible while waiting and opens
with `M` during play, so no persistent panel or button occupies game pixels.
Held input is resent on WebSocket connect and every 100 ms while pressed, and
debug PNG upload is bounded to one latest image per client per second. Focused
production Playwright coverage passes.

### Multiplayer canvas could stay visually frozen while its server-driven BootScene advanced — fixed (2026-08-05)

The actual fault was a coordinate-space mix-up, not frozen rendering: the
authoritative protocol sends the world-left camera position, whereas Phaser's
zoomed `scrollX` is centered on the native viewport. Passing 0 directly to
Phaser selected a world view beginning at x=403. Conversion now preserves the
protocol left edge; the real production lockstep PNG changes after movement
and visibly contains the player. Regression:
`tests/multiplayer-browser/side-by-side-lockstep.spec.ts`.

### Multiplayer real-time transport was not latency-safe — fixed 2026-08-05

The authoritative server, bounded input queue, and client prediction module
exist, but the normal game WebSocket currently broadcasts complete simulation
state and the visible Phaser canvas renders that authoritative state directly.
The predictor is therefore not the player-visible local simulation, and the
remote interpolation buffer is not applied to the scene. This is inadequate
for the approved 100 ms–3 s latency goal. It now uses a measured, versioned
full-keyframe plus baseline-delta protocol, rendered local reconciliation,
remote interpolation, explicit resync, and real four-browser delay proof at
100 ms, 500 ms, and 3 s; see `PLAN.md`.

### Refresh showed impossible multiplayer lobby actions — fixed 2026-08-05

After a browser refresh, a valid session with an active game was rendered as a
lobby. The server correctly rejected every Create/Join request because that
player already occupied one game slot, but the client showed no useful error
or resume route. The lobby response now includes the active game; the browser
immediately reopens it, and its creator can start from the waiting-game view.
The real production browser journey covers create, refresh-resume, guest join,
and start.

### First-frame multiplayer canvas could be background-only — fixed 2026-08-05

Phaser reports a scene as active before `BootScene.create()` has built its
player and level objects. The multiplayer adapter treated that as render-ready,
so an early authoritative snapshot could be replaced by the scene's empty
local seed, producing the reported grass-and-sky-only game. The adapter now
waits exclusively for BootScene's explicit post-create render-ready event.
The production Playwright create/join/start journey was inspected after the
fix, and the exact raw-pixel local/server parity check now uses Party Runway,
the live lobby default, rather than the obsolete first-authored fixture.

### Multi-course authoritative rendering and exit completion — fixed 2026-08-05

A real four-player two-course run found five defects that the prior
single-transition smoke test missed: Coinbox Crossing's visible exit lacked a
goal tile; input tagged with the previous course's frame clock was rejected;
old Phaser canvases could survive a transition; Phaser sometimes booted inside
a detached host and measured the wrong viewport; and clients could render a
snapshot before `BootScene.create()` built its objects. The gate now carries a
goal collision tile, frame clock reset, explicit canvas teardown, mounted-host
construction, rendered-bounds sizing, and a scene-ready snapshot barrier.

### Multiplayer startup obstruction and overlay — fixed 2026-08-05

The first public course could begin with hazards/enemies immediately beside a
new player, while idle remote players were solid and could form an impassable
wall. The game controls also overlaid the browser canvas. The opening course
is now a safe runway, online player bodies intentionally overlap, and the
controls are now an optional drawer. A four-real-browser recorded journey
proves keyboard movement, level completion, and next-level transition.

### Reported local game-start failure — lifecycle route hardened (2026-08-05)

The original failed Start request predates file diagnostics, so its exact old
cause cannot be recovered. The tested route now enters the creator's waiting
game immediately after create, keeps Start out of public-game rows, and leaves
the server as the single membership authority. A fresh production two-browser
journey creates, resumes, joins, and starts successfully; redacted diagnostics
remain available at `screenshots/server.log` for any new failure.

### Multiplayer authored-skin delivery gap — fixed 2026-08-05

Multiplayer initially reused the `BootScene` but omitted the local authored
skin bundle; the normal production build also pointed at development-only
content paths. It therefore drew procedural fallback bodies/tiles despite an
inadequate multiplayer-to-multiplayer pixel test. Multiplayer now requires the
same authored bundle as local play, and Docker/browser QA use the release
static-content build. A real local `BootScene` renders a paused authoritative
server frame with zero differing 1280×720 gameplay pixels; the local route's
separate ESC navigation hint is excluded by hiding that control, not by
cropping/masking canvas pixels.

### Multiplayer hardening audit — no regression found 2026-08-04

The semantic UI renderer, password-attempt boundary, protocol rejection, and
admin queue-injection path have focused unit/service coverage and a real
two-browser screenshot journey. No new multiplayer defect was found; the next
scheduled check is the full quality gate plus 100 ms/3 s transport journey.

### Dependency audit — resolved 2026-08-04

Vite 8.0.16 carried a vulnerable PostCSS release, and the TypeScript ESLint
toolchain resolved an older vulnerable `brace-expansion`. Vite is now 8.2.0,
ESLint is 10.8.0, and a scoped package-manager override resolves every locked
`brace-expansion` edge to patched 5.0.9. `pnpm run audit:vulnerabilities` is
clean; retain the override until the direct TypeScript ESLint update is old
enough for the project's three-day adoption gate.

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

- **Fixed (2026-07-18): 8-4 felt unfinishable — backtracking re-armed passed
  maze checkpoints.** The ROM's scroll lock makes a passed checkpoint
  unapproachable; with our free backtracking, wandering left after a correct
  pipe warp (e.g. exploring after landing at column 258) and walking right
  again re-triggered the checkpoint and threw the player to the start. A
  checkpoint the player has moved a tile beyond is now spent for the run.
  The full 8-4 route re-verified live end to end: pipes at 81 → 114,
  152 → 194, 228 → water room → 258, bridge, Bowser, axe, castle clear.

- **Fixed (2026-07-18): 8-4 WAS unfinishable — its maze pipes refused entry.**
  All six 8-4 maze pipes carry `targetLevelName: "smb-8-4"` (they warp within
  the level), and a day-one guard in `findEnteredPipe` skipped any pipe whose
  target names the current level — meant to stop a self-advancing pipe from
  reloading its own level, it silently made every maze pipe ignore input. With
  no working pipes, the only path forward crossed a checkpoint on foot at the
  unreachable required row: an inescapable loop. A self-targeting pipe is now
  normalized to a same-level warp at entry. The earlier route verifications
  used the debug teleport, which bypasses pipe entry — which is how this
  survived them; the new `pipe-maze.spec.ts` journey enters the column-81 pipe
  with real input and asserts the warp lands past the first checkpoint.

- **Fixed (2026-07-18): 8-4's water-room exit rejected swimmers.** Sideways
  pipe mouths are two tiles tall and the placement names the bottom tile, but
  the walk-in row check accepted only that single row — a 16-pixel band. Fine
  for standing walk-ins (1-2/2-2-style floor exits centre on it naturally),
  impossible for a swimmer bobbing at 8-4's mid-wall water-room mouth: entry
  never fired and the run dead-ended underwater. The row window now spans the
  real two-tile mouth. Verified by a live-site route drive (pipe 81 → 114,
  152 → 194, 228 → water room, swim-in exit → 258) and pinned by the
  `pipe-maze.spec.ts` swimmer journey.

- **Fixed (2026-07-18): god mode could be shoved into lava by enemy contact.**
  The side-contact response set a knockback velocity on the player before the
  god-mode damage guard ran, so an "undamageable" player standing at 8-4's
  lava ledge was pushed in by the paratroopa stream (a pit/lava death god
  mode does not prevent). God mode now skips the contact shove entirely;
  stomp rebounds are untouched (pinned by test — bounce-off-enemy routes
  must keep working), and a collected star still kills enemies on touch
  (also pinned). Note for the record: the normal-mode damage knockback
  itself is a deliberate deviation — the ROM never displaces Mario on
  contact (i-frames only) — kept as designed and test-pinned.

- **Verified (2026-07-18): 8-4 segment 2 is playable as in the ROM.** The
  floating pipe at column 152 (cap row 6) is reached exactly like 1985: bump
  the famous hidden block at (150, 9), mount it with a RUNNING jump (a
  standstill tier-0 jump peaks at 63.8px, a hair under the 4-tile block —
  the walking/running tiers clear it, matching the original feel), and leap
  onto the cap. `official-smb-hidden-block.test.ts` finds a working
  frame-input window against the live engine and pins the whole chain
  (reveal → mount → cap → pipe entry). The endless paratroopa stream over
  the lava is the ROM's enemy layout for this room; the stomp bounce off it
  remains the expert shortcut.

- Otherwise none currently recorded. (2026-07-11, earlier sweep: four fidelity
  bugs found by the new completability proof and fixed — 4-4/7-4 loop-zone rows
  were in screen space and impassable; water-area terrain sealed the
  2-2/7-2/8-4 exits (now swim-through coral per the ROM's solidity bound);
  walk-in pipes could never trigger against their solid mouths (now
  leading-edge probed); and the first-quest filter wrongly stripped
  SecondaryHardMode enemies that belong to 5-3+. Earlier same day: missing
  piranha sprite failed 31 levels at boot; warp progression fixes.)

## Risks To Track

- **Multiplayer release audit — resolved 2026-08-04.** Client prediction is
  deliberately optimistic and may visibly reconcile under severe delay, but
  expiry, acknowledgement ordering, and the full 100 ms–3 s transport window
  are now proven in real two-browser journeys. Debug state, screenshots, boot,
  expiry, pause/step/resume, and input injection remain admin-session-gated;
  screenshots are bounded and no session secret is exposed. The playable
  `#multiplayer` route uses a Phaser snapshot renderer, visible lobby/game
  chat, original avatar roster, local audio, and shared authoritative camera.

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

# Open verification gap — 2026-08-05

The focused World 1-1 visual parity, lifecycle, and mirrored-input checks are
green, but the four-player recorded full-completion journey still names retired
fixture routes. It is not valid evidence for release World-map completion until
that journey is retargeted and rerun from each player perspective.
