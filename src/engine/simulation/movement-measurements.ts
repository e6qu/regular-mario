import type {
  FrameDurationMilliseconds,
  TileSizePixels,
} from "../domain/units";
import { makeFrameDurationSeconds } from "./simulation-units";
import type { MovementConstants } from "./movement-model";

type HorizontalMovementMeasurements = {
  readonly maxWalkSpeedTilesPerSecond: number;
  readonly maxRunSpeedTilesPerSecond: number;
  readonly framesToMaxWalkSpeed: number;
  readonly secondsToMaxWalkSpeedAtFrameDuration: number;
  readonly framesToMaxRunSpeed: number;
  readonly secondsToMaxRunSpeedAtFrameDuration: number;
  readonly framesToStopFromMaxWalkSpeed: number;
  readonly secondsToStopFromMaxWalkSpeedAtFrameDuration: number;
  readonly framesToStopFromMaxRunSpeed: number;
  readonly secondsToStopFromMaxRunSpeedAtFrameDuration: number;
};

type VerticalMovementMeasurements = {
  readonly jumpLaunchSpeedTilesPerSecond: number;
  readonly gravityTilesPerSecondSquared: number;
  readonly continuousJumpApexSeconds: number;
  readonly continuousJumpApexHeightPixels: number;
  readonly continuousJumpApexHeightTiles: number;
  readonly framesToContinuousJumpApexAtFrameDuration: number;
  readonly continuousReturnToLaunchHeightSeconds: number;
  readonly framesToContinuousReturnToLaunchHeightAtFrameDuration: number;
  readonly simulatedApexFrameAtFrameDuration: number;
  readonly simulatedApexHeightPixelsAtFrameDuration: number;
  readonly simulatedApexHeightTilesAtFrameDuration: number;
  readonly simulatedReturnToLaunchHeightFrameAtFrameDuration: number;
};

export type MovementMeasurements = {
  readonly horizontal: HorizontalMovementMeasurements;
  readonly vertical: VerticalMovementMeasurements;
};

function requirePositiveFinite(value: number, path: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${path} must be a positive finite number.`);
  }
}

function framesToReachVelocity(
  velocity: number,
  acceleration: number,
  frameDurationSeconds: number,
): number {
  requirePositiveFinite(velocity, "velocity");
  requirePositiveFinite(acceleration, "acceleration");
  requirePositiveFinite(frameDurationSeconds, "frameDurationSeconds");

  return Math.ceil(velocity / (acceleration * frameDurationSeconds));
}

function secondsForFrames(
  frames: number,
  frameDurationSeconds: number,
): number {
  requirePositiveFinite(frames, "frames");
  requirePositiveFinite(frameDurationSeconds, "frameDurationSeconds");

  return frames * frameDurationSeconds;
}

function measureSimulatedJump(
  jumpLaunchSpeed: number,
  gravity: number,
  frameDurationSeconds: number,
): {
  readonly apexFrame: number;
  readonly apexHeightPixels: number;
  readonly returnToLaunchHeightFrame: number;
} {
  requirePositiveFinite(jumpLaunchSpeed, "movement.jumpLaunchSpeed");
  requirePositiveFinite(gravity, "movement.gravity");
  requirePositiveFinite(frameDurationSeconds, "frameDurationSeconds");

  let velocityY = 0;
  let positionY = 0;
  let apexFrame = 0;
  let apexPositionY = 0;

  for (let frameIndex = 1; ; frameIndex += 1) {
    velocityY =
      frameIndex === 1
        ? 0 - jumpLaunchSpeed
        : velocityY + gravity * frameDurationSeconds;
    positionY += velocityY * frameDurationSeconds;

    if (positionY < apexPositionY) {
      apexFrame = frameIndex;
      apexPositionY = positionY;
    }

    if (frameIndex > 1 && positionY >= 0) {
      return {
        apexFrame,
        apexHeightPixels: 0 - apexPositionY,
        returnToLaunchHeightFrame: frameIndex,
      };
    }
  }
}

export function measureMovementConstants(
  movementConstants: MovementConstants,
  tileSizePixels: TileSizePixels,
  frameDurationMilliseconds: FrameDurationMilliseconds,
): MovementMeasurements {
  const frameDurationSeconds = makeFrameDurationSeconds(
    frameDurationMilliseconds,
  );
  requirePositiveFinite(
    movementConstants.jumpLaunchSpeed,
    "movement.jumpLaunchSpeed",
  );
  requirePositiveFinite(
    movementConstants.gravityRisingHeld,
    "movement.gravityRisingHeld",
  );

  const continuousJumpApexSeconds =
    movementConstants.jumpLaunchSpeed / movementConstants.gravityRisingHeld;
  const continuousReturnToLaunchHeightSeconds = continuousJumpApexSeconds * 2;
  const continuousJumpApexHeightPixels =
    (movementConstants.jumpLaunchSpeed * movementConstants.jumpLaunchSpeed) /
    (2 * movementConstants.gravityRisingHeld);
  const simulatedJump = measureSimulatedJump(
    movementConstants.jumpLaunchSpeed,
    movementConstants.gravityRisingHeld,
    frameDurationSeconds,
  );

  return {
    horizontal: {
      maxWalkSpeedTilesPerSecond:
        movementConstants.maxWalkSpeed / tileSizePixels,
      maxRunSpeedTilesPerSecond: movementConstants.maxRunSpeed / tileSizePixels,
      framesToMaxWalkSpeed: framesToReachVelocity(
        movementConstants.maxWalkSpeed,
        movementConstants.walkAcceleration,
        frameDurationSeconds,
      ),
      secondsToMaxWalkSpeedAtFrameDuration: secondsForFrames(
        framesToReachVelocity(
          movementConstants.maxWalkSpeed,
          movementConstants.walkAcceleration,
          frameDurationSeconds,
        ),
        frameDurationSeconds,
      ),
      framesToMaxRunSpeed: framesToReachVelocity(
        movementConstants.maxRunSpeed,
        movementConstants.runAcceleration,
        frameDurationSeconds,
      ),
      secondsToMaxRunSpeedAtFrameDuration: secondsForFrames(
        framesToReachVelocity(
          movementConstants.maxRunSpeed,
          movementConstants.runAcceleration,
          frameDurationSeconds,
        ),
        frameDurationSeconds,
      ),
      framesToStopFromMaxWalkSpeed: framesToReachVelocity(
        movementConstants.maxWalkSpeed,
        movementConstants.groundFriction,
        frameDurationSeconds,
      ),
      secondsToStopFromMaxWalkSpeedAtFrameDuration: secondsForFrames(
        framesToReachVelocity(
          movementConstants.maxWalkSpeed,
          movementConstants.groundFriction,
          frameDurationSeconds,
        ),
        frameDurationSeconds,
      ),
      framesToStopFromMaxRunSpeed: framesToReachVelocity(
        movementConstants.maxRunSpeed,
        movementConstants.groundFriction,
        frameDurationSeconds,
      ),
      secondsToStopFromMaxRunSpeedAtFrameDuration: secondsForFrames(
        framesToReachVelocity(
          movementConstants.maxRunSpeed,
          movementConstants.groundFriction,
          frameDurationSeconds,
        ),
        frameDurationSeconds,
      ),
    },
    vertical: {
      jumpLaunchSpeedTilesPerSecond:
        movementConstants.jumpLaunchSpeed / tileSizePixels,
      gravityTilesPerSecondSquared:
        movementConstants.gravityRisingHeld / tileSizePixels,
      continuousJumpApexSeconds,
      continuousJumpApexHeightPixels,
      continuousJumpApexHeightTiles:
        continuousJumpApexHeightPixels / tileSizePixels,
      framesToContinuousJumpApexAtFrameDuration: Math.ceil(
        continuousJumpApexSeconds / frameDurationSeconds,
      ),
      continuousReturnToLaunchHeightSeconds,
      framesToContinuousReturnToLaunchHeightAtFrameDuration: Math.ceil(
        continuousReturnToLaunchHeightSeconds / frameDurationSeconds,
      ),
      simulatedApexFrameAtFrameDuration: simulatedJump.apexFrame,
      simulatedApexHeightPixelsAtFrameDuration: simulatedJump.apexHeightPixels,
      simulatedApexHeightTilesAtFrameDuration:
        simulatedJump.apexHeightPixels / tileSizePixels,
      simulatedReturnToLaunchHeightFrameAtFrameDuration:
        simulatedJump.returnToLaunchHeightFrame,
    },
  };
}
