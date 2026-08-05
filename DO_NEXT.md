# DO_NEXT.md

## Trusted-friends multiplayer service — completed implementation evidence

There is no remaining approved implementation task for this milestone. The
items below are preserved constraints and historical verification notes for
future maintenance, not an instruction to add a second implementation.

Manual local starts must use an empty process. If a browser unexpectedly
resumes a game, inspect `/api/admin/debug`; only restart the confirmed local
server process, since games and sessions are deliberately ephemeral.

The multiplayer journey's live cadence gate is deliberate: effects expressed
in simulation frames must consume authoritative-frame deltas, never raw packet
arrivals, and remote state application must not force a display-list-wide depth
sort per 20 Hz receipt.

Keep defeat recovery explicit: a spectator must be able to open game controls,
leave, and join the still-running party as a fresh active current-screen spawn.

Keep complete predicted simulation presentation on the browser frame loop:
rendering only the predicted local player while waiting for 20 Hz authoritative
receipts makes coins and enemies visibly stutter. The password form must submit
on Enter, and lobby Create remains a create-and-enter single action.

Keep the two render lanes distinct: ordered server receipts own persistent map
tile commits, while the client prediction lane owns moving-world paint. A paused
or finished receipt must block any stale queued prediction; two-client raw
canvas parity asserts both the authoritative frame and camera were painted.

Transient visuals must remain client-owned. The server may establish gameplay
outcomes, but browser effect positions and durations must be derived locally
from presented actors, never replay server reaction coordinates or countdowns.

The post-presentation-change acceptance baseline is a passed four-player,
recorded World 1-1-to-1-2 run plus eight live WebSocket clients. Keep the
recording artifacts ignored beneath `playwright_adhoc/` and inspect a real
post-handoff frame when altering rendering or input reconciliation.

Delay-aware browser gates must sample beyond their injected delivery delay.
Do not interpret intentionally unavailable packets during the delay window as
transport failure; assert cadence only after the configured delay has elapsed.

Server state remains authoritative, but camera is client presentation. Do not
reintroduce direct 20 Hz server camera transforms; follow the locally predicted
player with smoothing instead.

### Fresh four-player recording proof (2026-08-05)

- Preserve the checked-in compressed World 1-1 trace as a continuous,
  small-player, zero-restart **and zero-rollback** simulation run. A rollback
  is not representable as ordinary physical browser input and must therefore
  never qualify a trace for `full-run-recording.spec.ts`.
- `game-runner.test.ts` replays it with four authoritative online members;
  `full-run-recording.spec.ts` then sends only its physical keyboard edges to
  four recorded real WebSocket browsers and requires World 1-2 in every view.

### Raster-only rendering boundary (2026-08-05)

- Static level actors now require authored rasters, including `open-gate`.
  Dynamic actors, projectiles, hazards, and lifts now do too. Continue this
  boundary through reaction effects; level tiles and both obsolete procedural
  actor/tile implementations are deleted. Complete the remaining bot and
  death-overlay reaction image requirements under a dedicated browser effect
  journey; character-specific bot explosion art now has no generic substitute.
  Missing art must throw a specific error, never select substitute vector art.

### Current recorded acceptance evidence (2026-08-05)

- Four isolated authenticated Chromium sessions now create/join one release
  World 1-1 game, send an ordinary physical-key replay to the production
  WebSocket service, finish the level, and render World 1-2 from every
  perspective. Videos and screenshots are intentionally ignored beneath
  `playwright_adhoc/multiplayer-full-run/`.
- The replay trace is a zero-reset normal small-player core completion. Its
  runner uses absolute 60 Hz deadlines; do not replace it with an admin state
  mutation, mock renderer, fixture course, or relative-time loop that drifts.
- Keep the fixed-step server scheduler and leading-active-player shared camera.

### Current verified baseline (2026-08-05)

- Preserve `snapshotSequence` as the transport ordering identity. A simulation
  frame is not a valid delta baseline on its own: lifecycle changes share frame
  zero and course handoff resets its clock. Browser reconciliation may replace
  the predicted state only for the initial baseline or an increasing local
  input acknowledgement; otherwise delayed 20 Hz snapshots rewind live input.
- Start/transition/pause/resume edges must broadcast an authoritative keyframe,
  not only a lobby metadata notification. Keep the 100 ms and 3 s production
  WebSocket suites as release gates.

- Preserve `src/engine/levels/public-level-catalog.ts` as the only public
  course catalogue. Local selection and `bundledMultiplayerLevels` must use
  the exact same `LevelSpecInput`; do not add a multiplayer-only map.
- The normal WebSocket path is authoritative server simulation plus 60 Hz
  client prediction/reconciliation, baseline deltas/keyframes and explicit
  resync. Keep the side-by-side harness and raw canvas parity checks as
  release gates.
- Fresh acceptance evidence is four independently recorded browsers completing
  `pipe-route` and entering `enemy-stomp-route`, plus eight WebSocket clients
  in one game. Artifacts are ignored in `playwright_adhoc/`.

### Verified: visual acceptance must use the live journey (2026-08-05)

- Preserve `side-by-side-lockstep.spec.ts` as a full-viewport gate: it checks
  a purposeful waiting game room (and rejects Resume/visible-canvas states), a
  hidden playing drawer, a 1280×720 canvas, real
  authored-sprite pixels, mirrored keyboard input, and changed rendered
  frames. Internal scene receipts alone are not visual evidence.
- Multiplayer courses are deliberately 15 tiles high. Do not reintroduce the
  former six-row routes or fixed default spawn coordinates; the deterministic
  initial state derives its primary position from the LevelSpec player-start
  actor.
- Client prediction must target the authenticated player's authoritative slot,
  reconcile a complete server state, and advance at the fixed 60 Hz cadence.
  Four-player recordings and eight-player stress cover the lifecycle.
- Keep ordinary multiplayer presentation on Phaser's native frame loop. Do not
  reintroduce manual `game.step`, per-frame `getImageData`, or recurring PNG
  canvas capture; the lockstep browser test guards the latter.
- Diagnose the remaining four-player WebSocket code-1005 handoff close using
  server close/error logging and exact encoded keyframe sizes. The current
  completion confirmation and 8 MiB payload ceiling are not sufficient proof.

### Verified: lobby creation enters the owned game (2026-08-05)

- Creation uses the authoritative game response to open the waiting-game
  panel immediately. Do not return the owner to a lobby after create; active
  membership is server-enforced and lobby Create/Join controls would be
  impossible actions.
- The public list has one Join action per other game. Keep Start only in the
  creator's waiting-game panel and in the matching semantic UI tree.
- `journey.spec.ts` verifies direct entry, refresh resume, the complete three
  course selector, a guest join, and creator start against a fresh production
  server.

### Verified: four-player level-handoff input and full-viewport contract (2026-08-05)

- `tests/multiplayer-browser/full-run-recording.spec.ts` now completes Party
  Runway and Coinbox Crossing with four separately recorded real browsers,
  then reaches Cavern Route. Its ignored second-course receipts prove all four
  sockets remain open and newly sent input is acknowledged after replacement.
- The actual defect was a 64 KiB WebSocket ceiling closing retained debug-PNG
  uploads with code 1009. Preserve the separate 2 MiB bounded image budget and
  one-per-second capture throttle; do not reapply the small JSON-body limit to
  the screenshot WebSocket channel.
- The full browser viewport/drawer contract is complete: 1280×720 game canvas,
  no persistent panel overlay, `M` opens controls during play. Keep
  `side-by-side-lockstep.spec.ts` and exact pixel parity at this size.

### Verified: live multiplayer canvas paints its applied state (2026-08-05)

- Start from `tests/multiplayer-browser/side-by-side-lockstep.spec.ts`, not a
  mock or a debug-only route. It launches isolated real local/multiplayer
  browsers, mirrors Shift/Right/Space edges, asserts the authoritative player
  and BootScene object move, and then requires each canvas PNG to change.
- The failure was a camera-space conversion: Phaser's `scrollX` is not the
  zoomed camera's world-left edge. Convert the protocol's left edge using the
  viewport inset before `setScroll`; otherwise frame receipts move while the
  visible world is shifted 403 pixels right at the standard full-width canvas.
- Keep the before/after PNG assertion. It now passes, and inspected captures
  show the authored player moving and jumping in the multiplayer canvas.

### Highest priority: complete the real-time transport contract (2026-08-05)

- Complete: the measured hybrid keyframe/delta stream, baseline recovery,
  stale-frame rejection, predicted local presentation, remote interpolation,
  and server byte diagnostics are implemented. Exact shared-camera parity and
  four recorded players through two transitions pass at 100 ms, 500 ms, and
  3 s injected delay.

- The hybrid delta/keyframe transport, baseline recovery, rendered local
  prediction, and remote interpolation are complete. Maintain their existing
  100 ms–3 s delayed-WebSocket browser gates and per-player byte diagnostics.
- Require codecs/recovery/prediction/interpolation/byte-budget tests and
  four separate recorded browser sessions at 100 ms, 500 ms, and 3 s delay
  through two course transitions before closing this work.

### Visual parity closure (2026-08-05)

- Complete. Multiplayer requires the same authored local skin bundle and
  `BootScene` in authoritative-render mode; Docker and browser QA use the
  static-content release build, so placeholder art cannot silently ship.
- Complete. `game-runner.test.ts` proves a 12-frame two-player local/core
  simulation trace equals every authoritative server state. The real-server
  Playwright journey freezes an actual local `BootScene` on a named paused
  Party Runway server frame and compares every gameplay-canvas pixel
  (1280×720, matching the full-viewport layout) with zero tolerance; it also compares
  two selected multiplayer avatars exactly.
- Complete. The multiplayer adapter now waits for BootScene's post-create
  render-ready event; an early snapshot can no longer leave a background-only
  Party Runway canvas.
- Complete. Refreshing a valid session resumes its active game instead of
  showing impossible lobby create/join actions; the creator's waiting-game
  screen owns the Start game action.
- Complete. Admin pause/step/resume now immediately broadcast the changed
  authoritative snapshot, so debug controls and parity capture observe the
  same frame. The production browser journey passes at 100 ms and 3,000 ms.

### Active local diagnosis (2026-08-05)

- Complete: recorded real-play acceptance is now at
  `playwright_adhoc/multiplayer-full-run/` (ignored). Four isolated browsers
  authenticate, create/join/start one public game, exercise actual keyboard
  movement, complete the safe introductory course, and enter `cavern-route`
  with four server-authoritative members. The game panel is a sidebar, not an
  overlay; online players pass through idle party members so a friend cannot
  block the run.

- Complete: the stronger two-level proof supersedes the old one-transition
  claim. `full-run-recording.spec.ts` launches four separate browser processes,
  not merely four contexts; it completes `multiplayer-onboarding`, completes
  `coin-block-route`, and verifies four rendered `cavern-route` clients. Its
  fresh videos and screenshots remain ignored in
  `playwright_adhoc/multiplayer-full-run/`.

- The local server runs with `LOG_FILE=screenshots/server.log`. Reproduce the
  failed Start action once to capture its redacted `http_error` entry; no
  password, cookie, chat, or snapshot data is logged.
- The eight-browser stress journey passes and writes ignored local captures:
  `screenshots/multiplayer-stress-creator.png` and
  `screenshots/multiplayer-stress-player-8.png`.

- Implement `PLAN.md` Milestone 9 in its recorded order. Start with an
  originality audit of multiplayer-facing character names/art and typed server
  domain/protocol IDs; do not add a broker, database, or server dependency
  without recording dependency-policy evidence.
- The first deployment is a single standalone Node service behind externally
  supplied Caddy, with a bounded in-process 3-second TTL input queue. Games,
  chat, and anonymous signed sessions are intentionally ephemeral across a
  server restart.
- Keep authoritative simulation at 60 Hz, snapshots at 20 Hz, and client
  prediction/reconciliation explicit and testable. Use the existing
  deterministic core; Phaser remains a browser-only renderer/input shell.
- Include admin-gated semantic-layout JSON, redacted game/network metrics,
  current screenshot capture, pause, and exact-frame step in the browser QA
  plan. Cover two browser clients under injected 100 ms–3 s delay.

### Current implementation checkpoint (2026-08-04)

- The server foundation is implemented and focused tests pass: `src/multiplayer`
  owns the original avatar roster, TTL queue, authoritative runner, and stable
  spectator slots; `src/server` owns sessions, chats, games, admin controls,
  semantic JSON, HTTP/WebSocket transport, and Docker deployment.
- Next, integrate a `/multiplayer` browser route with password/profile/lobby/
  game/chat screens, same-core client prediction + server reconciliation,
  remote player interpolation, local audio, canvas screenshot reporting, and
  an admin browser debug screen. Then expand the server level catalogue from
  the initial authored bundled level to the supported authored bundle.

- The `#multiplayer` route and basic live canvas are now present. Next make
  every supported bundled level selectable, replace the simple shared canvas
  with Phaser snapshot rendering plus remote-player
  interpolation/local prediction, add admin UI controls, and write two-client
  Playwright journeys (including screenshots and injected network delay).

- Completion now broadcasts one final pushed snapshot and immediately releases
  every finished game's memberships. Next, add remote-player interpolation,
  local audio derivation, and browser-level multi-client proof of this handoff.

- Live keyboard prediction, pushed snapshots, 100 ms remote interpolation, and
  local-only synthesized audio now support the shared three-level bundled
  catalogue. The real-server browser journey now covers two clients, game
  semantic JSON, desktop/mobile screenshots, admin pause/step/resume, and the
  explicit delay checks. The full release gate is green; conduct the final
  requirement-by-requirement Milestone 9 completion audit before deployment.
  Password-attempt limiting and explicit HTTP/WebSocket protocol-version
  mismatch handling are now implemented and verified.

- Security maintenance is current as of 2026-08-04: Vite 8.2.0, ESLint 10.8.0,
  and a lockfile-scoped `brace-expansion` 5.0.9 override leave the dependency
  vulnerability audit clean. Preserve that override until `typescript-eslint`
  can safely be updated past the nested vulnerable range.

- Multiplayer implementation and verification are complete. For deployment,
  create a VPS `.env` from `.env.example` with long unique passwords and a
  signing secret, run `docker compose up -d --build`, and configure the
  externally managed Caddy reverse proxy/TLS entry. The final local proof is
  `pnpm run check` plus `pnpm run test:multiplayer-lag`; do not commit that
  `.env`.

## Landed: playability audit (2026-07-17)

- Water solidity per the ROM's lower-bound rule (exits enforced by the end
  funnels again); warp zones: {5} restored, piranhas culled, banner+numbers;
  cheep bridge levels verified finishable by the driver. Water mains are
  BFS-proven but excluded from stochastic-driver expectations (its swimmer
  can't thread solid coral).

## Landed: spawn-faithful enemies (2026-07-17)

- Dead enemy records culled at decode; warp arrivals cull everything behind
  the entry page like the ROM (fixes the 1-2 exit insta-death); ROM group
  spacing; coins protected from displaced enemy glyphs.

## Landed: duck-through crawls (2026-07-17)

- Big Mario's crouch shrinks the terrain collider (feet-anchored, ROM duck
  probes) with headroom-gated stand-up and covered-crawl input, unsticking
  the 1-2/4-2 one-tile crawl routes.

## Landed: whole sideways pipes (2026-07-16)

- Exit/intro/water pipes now render the ROM's four-column sideways layout
  (mouth + horizontal shaft + joint + full-height vertical shaft; intro caps
  at row 7) with six new side-pipe tiles in both skins — no more "half a
  pipe" over the bonus-room exits.

## Landed: bonus-room exit unsealed + ROM-size small player (2026-07-16)

- Decoder fixes (both SMBDIS-verified): sideways exit-pipe mouth one row
  lower, alter-attributes applied from the _next_ column — the 1-2/4-2 bonus
  room's exit pipe now has an opening.
- Small Mario's terrain collider is the ROM's single tile (14×16,
  feet-anchored), so the canonical one-tile crawl routes (1-2, 4-2) are
  passable; ~60 unit tests migrated to the new geometry, replay goldens
  re-derived, playthrough driver clears 1-2/1-3.

## Landed: flagpole finale + honest pipes (2026-07-16)

- Full flag cutscene (ball knock on any grab, full flag drop, slide, walk into
  the castle), goal-reach import fix, ROM-height pipes with real pipe art and
  a two-tile enterable-mouth cue, structure-preserving enemy placement, and
  hidden-blocks-standable in the completability model (8-4's ROM route).

## Landed: replay death visibility, flagpole cutscene, cutscene/Bowser coverage (2026-07-15)

- Timeline replay re-anchors recorded camera views by their bottom edge so the
  death animation (and all ground action) is visible above the replay bar.
- Flagpole finish fixed on real maps: dismount base from adjacent-column
  ground, full flag drop at any grab height, top-grab knocks the ball off.
- New browser suite tests/browser/cutscenes.spec.ts (flag slide ×2, castle
  clear fixture + real castle with Bowser, fireworks) plus engine tests for
  Bowser mechanics; debug hooks: teleportPlayer + cutscene snapshot.

## Landed: mobile touch-deck session fix (2026-07-15)

- Suspended sessions no longer leave their NES touch panels visible beside the
  next game's canvas (double decks, squeezed play area), and closing a session
  tab now really destroys the game (destroy-then-wake for a synchronous
  teardown; teardown on `DESTROY` too). See WHAT_WE_DID / BUGS.
- Follow-up landed the same day: all per-session DOM (canvas, touch deck,
  replay overlay) now lives in one per-session root element that the session
  manager hides/shows/removes atomically — the scene does no per-element
  suspend/resume bookkeeping at all, deleting the bug class structurally.

## Landed: session state, mobile UX, WebGL renderer (2026-07-12, ninth pass)

- **Session-persistent lives, coins, score, and power tier** — all persist
  across levels/deaths and reset on a new game (see WHAT_WE_DID / terminology).
- **End-of-level time-bonus countdown** (time → score, 50/unit, ticking).
- **Selectable renderer** (Canvas/WebGL/Auto) via a start-menu dropdown and
  `?renderer=` param; fidelity + context-loss verified (decision 0020).
- **Mobile-landscape UX** — menu/editor/replay overlay fit without scroll;
  perf: DPR cap on touch, thumbnail throttle, render-loop set caching.
- **Reset saved data** button; **developer docs** (architecture, terminology,
  CONTRIBUTING).

### Candidate next steps

- **WebGL as the default**: needs the `boot.spec` screenshot baselines
  regenerated (and confirmed to match the CI rendering environment). Currently
  opt-in with Canvas default.
- **Suspended-session WebGL context release** (bound context count with many
  simultaneous WebGL games) — optional; Phaser already recovers a lost context.
- Stabilize the timing-sensitive `boot.spec` "authored enemy-only contact" test.

## Landed: fidelity sweep (2026-07-12, eighth pass)

- **Piranha plants retract into their pipes** (sink 24px, render behind the
  pipe; sim + occlusion tested).
- **Flag-ball grab verified** end to end (top-of-pole = 5000; every height
  band pinned).
- **Exact-position verification for all 54 levels**: census pins every
  actor/mechanism position + a tile-grid digest, and a browser journey boots
  all 54 pack levels (deep-linking sub-areas) and compares live rendered actor
  positions to the decoded spec at frame 0.
- **Mobile NES control deck** moved outside the drawing surface (canvas shrinks
  to make room; cross D-pad + A/B + START); landscape browser test drives it.
- **ROM hitbox audit** + two discrete collision fixes (Bullet Bills stompable;
  stomp-on-descent).
- **All-54 headless playthrough mode** (`SMB_PLAY_ALL=1`) added. Measurement at
  budget scale 2: the mains behave as documented (single-run stochastic
  variance; the union across rounds finishes all but 4-4/8-4). The warp/bonus
  sub-areas do NOT complete from a _cold_ start — e.g. the `smb-warp-2-2-w*`
  rooms are full 160-wide sub-levels whose real entry is a walk-in pipe reached
  in-context, so their bare `PlayerStart` leaves the stochastic driver with no
  route (it stalls at x≈34). This is a cold-start/context limitation of the
  driver, not a level defect: every sub-area is proven completable by the
  static BFS, live-verified for exact content/positions, and traversed
  in-context when a main run takes its entering pipe. Making the cold-start
  all-54 pass would need context-aware warp-room pipe entry + seed sweeps.

## Landed: collision geometry is ROM-faithful; water music; crouch (ninth pass)

- **All six ROM hitbox-audit bugs fixed** (see BUGS.md / WHAT_WE_DID): Bullet
  Bills stompable, stomp-on-descent, Bowser flame inset box, player hurtbox
  (10×12 / 12×24), per-enemy ROM widths, and big-Mario crouch (walk-stop +
  12×12 duck box + a duck sprite in the parody skin). Object collision is now
  decoupled from render/terrain via `playerHurtbox` / `makeEnemyHurtbox`.
- **Water music.** Decoded the ROM's swimming theme (fourth theme) and gave the
  water levels an "underwater Morty" effect bus (lowpass wobble + nasal peak +
  tremolo waver).
- **Mobile NES controls finished**: flank the canvas, haptics, size toggle
  (persisted), pointer-capture thumb-roll, iOS callout/tap-highlight suppression.

## Landed: full-pack verification (2026-07-11, sixth pass)

- Machine proofs over all 54 levels: start-to-end completability (movement
  envelope + transfers + loop gates), a pinned per-level content census,
  and a live browser check that every menu level's running game holds its
  full decoded content. Four fidelity bugs found and fixed (loop-zone rows,
  water coral solidity, walk-in pipe triggers, SecondaryHardMode enemies).

## Landed: the parody skin is complete (2026-07-11, fifth pass)

- Authored art for every visual element: 24 scenery tiles, mechanisms
  (firebars, podoboos, lifts, flag), all projectile kinds, palette-swapped
  powered/fire player tiers, and the full editor cast. No vector fallbacks
  remain with the shipped skin. Plus three boyscout fixes (hidden-block
  scenery holes, projectile render-pool leak, timeline scrub key leak).

## Landed: scenery + checkpoints + scoring (2026-07-11, third pass)

- **Scenery layer decoded** — clouds/bushes/hills/fences/trees, trunks and
  stems under ledges, bridge rails, start/end castle buildings, water bands,
  and lava (not water) in castle pits. Levels no longer read as empty.
- **Halfway respawn checkpoints** (ROM HalfwayPageNybbles; castles none),
  **flagpole height scoring** (100–5000 by grab height), and **first-quest
  hardOnly enemy filtering** are in.

## Landed: the polish deltas are done (2026-07-11, second pass)

Everything from the previous "known deltas" list is now in:

- **Warp progression** — runs keep their origin's HUD number and next-level
  chain through flag-tail/bonus warps; warp-zone jumps retitle the run and
  advance within the new world; clearing 8-4 returns to the menu.
- **Water-level exits** — 2-2/7-2 end by swimming into their sideways water
  pipe (into the shared flag tail, like the ROM), and **8-4's water section
  exits back into the castle past the final loop checkpoint** — the maze's
  true completion path. A committed-pack coherence test now guards every
  cross-level transfer, 8-4's checkpoint/bypass wiring, and every castle's
  boss staging.
- **Castle-clear cinematic** — reaching the axe chops the bridge planks away
  from the axe side, drops the boss, and shows an original rescue message
  (final castle: the friend is freed; others: "in another keep").
- **Spiny eggs hatch** — Lakitu's landed eggs become walking Spinies (capped
  at three), harmful on contact, fireball-killable.
- **Visuals** — paratroopas carry winged sprites/fallback wings until
  stomped; balance lifts draw their pulley ropes.
- **Tuning** — Bullet Bill speed set from the ROM's 3x-walker ratio; a test
  pins star invincibility ignoring flame/hazard contact.
- **Editor** — places the red snapper, winged snapper, urchin and the
  five-fireball warden, plus firebars, podoboos and three lift kinds
  (share-URL codes J-Z); official-level imports round-trip their mechanisms.

## Landed: ROM-exact player physics (2026-07-11, fourth pass)

- Speed-indexed jump tiers (standing 4-tile / running 5-tile apex, latched
  at launch), FrictionData ground accel/friction, terminal fall 270 px/s,
  swim strokes from tier 5. Player movement constants are now source-derived
  from the disassembly's tables, not tuned approximations.

## Landed: headless playthroughs + complete ROM dev skin (2026-07-11, seventh pass)

- A headless engine playthrough test drives every main level to a finish
  (checkpointed exploring controller over the real stepSimulation); the
  walk-in pipe trigger was fixed to gate on input direction (fifth fidelity
  bug). The local ROM-extracted skin now covers the entire cast, mechanisms,
  scenery, and fire-tier player frames (86 numeric compositions).

## Remaining: the stochastic player vs the two deepest mazes

- The headless driver has fully completed every main level except 4-4 and
  8-4 (it reaches their second gates/checkpoints). Their completability is
  machine-proven, their mechanics are unit- and live-verified, and a
  direct regression test proves 4-4's second gate accepts the legitimate
  grounded bottom crossing (the firebar guarding it remains lethal to a
  small player — the real difficulty). What is missing is only an
  automated player skilled enough to chain the full maze runs. Options:
  seed sweeps (SMB_PLAY_SEED), longer budgets, or an authored TAS-style
  input plan per maze executed on the real engine.

## Remaining backlog (pre-existing, unchanged)

- Loop zones and frenzy regions are decoder-level region mechanics — not
  editor paint objects (by design; author them via level JSON metadata).
- Balance-lift pairs aren't editor-placeable (pairing UI); single lifts are.
- Per-state player colliders and exact timer conversions (movement constants
  are now ROM-derived; enemy/lift/cadence tuning is still sensible-not-measured).
- Frame verification (`verify:smb-frames` palette reconciliation), audio
  parity, editor UI for connecting walk-in pipes.
- A human playthrough pass over the full 32-level run for feel/pacing.

## Fidelity backlog

- (cleared 2026-07-19: fire flower when super, Lakitu respawn, spring
  squash flash, vine-grow sound — the audited backlog is done. Remaining
  known deviation, kept by design: normal-mode damage knockback, which the
  ROM does not have; say the word to remove it.)

# Current next work

- Retarget the four-player recorded completion and stress journeys from the
  retired miniature fixture routes to release-bundle World maps, then inspect
  each recorded player perspective. Do not call that evidence complete until
  all sessions traverse an actual level handoff.
- Continue replacing remaining optional primitive render branches in
  `BootScene` with explicit authored-asset requirements, with coverage tests
  for every shipped content-set level.
