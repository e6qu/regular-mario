# Death Effects and Feedback

The shell plays a cause-specific death animation, a matching sound, and (on
supported devices) a haptic buzz whenever the player is defeated. All of it lives
in the imperative shell — the deterministic engine only reports _that_ the player
was defeated and _why_; the shell decides how the death looks, sounds, and feels.

## Sources

- Animation and dispatch: `src/shell/scenes/boot-scene.ts` (`maybeBeginDeathEffect`,
  `stepDeathEffect`, `resolveDeathEffectStyle`).
- Sounds: `src/shell/game-audio.ts` (`playDeathSound`, `playOuch`,
  `emitBrickShatter`).
- Ground quake: `src/shell/ground-quake.ts` (`resolveGroundQuake`) applied by
  `boot-scene.ts` (`triggerGroundQuake`).
- Haptics: `src/shell/scenes/boot-scene.ts` (`stepHaptics`, `vibrateHaptic`).
- Overlay sprites (X-ed-eyes, smoke puff, flame tongue): shared grids in
  `scripts/death-effect-overlay-sprites.mjs`, drawn into both the parody and ROM
  skins by `scripts/build-parody-asset-set.mjs` and `scripts/build-rom-asset-set.mjs`.
- Browser coverage: `tests/browser/death-effects.spec.ts`.

## Death styles

The style is chosen from the engine's `PlayerDefeatReason` and the section's
`LevelTheme`:

- **explode** — an enemy contact on land. The authored player sprite is cut into
  six anatomical chunks (head, torso, two arms, two legs), which pop up, fling wide,
  and spin. Each chunk is an AABB rigid body (`src/shell/death-part-physics.ts`,
  driven per-frame from the scene): it falls under gravity, lands on and bounces
  elastically off the level's blocks/ground (a "rubber" restitution that decays so
  bounces settle), bounces off side walls, and — if nothing catches it — keeps
  falling off the bottom of the level. A chunk that strikes a live enemy bounces
  off it and knocks it out: the enemy flips over and ragdolls away under gravity
  (tracked in `deathKnockedEnemies`; the debug snapshot's `knockedEnemyCount`
  counts them).
- **burn** — a lava/fire hazard contact. The body visibly catches fire (authored
  flame tongues cling to and flicker over it), chars, sinks, and shrinks to nothing
  while smoke puffs rise off it.
- **float** — any death in a `water` theme. The body flips belly-up, an X-ed-eyes
  overlay is laid over the face, and the camera follows it as it drifts all the way
  up to the surface (with a gentle wobble) and holds there before the menu opens.
- **impale** — a fall onto a spike (`thorn`) tile. The limp body is pinned where it
  landed with the X-ed-eyes overlay.
- **launch** — any other contact death. The classic pop-up-and-fall-off-screen arc.

Lava (`lava-surface` / `lava-body`) is a lethal `Hazard` tile, so falling in
produces a `HazardContact` — rendered as **burn** — rather than dropping through to
a pit death. Spikes (`thorn`) are also a lethal `Hazard`, rendered as **impale**.

Pit and time-up deaths already read as a fall or a freeze, so they play no effect.

The replay/retry menu waits for the active style to finish animating
(`deathEffectAnimating`) before it opens, so the death is always seen before the
frame freezes.

## Sounds

`playDeathSound` synthesizes a cartoony, exaggerated cue per style (splat, burn
sizzle, drowning glug, or a metallic impale "shwing"); a burn also plays a long
agonized `playScream` wail over the sizzle, and a head-bonk plays a `playOuch` yelp
layered over the bump. Sounds are synthesized with the Web Audio API, like the rest
of the shell's audio; nothing is sampled.

Breaking a brick (big Mario bonking a breakable block) emits a dedicated
`SoundEvent.BlockBreak` (raised in `sound-events.ts` when the broken-tile set
grows). Instead of a single oscillator sweep, `emitBrickShatter` layers a sharp
bright crack, two staggered mid-band rubble crunches, and a short low thud from
the shared noise burst so it reads as real bricks breaking, over the bonk thud.

## Ground quake (hard landing)

A landing after a net fall of more than two blocks — measured ground-to-ground
(the last-grounded world-Y vs the landing Y), so an ordinary jump back to the
same level never counts — shakes the whole main camera a little. The pure
`resolveGroundQuake` (`src/shell/ground-quake.ts`) maps the drop to a Phaser
camera-shake intensity/duration that grows with the fall and saturates at eight
blocks; `triggerGroundQuake` applies it and bumps a debug `groundQuakeCount`. A
rolling rumble haptic fires alongside.

## Haptics

On a touch device with the Vibration API, `stepHaptics` buzzes per event: a tick
on landing, a snap on a stomp, a crunchy tick when a brick shatters, a triple
thud on a head-bonk, and a longer rumble on death; a hard-landing quake buzzes a
rolling rumble. Every touch control also buzzes when pressed. Durations are kept
above ~12ms because a phone's vibration motor needs a few milliseconds to spin
up, so shorter pulses are imperceptible (the old 6ms land tick read as "haptics
don't work"). iOS ignores the Vibration API entirely, so these are no-ops there.

## No procedural fallbacks

Every effect renders authored art: the explode chunks are real crops of the player
sprite, and the X-ed-eyes, smoke, and flame overlays are authored 16x16 sprites
present in both skins. The player itself is always the authored sprite — there is
no procedural vector-rectangle player anymore (see
[Architecture](../architecture.md); even the debug `?browserLevel=` routes load the
default skin). If the explode style ever finds no player sprite to cut apart it
degrades to the `launch` arc rather than drawing a procedural stand-in body.
