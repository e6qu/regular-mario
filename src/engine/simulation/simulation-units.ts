import {
  makeFrameDurationMilliseconds,
  makePixelPosition,
  makeVelocityPixelsPerSecond,
  type FrameDurationMilliseconds,
} from "../domain/units";

const millisecondsPerSecond = 1000;

const nominalSixtyHertzFrameDurationRawMilliseconds = 16.666_666_667;

function requireFrameDurationMilliseconds(
  value: number,
  path: string,
): FrameDurationMilliseconds {
  const result = makeFrameDurationMilliseconds(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid frame duration.`);
  }

  return result.value;
}

export const nominalSixtyHertzFrameDurationMilliseconds: FrameDurationMilliseconds =
  requireFrameDurationMilliseconds(
    nominalSixtyHertzFrameDurationRawMilliseconds,
    "nominalSixtyHertzFrameDurationMilliseconds",
  );

export function makeFrameDurationSeconds(
  frameDurationMilliseconds: FrameDurationMilliseconds,
): number {
  return frameDurationMilliseconds / millisecondsPerSecond;
}

export function requireSimulationVelocity(value: number, path: string) {
  const result = makeVelocityPixelsPerSecond(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid velocity.`);
  }

  return result.value;
}

export function requireSimulationPixelPosition(value: number, path: string) {
  const result = makePixelPosition(value, path);

  if (!result.ok) {
    throw new Error(`${path} must be a valid pixel position.`);
  }

  return result.value;
}
