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
  players until completion. Completing, creator-ending, or everybody leaving
  ends the game and returns participants to the lobby.
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

**Completion evidence (2026-08-04, strengthened 2026-08-05):** all six delivery steps are implemented.
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
pixels (940×720, matching the sidebar layout); and
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

**Two-level real-play acceptance (2026-08-05):** four separate Chromium
processes, each with its own recorded authenticated player session, complete
Party Runway and then Coinbox Crossing in one authoritative public game before
all four render the opening frame of Cavern Route. The browser test asserts
input movement, exactly four server members through both transitions, the
server frame/camera, one 940×720 canvas per player, matching CSS/backing
dimensions, and post-transition screenshots. It caught and closed a missing
goal tile, frame-clock reset, detached-canvas boot, camera, and canvas-teardown
defects rather than treating the first transition as sufficient proof.

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
