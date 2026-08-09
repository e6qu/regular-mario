import type { BreakableBlockState } from "./breakable-block-state";
import type { LevelSpec } from "./../domain/level-spec";
import { HorizontalInput, type SimulationInputCommand } from "./input-command";
import {
  type MovementConstants,
  VerticalMovementState,
} from "./movement-model";
import {
  applyCrouchResize,
  poweredPlayerColliderDimensions,
  type PlayerSimulationState,
} from "./player-state";
import { playerHasStandingHeadroom } from "./solid-tile-collision";
import {
  PlayerVitalityKind,
  type PlayerVitalityState,
} from "./player-vitality";

/**
 * How ducking affects one player this frame.
 *
 * Extracted so every player resolves it the same way. It lived inline in the
 * primary player's step, which is exactly how a rule ends up applying to one
 * player and not the rest — the co-op path had no crouch at all, so a big co-op
 * player could not duck under anything and could not crawl the one-tile gaps
 * that 1-2 and 4-2 are built around.
 */
export interface CrouchResolution {
  readonly crouching: boolean;
  /** The player resized to the ducked box (or left standing). */
  readonly player: PlayerSimulationState;
  /** Input with the walk neutralised while sliding, as the ROM's slide does. */
  readonly inputCommand: SimulationInputCommand;
  /** Crawl-speed constants while ducked and not sliding. */
  readonly movementConstants: MovementConstants;
}

/** Above this speed a duck becomes a slide that keeps its momentum. */
const crawlSpeedPixels = 40;

export function resolveCrouchState(
  player: PlayerSimulationState,
  vitality: PlayerVitalityState,
  // Whether to duck is read from the command as the player pressed it. The
  // command that comes back out is the adjusted one below — freezing for a pipe
  // and damage-recovery both rewrite the command, and deciding the duck from
  // the rewritten version silently changes when a player ducks at all.
  rawInputCommand: SimulationInputCommand,
  adjustedInputCommand: SimulationInputCommand,
  levelSpec: LevelSpec,
  breakableBlocks: BreakableBlockState,
  movementConstants: MovementConstants,
  makeCrawlMovementConstants: (base: MovementConstants) => MovementConstants,
  // The pipe entry also reads Down and takes precedence over ducking. Only the
  // primary player can enter a pipe today, so co-op passes false.
  frozenByPipeEntry: boolean,
): CrouchResolution {
  const isBigVitality =
    vitality.kind === PlayerVitalityKind.Powered ||
    vitality.kind === PlayerVitalityKind.Fire;
  const wantsCrouch =
    isBigVitality &&
    player.movement.vertical === VerticalMovementState.Grounded &&
    rawInputCommand.downHeld &&
    !frozenByPipeEntry;
  // A ducked player under a low ceiling stays ducked (no standing up inside a
  // one-tile crawl) until the standing box has headroom again. Only a player
  // whose collider is actually the ducked size can be held crouched — the
  // headroom probe assumes the small box, and a standing player near a low
  // ceiling must never be pulled back into a crouch.
  const mustStayCrouched =
    player.crouching === true &&
    isBigVitality &&
    player.collider.height < Number(poweredPlayerColliderDimensions.height) &&
    !playerHasStandingHeadroom(
      player,
      Number(poweredPlayerColliderDimensions.height),
      levelSpec,
      breakableBlocks,
    );
  const crouching = wantsCrouch || mustStayCrouched;
  // A duck-slide above crawl speed keeps its momentum: input is neutralised so
  // friction plays out exactly like the original's slide.
  const crouchSliding =
    crouching && Math.abs(Number(player.velocity.x)) > crawlSpeedPixels;

  return {
    crouching,
    player: applyCrouchResize(player, crouching, vitality),
    inputCommand: crouchSliding
      ? { ...adjustedInputCommand, horizontal: HorizontalInput.Neutral }
      : adjustedInputCommand,
    movementConstants:
      crouching && !crouchSliding
        ? makeCrawlMovementConstants(movementConstants)
        : movementConstants,
  };
}
