// The "little earthquake" a hard landing makes: a landing after a net fall of
// more than `hardLandingDropTiles` tiles (measured ground-to-ground, so an
// ordinary jump back to the same level never triggers it) shakes the whole
// screen. The shake grows with the drop and saturates once the fall reaches the
// saturation depth. Pure so the trigger threshold and scaling are testable
// without a Phaser scene; the scene applies the returned camera shake.

export type GroundQuake = {
  // Phaser camera-shake intensity, a fraction of the viewport (kept subtle).
  readonly intensity: number;
  readonly durationMs: number;
};

// A fall of more than this many tiles shakes the screen; a shorter drop doesn't.
// Kept high on purpose: routine platforming in stepped levels (1-2's pillars,
// etc.) drops the player three-to-five tiles constantly, and shaking on every
// one of those reads as flicker and makes the motion feel unsteady. Only a
// genuine plunge — most of the screen's height — should shake.
export const hardLandingDropTiles = 6;
// The fall depth (tiles) at which the quake reaches full strength.
const hardLandingSaturationTiles = 12;
// A brief, subtle bump — not a long jittery rumble.
const minIntensity = 0.003;
const maxIntensity = 0.008;
const minDurationMs = 110;
const maxDurationMs = 200;

function lerp(from: number, to: number, fraction: number): number {
  return from + fraction * (to - from);
}

// The quake for a landing that fell `dropTiles` (ground-to-ground), or null when
// the drop is too small to shake the screen.
export function resolveGroundQuake(dropTiles: number): GroundQuake | null {
  if (dropTiles <= hardLandingDropTiles) {
    return null;
  }
  const span = hardLandingSaturationTiles - hardLandingDropTiles;
  const fraction = Math.min(1, Math.max(0, (dropTiles - hardLandingDropTiles) / span));
  return {
    intensity: lerp(minIntensity, maxIntensity, fraction),
    durationMs: lerp(minDurationMs, maxDurationMs, fraction),
  };
}
