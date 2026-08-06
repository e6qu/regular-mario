# PLAN.md

## Mission

Build an original browser side-scrolling platformer with **classic (Super-Mario-style) mechanics** and **original expression** — original sprite art, music, sound, level layouts, and names. Ships as a JavaScript bundle that runs in the browser.

## IP And Originality Policy (Mechanics vs. Expression)

- **Mechanics and element types are not copyrightable and may be freely replicated:** running/jumping feel, stomping enemies, growth power-ups, projectile flowers, travel pipes, coins/score, goal finishes. The project deliberately mirrors them.
- **Specific expression IS protected and must be original:** sprite art, character likenesses, music, sound effects, level layouts, names, and trademarks. No tracing, recoloring, or closely imitating a third party's sprites/characters/audio, and no third-party names or trademarks.
- The repo must never contain copyrighted expression we did not author. License: AGPL-3.0-or-later; dependencies must be compatible.

## Architecture

- **Stack:** TypeScript, Vite (dev/bundling), Phaser (rendering/input/audio/scenes), and a custom fixed-step platformer simulation. Vitest for core tests, Playwright for browser tests, `pre-commit` for fast gates. Tiled JSON authoring plus VGLC-style text and optional user-file importers as isolated edge adapters.
- **Functional core, imperative shell.** The core owns deterministic simulation, collision, level validation, replay, and rules, stepped once per frame; the shell owns browser APIs, rendering, input, and asset loading. Dependencies point inward; no framework object is needed to test core mechanics.
- **Design rules:** strong domain objects and branded types over primitives; named constants with explicit units; loud failures with no hidden fallbacks; parse/validation/compatibility failures modeled as explicit domain errors.

## Graphics: original authored vs local-only ROM extraction

- The shipped skin ("Shabby Castaway") is **original authored** pixel art, generated deterministically at build time from a committed script — no ROM.
- A ROM-extracted skin and ROM-decoded numeric level layouts are supported for local fidelity work, but ROM bytes, ROM URLs, extracted pixels/audio, and reference captures **never enter git** — they live under ignored `.cache/user-levels/`. Only numeric metadata (tile indices, palette RGB arrays, coordinates, timings) and the extraction/decoder scripts are committed. See `docs/decisions/0018` and `0019`.

## Milestone 9: trusted-friends multiplayer service (approved design)

Deliver a straightforward internet-hostable multiplayer mode for trusted
friends: one public lobby, public one-level games, real-time shared play, and
no user accounts. The existing deterministic simulation remains the only rules
engine; the server owns its authoritative copy and the browser predicts only
its local player.

### Product behaviour

- The password-protected lobby has one ephemeral lobby chat and lists every
  public game (creator, original avatar, selected bundled level, regular or
  revenge mode, status, and live/maximum player count). Any logged-in player
  may create a game and any logged-in player may join it; a player belongs to
  at most one game at a time.
- A game holds at most **16** players. Its creator chooses the bundled level
  and mode. Joining before or during play spawns the player in the server's
  current camera screen; every client camera follows the same authoritative
  screen, so the party remains together. A player may choose a new nickname
  or original avatar at any time, including while in the lobby.
- Any player completing the selected level completes the game for everybody.
  A dead player remains connected as a spectator and sees the surviving
  players until completion. A spectator may revive at the furthest party
  checkpoint reached by an active player, without rewinding the shared world.
  A revive is a player lifecycle transition, not a new game: the client must
  replace a stale spectator prediction even if no input acknowledgement changed.
  Any current member may pause a live game. Completing or creator-ending ends
  the game; when everybody leaves, it must remain resumable and pause itself.
  The first later member to join automatically resumes that empty-party pause;
  a deliberate member pause remains paused until a member toggles it with P.
- A valid entry pipe is resolved by the authoritative game after its fixed
  entry animation. The server switches the whole party into the pipe's linked
  bundled area at the pipe's declared destination tile; internal warp areas are available to the runner but are not
  selectable from the public lobby. Piranha movement is server-simulated and
  client-rendered from the synchronized actor state.
- Games, chats, queues, and sessions are deliberately ephemeral: a service
  restart ends active games and clears them. This avoids a database and
  recovery rules in the first trusted-friends release.
- A normal browser refresh with a valid session resumes that player's active
  game directly. The lobby must never show create/join controls to a player
  who already occupies a game slot.
- Chat is ephemeral, capped at 256 characters, and limited to three messages
  per second per session in both the lobby and each game.
- Avatar names, artwork, labels, and game UI must be original. Do not ship or
  advertise third-party character identities, names, or copied designs.

### Server, protocol, and deployment

- Add a standalone TypeScript/Node service that serves the production Vite
  client and exposes a versioned HTTP API plus one WebSocket protocol. Caddy is
  external to this repository and terminates TLS/proxies the service on a VPS.
  Ship a small Dockerfile, `compose.yaml`, documented required environment
  variables, and no secrets in the repository.
- Keep the first deployment single-process and dependency-light. Implement the
  required message queue in process as bounded, per-game/per-player typed
  queues: monotonic sequence numbers, explicit intended simulation frames,
  capacity limits, and a 3-second TTL. Expired, duplicate, malformed,
  out-of-game, and out-of-order inputs are rejected and counted. This is
  easier to operate and less failure-prone than Redis/RabbitMQ for one VPS;
  the queue interface must remain isolated so a future multi-instance broker
  can replace it without touching gameplay rules.
- The authoritative server advances each game at the existing fixed 60 Hz
  cadence. Browsers send explicit key-command edges/held states tagged with
  sequence number and intended frame. The server consumes valid queued inputs
  before stepping and broadcasts ordered snapshots at 20 Hz, including an
  acknowledgement for each player input sequence.
- Clients run the same deterministic core for responsive local prediction:
  immediately apply their local command, retain unacknowledged input history,
  reconcile against the acknowledged server snapshot, and replay pending
  commands. Other players interpolate between server snapshots. Normal play
  optimises for roughly 100 ms latency; clients accept server authority up to
  3 seconds late, after which stale input expires and visible correction is an
  intentional, safe degradation. Audio is derived and played locally from
  received/predicted simulation events, never streamed.
- Each player session has one active game WebSocket. A newer connection
  explicitly supersedes the old one, preserving one ordered input stream and
  avoiding duplicate snapshot/heartbeat delivery.
- Establish a typed protocol schema and version it. HTTP covers health,
  password login/logout/session state, lobby/game discovery and creation, and
  admin controls; WebSocket covers session resume, presence, game join/leave,
  input, snapshots, chat, and explicit error messages. Invalid state and
  protocol-version mismatches fail visibly rather than falling back.

### Authentication, administration, and debugging

- A shared `SERVER_PASSWORD` creates a signed, opaque anonymous user session
  in an HttpOnly, Secure (in production), SameSite cookie. It expires after 24
  hours and reconnecting resumes the existing active-game slot when available.
  No username/password account system is introduced. Rate-limit password
  attempts at the server boundary.
- A distinct `ADMIN_PASSWORD` creates a separate, short-lived (one-hour)
  admin session. The protected admin UI/API can boot a player, expire all user
  sessions, inspect lobby/game state, pause a selected game, advance exactly
  one authoritative frame, and resume it. Admin input injection uses the same
  validated input protocol; no arbitrary state mutation is allowed.
- Render every server-owned HTML screen from a typed semantic UI tree. The
  browser renders that tree accessibly and an authenticated JSON endpoint
  returns it exactly, making login, lobby, game, chat, and admin layout
  programmatically inspectable.
- Authenticated debug snapshots expose redacted session/presence data, player
  positions/outcomes, authoritative frame and camera, queue depth/expiry/drop
  metrics, input acknowledgement lag, snapshot cadence, and protocol errors.
  A debug spectator/browser client can capture its rendered canvas and shell
  screenshot on request; the server retains only the latest bounded image for
  the admin endpoint. Playwright must also be able to drive normal inputs,
  pause/step through the admin surface, read the semantic JSON tree, and take
  desktop and mobile screenshots. Never expose these controls or screenshots
  without the admin session.

### Delivery sequence and proof

1. Audit and rename/redraw any multiplayer-facing third-party character labels
   into an original fixed avatar roster; add domain IDs for players, games,
   sessions, protocol frames, queue messages, and snapshots.
2. Extract server-safe simulation orchestration from the Phaser shell; test a
   16-player authoritative game, current-screen spawn, spectator death,
   completion-by-any-player, and regular/revenge parity entirely headlessly.
3. Implement the TTL queue, protocol codecs, 60 Hz server game runner, 20 Hz
   snapshots, client prediction/reconciliation, remote-player interpolation,
   local audio derivation, and deterministic replay/network fixtures.
4. Implement the password/session boundary, profile/avatar picker, public
   lobby/game list, creation/join lifecycle, both ephemeral chat rooms, admin
   actions, and Docker deployment documentation.
5. Implement semantic-tree JSON, redacted metrics/state debug endpoints,
   controlled spectator screenshot capture, and the admin pause/frame-step
   workflow.
6. Prove the service with pure protocol/queue/auth/game-runner tests; browser
   journeys for login, create/join, chat limits, prediction correction,
   spectator view, admin boot/expiry/pause/step; screenshot/layout JSON tests
   on desktop and mobile; and a two-or-more-browser real-time smoke test with
   simulated 100 ms through 3 s delay. Record new dependencies' license,
   purpose, maintenance, security, and age before adoption.

**Initial delivery evidence (2026-08-04, strengthened 2026-08-05):** the
six initial delivery steps are implemented, but the transport/rendering
contract below remains a required completion phase. The prior wording that
called Milestone 9 complete was too broad: a client prediction object exists,
but the visible canvas still applies full authoritative snapshots directly.
The pure runner covers the 16-player cap, late current-camera spawn, spectator
retention, and joined-player completion. The production standalone service is
driven by Playwright in two isolated browsers, including semantic layout,
normal input, game chat, retained screenshots, admin boot/expiry/pause/step,
and injected 100 ms/3 s snapshot delay. `pnpm run check` is green.

The multiplayer canvas is now the same authored `BootScene` and default skin
bundle as local play, not a separate simplified snapshot painter. A lossless
wire codec carries complete simulation state (including map-backed state) to
that scene. The proof suite deep-compares a 12-frame two-player local-engine
trace against each server state; compares a local `BootScene` supplied a named
paused Party Runway server frame against multiplayer at all 676,800 raw canvas
pixels (1280×720, matching the full-browser gameplay viewport); and
independently requires two different multiplayer avatars to match exactly. The
comparison hides only the local route's non-game ESC navigation hint and uses
no crop, scale, mask, or pixel tolerance for gameplay pixels.

**Real-play acceptance evidence (2026-08-05):** the production standalone
server is exercised by four isolated, recorded Playwright browsers. They log
in, choose profiles, create/join/start one public game, send real keyboard
input, demonstrate movement with idle party members present, complete the
safe introductory course, and remain four authoritative members after the
game advances to the next bundled course. The ignored recordings and
per-player screenshots are written under `playwright_adhoc/multiplayer-full-run/`.
The World 1-1 recording input is derived from a small-player core run with
zero restarts and zero checkpoint rollbacks, then replayed solely as physical
browser key edges; a four-member authoritative-runner test rejects traces that
cannot complete from frame zero.

**Two-level real-play acceptance (2026-08-05):** four separate Chromium
processes, each with its own recorded authenticated player session, complete
Party Runway and then Coinbox Crossing in one authoritative public game before
all four render the opening frame of Cavern Route. The browser test asserts
input movement, exactly four server members through both transitions, the
server frame/camera, one 1280×720 canvas per player, matching CSS/backing
dimensions, and post-transition screenshots. It caught and closed a missing
goal tile, frame-clock reset, detached-canvas boot, camera, and canvas-teardown
defects rather than treating the first transition as sufficient proof.

### Required completion phase: latency-safe state transport and rendered reconciliation

### Multiplayer lifecycle and co-op acceptance extension (2026-08-05)

- A completed multiplayer course must remain server-frozen for the declared
  client presentation interval. The browser renders the existing flagpole or
  castle cutscene locally, then consumes the server's next-course transition;
  this is a lifecycle rule, not a visual fallback.
- Escape opens a compact gameplay menu. Any current member may leave their
  slot or cancel the whole public game; cancellation broadcasts the removal
  and takes every connected member back to the lobby.

- Add real browser journeys for: death → spectator → party-checkpoint revive;
  leaving and rejoining a live game; the last player leaving an active game
  (game persists and pauses); any member pausing/resuming; and both players
  observing each other's movement under normal and injected-delay transport.
- Retain server authority for collectible acquisition, power-up state and
  deterministic power-up movement, enemy state and movement, collisions, and
  score/outcome. Browser presentation alone owns animation phase, particles,
  death effects, and locally derived sound. Regression tests must prove that
  client effects cannot alter the authoritative state.
- Treat visible remote-player correction as a gameplay regression: measure
  player-to-player motion and correction distance, not merely snapshot arrival
  or animation-frame cadence. The existing remote interpolation must reconcile
  each client from the same ordered authoritative state.

**Shared-level implementation correction (2026-08-05):** multiplayer no
longer owns a parallel course catalogue. `publicOriginalLevels` is the single
engine catalogue: local browser selection and the server derive their
`LevelSpec`s from the exact same `LevelSpecInput` object. Public-game creation,
server snapshots, and the browser renderer must carry the selected catalogue
ID unchanged. A Playwright request assertion guards this path. `pipe-route`
also now carries the goal tile required by the deterministic completion rule;
that source-level correction applies equally to local and multiplayer play.

The acceptance sequence is: one authenticated browser selects a shared course
and its POST body/server snapshot must agree; a local and online browser
receive mirrored real keyboard edges; four separately recorded browser
processes complete `pipe-route` and render `enemy-stomp-route`; and eight
independent WebSocket clients join one authoritative game. The ignored videos
and screenshots live under `playwright_adhoc/`.

Gameplay presentation remains full-viewport and free of an in-game control
drawer. The semantic server UI tree is still available through its JSON API
and inspectable DOM representation, but inspection may never change canvas
geometry, cover the game, or intercept gameplay input.

The service must meet the stated responsive-play goal at approximately 100 ms
latency and degrade safely, visibly, and recoverably up to 3 s. The current
whole-state JSON snapshot stream is a correct debugging representation, but
is not the production real-time transport format and must not be treated as
one.

1. **Measure before tuning.** Add deterministic payload-size fixtures for
   representative one-, four-, and sixteen-player states on each bundled
   level; record uncompressed JSON and encoded-wire bytes, delta bytes,
   messages/second, and server egress at 20 Hz. Set and test explicit size
   budgets from those measurements—no guessed threshold.
2. **Versioned hybrid state protocol.** Retain a complete, JSON-safe snapshot
   as a keyframe for join, level transition, recovery, and periodic (at most
   once per second) resynchronisation. Between keyframes, transmit only a
   versioned delta against an acknowledged `baselineFrame`: changed player
   transforms/velocity/outcome, changed entities/tiles, camera, input acks,
   and additions/removals. A missing or mismatched baseline must request a
   keyframe explicitly; it may never silently apply a delta to the wrong
   state. The semantic debug API continues to expose complete inspectable
   state independently of the game transport.
3. **Actual client-side simulation.** Render the local player's predicted,
   reconciled simulation state immediately; on an authoritative ack, replace
   the acknowledged portion and replay only pending inputs. Render other
   players from a bounded interpolation buffer between authoritative states.
   Keep the authoritative server camera and authoritative collision/outcome
   decisions. Audio remains local and is derived once from predicted or
   confirmed events without duplicate playback.
4. **Delay, loss, and stale-data behaviour.** Send input edges plus a
   bounded held-state heartbeat, maintain ordered sequence/input acks, and
   coalesce outbound state so a slow client receives the newest recoverable
   keyframe/delta chain rather than an unbounded backlog of stale frames.
   At 3 s, expired inputs and visible correction are intentional; recovery
   must converge without client rule authority or a frozen canvas.
5. **Acceptance evidence.** Unit/property tests cover codecs, baseline
   mismatch, removals, recovery, prediction replay, interpolation, size
   budgets, and stale-frame discard. Production-server Playwright runs with
   four independently authenticated browsers at 100 ms, 500 ms, and 3 s
   injected delay, records every perspective through two level transitions,
   and proves the visible local prediction, remote interpolation, recovery,
   and eventual byte-for-byte authoritative convergence. Capture protocol and
   queue metrics in the admin JSON/debug evidence.

**Completion evidence (2026-08-05):** the hybrid protocol is implemented and
measured in its transport tests; normal state updates are structural deltas,
with periodic and recovery keyframes. The real Phaser canvas renders local
prediction and remote interpolation. Exact local/shared-camera server-frame
parity is zero raw pixels, and the ignored four-browser recordings complete
two transitions at 100 ms, 500 ms, and 3 s injected delay.

**Live-journey visual correction (2026-08-05):** frozen-frame parity alone is
not sufficient acceptance evidence. The production gate also starts an actual
waiting game, requires a purposeful game-room state with no visible canvas or
invalid Resume action, starts it, requires
a 1280×720 unoccluded canvas with real authored-player pixels, mirrors actual
input against local play, and records separate four-player sessions through
two course transitions. The deterministic initial state derives player spawn
from the validated LevelSpec actor; multiplayer routes use a 15-tile canonical
playfield; and each client predicts its own authoritative player slot from a
complete state at 60 Hz.

## Target

Faithful classic-platformer feel — mechanics, HUD, background, physics, and
level layouts verified against documented measurements and user-supplied local
reference frames (`verify:smb-frames`, target 0 differing pixels at 256×240).
The engine is only "done" when real-asset play verifies it. Milestones 0–8
(governance, toolchain, domain core, simulation, browser shell, level pipeline,
original content/game-feel, compatibility importers, fidelity closure) are
largely achieved; the approved next delivery is Milestone 9, the
trusted-friends multiplayer service above.

## Commit Policy

- One cohesive commit per completed task, with tests or a note on why they don't apply. Do not combine unrelated work.
- Never commit build outputs, dependency folders, ROMs, copyrighted assets, secrets, or local caches.
