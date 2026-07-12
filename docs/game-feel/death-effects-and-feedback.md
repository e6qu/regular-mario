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
- Overlay sprites: `scripts/death-effect-overlay-sprites.mjs`, drawn into both the
  parody and ROM skins by `scripts/build-parody-asset-set.mjs` and
  `scripts/build-rom-asset-set.mjs`.
- Browser coverage: `tests/browser/death-effects.spec.ts`.

## Death styles

The style is chosen from the engine's `PlayerDefeatReason` and the section's
`LevelTheme`:

- **explode** — an enemy contact on land. The authored player sprite is cut into
  four quadrant crops that pop up, fling apart, spin, and fall under gravity.
- **burn** — a lava/fire hazard contact. The body is tinted, sinks, and shrinks to
  nothing while smoke puffs rise off it.
- **float** — any death in a `water` theme. The body flips belly-up, an X-ed-eyes
  overlay is laid over the face, and it drifts to the surface with a wobble.
- **impale** — a fall onto a spike (`thorn`) tile. The limp body is pinned where it
  landed with the X-ed-eyes overlay.
- **launch** — any other contact death (and the fallback when a skin has no player
  sprite to cut apart). The classic pop-up-and-fall-off-screen arc.

Pit and time-up deaths already read as a fall or a freeze, so they play no effect.

The replay/retry menu waits for the active style to finish animating
(`deathEffectAnimating`) before it opens, so the death is always seen before the
frame freezes.

## Sounds

`playDeathSound` synthesizes a cartoony, exaggerated cue per style (splat, burn
sizzle, drowning glug, or a metallic impale "shwing"), and a head-bonk plays an
additional `playOuch` yelp layered over the bump. Sounds are synthesized with the
Web Audio API, like the rest of the shell's audio; nothing is sampled.

## Haptics

On a touch device with the Vibration API, `stepHaptics` buzzes a short tick on
landing, a double thud on a head-bonk, and a longer rumble on death. Every touch
control also buzzes briefly when pressed. iOS ignores the Vibration API, so these
are no-ops there.

## No procedural fallbacks

Every effect renders authored art: the explode pieces are real crops of the player
sprite, and the X-ed-eyes and smoke overlays are authored 16x16 sprites present in
both skins. When a required sprite is genuinely absent (for example a skin with no
player sprite at all) the death degrades to the `launch` arc rather than drawing a
procedural stand-in body.
