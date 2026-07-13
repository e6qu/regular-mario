# Death Effects and Feedback

The shell plays a cause-specific death animation, a matching sound, and (on
supported devices) a haptic buzz whenever the player is defeated. All of it lives
in the imperative shell — the deterministic engine only reports _that_ the player
was defeated and _why_; the shell decides how the death looks, sounds, and feels.

## Sources

- Animation and dispatch: `src/shell/scenes/boot-scene.ts` (`maybeBeginDeathEffect`,
  `stepDeathEffect`, `resolveDeathEffectStyle`).
- Sounds: `src/shell/game-audio.ts` (`playDeathSound`, `playOuch`).
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
  spin, and rain down across the map under gravity.
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

## Haptics

On a touch device with the Vibration API, `stepHaptics` buzzes a short tick on
landing, a double thud on a head-bonk, and a longer rumble on death. Every touch
control also buzzes briefly when pressed. iOS ignores the Vibration API, so these
are no-ops there.

## No procedural fallbacks

Every effect renders authored art: the explode chunks are real crops of the player
sprite, and the X-ed-eyes, smoke, and flame overlays are authored 16x16 sprites
present in both skins. The player itself is always the authored sprite — there is
no procedural vector-rectangle player anymore (see
[Architecture](../architecture.md); even the debug `?browserLevel=` routes load the
default skin). If the explode style ever finds no player sprite to cut apart it
degrades to the `launch` arc rather than drawing a procedural stand-in body.
