# STATUS.md

## Current State

**Live multiplayer first-frame rendering corrected (2026-08-05).** The
production create/join/start route now waits for BootScene's post-create
render-ready event before applying the first authoritative snapshot. This
prevents a sky-and-ground-only canvas when a snapshot arrives during scene
construction. A fresh standalone Playwright journey was captured and visually
inspected with Party Runway's player and collectible visible; the exact-pixel
parity check now exercises that live default course.

**Active-game refresh resume corrected (2026-08-05).** A valid player session
now receives its active-game summary with the lobby response and re-enters the
waiting or live game on refresh. The creator can start from that waiting-game
screen. This closes the case where the lobby appeared usable but every
create/join request was correctly rejected because the session already owned a
game slot.

**Multiplayer real-play acceptance (2026-08-05).** The shared game canvas now
uses the full browser viewport left of a non-overlapping control sidebar.
The introductory course has a safe runway and transitions the same public game
to the next bundled course when any player reaches its goal. Online players
can pass through idle party members, preventing a shared-screen deadlock. A
real four-context production Playwright journey logs in, creates/joins/starts,
sends actual keyboard input from all players, verifies movement and the next
level with all four authoritative members, then records each perspective under
ignored `playwright_adhoc/multiplayer-full-run/`.

**Two-course multiplayer completion proof (2026-08-05).** Four genuinely
separate Chromium processes now record the same full journey through Party
Runway and Coinbox Crossing, then enter Cavern Route together. The test checks
all four post-transition canvases at exactly 940×720 CSS and backing pixels,
and screenshots each player only after its authoritative frame is rendered.
The inspected captures show the authored game plus sidebar without overlap.

**Multiplayer visual parity verified (2026-08-05, corrected).** Multiplayer
now loads the same authored skin bundle and full `BootScene` as local play;
production Docker/test builds include the static content rather than falling
back to procedural shapes. A 12-frame two-player local engine trace equals the
server state on every frame. A real local `BootScene`, frozen on a named paused
server state, and its multiplayer counterpart have zero differing raw pixels
at 1280×720 (the local-only ESC navigation hint is deliberately hidden for
this gameplay-canvas comparison); two different multiplayer avatars also
match exactly. The eight-browser journey passes and saves ignored screenshots.

**Multiplayer stress/diagnostics (2026-08-05).** An eight-independent-browser
player journey starts one authoritative game, waits for every client to render
its eight-player snapshot, and saves ignored local inspection captures under
`screenshots/`. The optional `LOG_FILE` server logger writes redacted JSON
request/WebSocket/error records; the local server currently uses
`screenshots/server.log` for diagnosis of the reported Start failure.

An original browser platformer with faithful classic-side-scroller mechanics,
built as a deterministic functional-core simulation plus a Phaser/Vite shell.
Preparing for a public beta/demo release. **849 unit tests + browser journeys
pass; all gates green.** 2026-07-17 (audit): water terrain solid per the
ROM's real bound (2-2/7-2 exits can no longer be swum past), warp zones
faithful (4-2's {5} restored, piranha-free pipes, banner + world numbers),
cheep bridge levels driver-verified finishable. Also: enemy spawning is entry-faithful (dead
records culled, warp arrivals cull enemies behind the entry page like the
ROM — no more insta-death walking out of 1-2's exit) and big Mario ducks through one-tile crawls
(the crouch shrinks the terrain collider like the ROM's duck probes, with
headroom-gated stand-up). 2026-07-16 (later): sideways pipes render whole (the
ROM's four-column mouth/joint/shaft layout, capped intro pipes, faithful
water-pipe tiles); the 1-2/4-2 underground bonus
room's sealed exit is fixed (two ROM-verified decoder bugs: exit-pipe mouth
row, alter-attributes column) and **small Mario's terrain collider is now the
ROM's single tile (14×16)** so the original one-tile crawl routes are
passable. Earlier 2026-07-16: the flagpole finale plays in full (ball
knock, full flag drop, slide, exit march into the castle), poles/pipes render
honestly (invisible goal-reach trigger; ROM-height pipes with real pipe art),
and the regenerated pack keeps every enemy and all completability proofs. Latest fixes (2026-07-15): suspended sessions no
longer double the mobile NES touch deck (per-session DOM roots, see BUGS.md);
the timeline replay shows the death animation on screen (bottom-anchored
camera restore); and the flagpole slide cutscene works on the real SMB maps —
full flag drop, dismount at the base, and a very-top grab knocks the pole's
ball off — with cutscene + Bowser coverage in tests/browser/cutscenes.spec.ts
and new engine tests (five-fireball soak, spiky stomp, point-blank flames).

What exists now:

- **Next approved work: trusted-friends multiplayer.** The scope and
  implementation decisions are recorded in `PLAN.md` Milestone 9: one
  password-gated lobby, public 16-player authoritative games, client
  prediction with an expiring typed input queue, ephemeral chats, original
  avatar roster, standalone Docker-deployed Node service, and authenticated
  semantic-layout/state/screenshot debug controls.

- **Multiplayer service delivered.** The repository has a
  typed authoritative game runner, stable 16-player spectator slots, 60 Hz
  runner/20 Hz protocol contract, bounded 3-second expiring input queues,
  ephemeral chats, anonymous/admin signed sessions, public-game lobby service,
  semantic layout JSON, admin pause/step/resume/debug interfaces, a standalone
  HTTP/WebSocket server, and one-container deployment artifacts. The shared
  authored level catalogue, Phaser snapshot renderer, and multi-browser QA are
  included.

- **Browser multiplayer route delivered.** `#multiplayer` provides
  password login, profile/avatar editing, public-game create/join/start,
  lobby/game chat, keyboard WebSocket input, a live shared canvas, and client
  screenshot reporting. A pure client predictor immediately simulates local
  commands and replays unacknowledged history after server correction. The
  game view is rendered through a snapshot-only Phaser adapter.

- **Live prediction wired (2026-08-04).** Keyboard commands now create one
  validated command for both the WebSocket protocol and local deterministic
  prediction. Each authoritative acknowledgement reconciles the local player
  and replays remaining inputs before canvas rendering.

- **Remote interpolation wired (2026-08-04).** Non-local players render from
  a 100 ms buffered interpolation of the 20 Hz authoritative snapshot stream,
  avoiding visible packet-rate stepping while retaining safe clamping under
  delayed updates.

- **Local multiplayer audio wired (2026-08-04).** Browser-only synthesized
  effects derive from local predicted simulation transitions, with a local
  completion cue; audio is never transported or retained by the server.

- **Bundled multiplayer catalogue (2026-08-04).** The server and browser share
  three validated authored levels—Shoreline Sprint, Cavern Route, and Coinbox
  Crossing—so the selected level is also the exact level used for prediction.

- **Real-server browser QA (2026-08-04).** A dedicated Playwright configuration
  builds and launches the standalone service, then proves two isolated browser
  contexts can create/join/start/input/chat and inspect semantic game layout;
  it also proves admin pause/step/resume and captures desktop/mobile screens.

- **Lag proof (2026-08-04).** The live client renders pushed WebSocket snapshots
  after connection, retaining HTTP only until connection establishment. The
  two-browser journey passes with explicit server snapshot delays of both
  100 ms and 3 s.

- **Milestone 9 verification (2026-08-04).** The full repository gate now
  passes after registering standalone multiplayer server/browser entrypoints
  with dead-code analysis and removing a pre-existing duplicate test setup.

- **Creator game end (2026-08-04).** A creator-only End game action now clears
  the game through the authenticated HTTP service and returns the browser to
  the public lobby.

- **Protocol and login boundary (2026-08-04).** HTTP and WebSocket messages use
  protocol version 1 and reject mismatches visibly. The standalone server also
  rate-limits failed password attempts per address (five per minute).

- **Inspectable semantic UI and controlled admin input (2026-08-04).** The
  typed server UI tree is now shared with and recursively rendered by the
  browser as stable semantic/action DOM metadata, including both login
  screens. The API returns the same tree. Password throttling is isolated with
  deterministic expiry/boundary tests, and administrator input injection is
  constrained to a named game member and the identical validated queue command
  path used by WebSocket players.

- **Final multiplayer hardening proof (2026-08-04).** `pnpm run check` is
  green (dependency, content, license, vulnerability, format, lint, dead-code,
  duplication, type, unit, and production-build gates). The standalone
  two-browser journey also passes at injected 100 ms and 3,000 ms snapshot
  delay, with desktop/mobile screenshots.

- **Multiplayer completion audit (2026-08-04).** Late joins are unit-proven to
  spawn in the current camera screen; the hard 16-player cap, spectator slots,
  any-player completion, visible in-game chat, bounded game-view cleanup, and
  per-player acknowledgement/transport debug metrics are now covered. The
  common-screen Phaser canvas and its retained admin screenshot are browser
  asserted rather than only captured.

- **Multiplayer leave lifecycle (2026-08-04).** A deliberate leave now removes
  the member from the authoritative simulation, frees their one-game slot, and
  removes a game when its final member leaves. The browser exposes this as an
  explicit Leave game action.

- **Multiplayer completion lifecycle (2026-08-04).** The server broadcasts the
  final authoritative frame immediately, clears the finished game and every
  member slot, and the browser consumes that pushed snapshot before returning
  participants to the lobby.

- **Dependency-security maintenance (2026-08-04).** Updated Vite to 8.2.0 and
  ESLint to 10.8.0, and scoped the vulnerable TypeScript-ESLint transitive
  `brace-expansion` edge to patched 5.0.9. Dependency policy and vulnerability
  audit pass again.

- **God mode** (start-menu toggle, off by default; `god=1` in play links):
  undamageable player for practice/testing — pit falls still reset.

- **Deterministic pure simulation + replay.** A fixed-step core (movement,
  collision, enemies, blocks, projectiles, pipes, platforms, hazards, scoring,
  lives, timers) steps once per frame and is fully replayable: a recorded input
  log reproduces any run pixel-for-pixel headlessly.
- **Faithful SMB mechanics — complete for every decoded level.** Small↔Powered↔
  Fire tiers, breakable bricks, question/multi-coin/hidden blocks, coins/score
  with the classic scoring paths, star/projectile kills, extra lives, enterable
  and walk-in pipes, springboards, flagpole finish with slide, the death arc,
  **moving lift platforms** (vertical/horizontal oscillators, wrapping
  elevators, drop lifts, rope-linked balance pairs that detach past the limit),
  **rotating firebars** and **leaping podoboos** in every castle, **castle maze
  loop checkpoints** (4-4, 7-4, 8-4's pipe-gated water maze), **vine climbs to
  the coin heavens and 4-2's warp zone** with drop-off returns, warp zones
  decoded like the game ({4,3,2} / {-,5,-} / {8,7,6}), and **tiered hazard
  damage** (hammers/bullets/flames shrink big Mario; recovery/star protect).
- **Faithful enemy roster — the full cast.** Goomba, green Koopa (full shell
  lifecycle), **red Koopa (turns at ledges)**, Buzzy Beetle (fireproof),
  **Paratroopa variants** (winged armored enemies: horizontal glider, vertical
  oscillator, forward hopper — a stomp drops the wings into a walking koopa),
  **Spiny** (spiked: stomping hurts), Piranha Plant (**auto-spawned in every
  pipe outside 1-1**, holds while the player stands near), Hammer Bro, Lakitu
  (real `$11` id — 4-1/6-1/8-2 have theirs), Chaser, Blooper, swimming
  Cheep-cheep frenzy, **leaping flying-Cheep frenzy** over the bridge levels,
  **offscreen Bullet Bill volleys** (worlds 5+ only, matching the ROM's world
  gate), Bullet Bill cannons, **Bowser guarding every castle bridge** (spiky,
  five fireballs to fell, flame volleys; throws hammers from world 6) with the
  **axe ending the level** where the original's bridge chop does.
- **ROM-decoded levels — all 54 areas.** Full terrain (floor/ceiling patterns
  with mid-level alter-attributes, tree/mushroom ledges, bullet-bill cannon
  columns, bridges, exact pipe heights, castle bridges), stream-ordered
  world-scoped area connections (every warp pipe, side exit pipe, intro pipe
  and vine goes to its true destination; the shared underground bonus room
  returns each world to its own level; 1-2's exit really lands in 1-1's flag
  tail, as in the ROM), per-world bonus/cloud sub-areas, and hidden blocks.
- **The scenery layer** — levels read populated, not empty: background
  clouds/bushes/hills/fences from the ROM's repeating three-page scenery
  tables, tree trunks and mushroom stems under ledges, bridge rails, start/end
  castle buildings (walls, battlements, windows, door), water bands under
  bridges and **lava in castle pits** (the castle palette's take on the same
  "hole with water" objects and the fore-scenery band). All drawn as
  decorative empty-collision tiles at background depth.
- **Halfway checkpoints, flag-height scoring, first-quest filtering.** Dying
  past a level's ROM halfway page respawns there instead of the start (castles
  faithfully have none); flagpole scoring pays by grab height (100–5000); the
  ROM's hard-mode-only enemy connections are excluded like a first quest.
- **Level editor / designer** (unchanged surface): paint tiles, blocks, hidden
  blocks, cannons, piranha plants, enemies; multiple areas with warp pipes;
  themes; guided tutorial.
- **Session-persistent lives, coins, score, and power tier.** All persist
  across levels and deaths within a play session and reset only on a new game,
  as in the original (lives/coins live in the engine's `SimulationState`; the
  shell carries them across level rebuilds along with the score total and the
  power tier). Coins/score cross the every-100-coins 1-Up and never reset per
  level; a death restarts the level small. See
  `docs/terminology.md#session-persistent-state-lives-coins-and-score`.
- **End-of-level time-bonus countdown** — remaining time converts to score
  (50/unit) with the clock draining and a rapid tick per unit.
- **Selectable renderer (opt-in)** — a start-menu **Renderer** dropdown and
  `?renderer=` parameter choose Canvas (default), WebGL, or Auto; verified
  pixel-faithful and context-loss-recoverable (decision 0020).
- **Reset saved data** — a confirmed start-menu button clears all persisted
  preferences and saved editor levels.
- **Themes + water, audio, HUD, viewport, timeline replay, multi-session tabs,
  mobile** — mobile-landscape menus/editor/replay overlay all fit without
  scrolling; canvas pixel ratio capped on touch devices for performance.
- **Verification layers**: a start-to-end completability proof and a pinned
  content census over all 54 levels, a live browser check that every menu
  level's running game holds its full decoded content, and headless engine
  playthroughs that drive every main level to a finish.
- **ROM-extracted dev skin (local-only)** covers the entire cast, mechanisms
  and scenery from 92 numeric CHR compositions; all 32 menu levels boot
  under its strict coverage validation.
- **Authored "Shabby Castaway" skin is complete** — art for every visual
  element (92 sprites): the full enemy cast (including the hurler, cloud
  tosser, kelp traps, charcoal buzzies), all 24 scenery tiles, mechanisms
  (firebar orbs, podoboos, lift rafts, the goal pennant), every projectile
  kind (fireballs, bullets, hammers, eggs, flame jets), palette-swapped
  powered/fire player tiers, and the whole editor palette. Nothing renders
  as a vector fallback with the shipped skin.

## Content Boundary

- ROM bytes, ROM URLs, ROM-extracted pixels/audio, and original-game reference
  captures **never** enter git — they stay under ignored `.cache/user-levels/`.
- Committed content is numeric-only metadata (tile indices, palette RGB arrays,
  coordinates, timings, mechanics metadata) plus all code, the
  reverse-engineering docs, and the extraction/decoder scripts.
- The public release ships the authored skin, the numeric SMB level layouts,
  all code, the RE docs, and the extraction scripts. The NES ROM and every
  ROM-extracted asset stay local only.
