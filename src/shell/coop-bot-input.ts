import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";

// Demo "robot" players: co-op players driven by deterministic pseudo-random
// inputs so several characters wander the level on their own (used by the
// GitHub Pages demo). Deterministic — a pure hash of (frame, bot) with no
// Math.random — so a recorded run still replays exactly.

// A bot holds a chosen walk direction for this many frames, then re-rolls, so it
// ambles rather than jittering every frame.
const botDirectionHoldFrames = 28;
// It reconsiders jumping on this cadence.
const botJumpHoldFrames = 22;

// A small integer avalanche hash (deterministic, platform-independent).
function hashInt(value: number): number {
  let hashed = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  hashed = Math.imul(hashed ^ (hashed >>> 16), 0x45d9f3b);
  return (hashed ^ (hashed >>> 16)) >>> 0;
}

export function makeBotInputCommand(
  frameIndex: number,
  botIndex: number,
): SimulationInputCommand {
  const directionRoll =
    hashInt(
      Math.floor(frameIndex / botDirectionHoldFrames) * 2654435761 +
        botIndex * 40503 +
        1,
    ) % 4;
  // Bias toward moving right (2/4) so bots tend to progress through the level.
  const horizontal =
    directionRoll === 0
      ? HorizontalInput.Left
      : directionRoll === 1
        ? HorizontalInput.Neutral
        : HorizontalInput.Right;

  const jumpRoll =
    hashInt(
      Math.floor(frameIndex / botJumpHoldFrames) * 40503 +
        botIndex * 2654435761 +
        7,
    ) % 5;

  return {
    horizontal,
    jumpPressed: jumpRoll === 0,
    runHeld: false,
    firePressed: false,
    upHeld: false,
    downHeld: false,
  };
}

// The per-frame input array for `botCount` bots (indices 0..botCount-1).
export function makeBotInputCommands(
  frameIndex: number,
  botCount: number,
): readonly SimulationInputCommand[] {
  return Array.from({ length: Math.max(0, botCount) }, (_unused, botIndex) =>
    makeBotInputCommand(frameIndex, botIndex),
  );
}
