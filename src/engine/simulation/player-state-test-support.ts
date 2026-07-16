import {
  HorizontalMovementState,
  VerticalMovementState,
} from "./movement-model";

export const expectedInitialPlayerSimulationState = {
  position: {
    x: 16,
    y: 64,
  },
  velocity: {
    x: 0,
    y: 0,
  },
  collider: {
    width: 14,
    height: 16,
  },
  movement: {
    horizontal: HorizontalMovementState.Idle,
    vertical: VerticalMovementState.Grounded,
  },
  coyoteFramesRemaining: 0,
  jumpBufferFramesRemaining: 0,
  jumpCutApplied: false,
  jumpTierIndex: 0,
} as const;
