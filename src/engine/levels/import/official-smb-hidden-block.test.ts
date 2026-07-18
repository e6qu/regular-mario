// Real-input proof of 8-4's second maze segment against the live engine: the
// famous hidden block at (150, 9) is bumped from below, mounted, and used to
// reach the floating pipe at 152 (cap row 6) — a frame-scripted input search
// finds a working jump/drift window, pinning that the route is playable (the
// original's intended path; the paratroopa bounce is only the expert line).

import { describe, expect, it } from "vitest";

import { makeSimulationInputCommand } from "../../simulation/input-command";
import type { SimulationInputCommand } from "../../simulation/input-command";
import { HorizontalInput } from "../../simulation/input-command";
import { initialMovementConstants } from "../../simulation/movement-model";
import { VerticalMovementState } from "../../simulation/movement-model";
import { PipeEntryPhase } from "../../simulation/pipe-state";
import { PlayerOutcomeKind } from "../../simulation/player-outcome";
import {
  makeInitialSimulationStateWithPlayerVitality,
  type SimulationState,
} from "../../simulation/simulation-state";
import { PlayerVitalityKind } from "../../simulation/player-vitality";
import {
  nominalSixtyHertzFrameDurationMilliseconds,
  requireSimulationPixelPosition,
} from "../../simulation/simulation-units";
import { stepSimulation } from "../../simulation/step-simulation";
import { loadOfficialSmbPack } from "./official-smb-pack.test-support";

const pack = loadOfficialSmbPack();

function input(
  horizontal: HorizontalInput,
  jump: boolean,
  down = false,
): SimulationInputCommand {
  // Run (B) held throughout, like real play — the run-speed jump tiers are
  // what make the 4-tile block and 7-tile pipe cap reachable.
  const result = makeSimulationInputCommand(
    horizontal,
    jump,
    true,
    false,
    false,
    down,
  );
  if (!result.ok) {
    throw new Error("input must validate");
  }
  return result.value;
}

describe("8-4 hidden-block route (segment 2)", () => {
  it("bumps the hidden block, mounts it, and enters the floating pipe", () => {
    const level = pack.get("smb-8-4");
    if (level === undefined) {
      throw new Error("smb-8-4 missing from pack");
    }
    const spec = level.levelSpec;
    // God-mode constants: identical jump/run physics, enemy damage ignored.
    // The proof is about geometry (block reach, cap reach, pipe entry) — the
    // paratroopa stream overhead is ordinary dodge-or-stomp play and would
    // only add retries, not change reachability.
    const searchConstants = { ...initialMovementConstants, godMode: true };
    const initial = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      spec,
      searchConstants,
      { kind: PlayerVitalityKind.Small },
    );
    if (!initial.ok) {
      throw new Error("initial state invalid");
    }
    // A player who has walked to the ledge below the block (ground row 13).
    const start: SimulationState = {
      ...initial.value,
      players: [
        {
          ...initial.value.players[0],
          player: {
            ...initial.value.players[0].player,
            position: {
              x: requireSimulationPixelPosition(148 * 16, "player.position.x"),
              y: requireSimulationPixelPosition(
                13 * 16 - 16,
                "player.position.y",
              ),
            },
          },
        },
        ...initial.value.players.slice(1),
      ],
    };

    const step = (state: SimulationState, command: SimulationInputCommand) =>
      stepSimulation(state, command, searchConstants, spec);

    const playerOf = (state: SimulationState) => state.players[0].player;
    const grounded = (state: SimulationState) =>
      playerOf(state).movement.vertical === VerticalMovementState.Grounded;
    const feetOf = (state: SimulationState) =>
      playerOf(state).position.y + playerOf(state).collider.height;
    const alive = (state: SimulationState) =>
      state.players[0].outcome.kind === PlayerOutcomeKind.Active;

    // Phase A — bump the hidden block: centre under it (tap-walk so slide
    // momentum can't overshoot the one-tile alignment) and jump straight up.
    let state = start;
    const centerOf = (current: SimulationState) =>
      playerOf(current).position.x + playerOf(current).collider.width / 2;
    for (let correction = 0; correction < 8; correction += 1) {
      const settledCenter = centerOf(state);
      if (settledCenter >= 150 * 16 + 1 && settledCenter <= 150 * 16 + 12) {
        break;
      }
      const towardRight = settledCenter < 150 * 16 + 1;
      // Walk toward the block, release early, let the slide settle.
      for (
        let frame = 0;
        frame < 40 &&
        (towardRight
          ? centerOf(state) < 150 * 16 - 8
          : centerOf(state) > 150 * 16 + 14);
        frame += 1
      ) {
        state = step(
          state,
          input(
            towardRight ? HorizontalInput.Right : HorizontalInput.Left,
            false,
          ),
        );
      }
      for (let frame = 0; frame < 16; frame += 1) {
        state = step(state, input(HorizontalInput.Neutral, false));
      }
    }
    for (let frame = 0; frame < 24; frame += 1) {
      state = step(state, input(HorizontalInput.Neutral, true));
    }
    for (let frame = 0; frame < 40; frame += 1) {
      state = step(state, input(HorizontalInput.Neutral, false));
    }
    expect(alive(state)).toBe(true);
    const revealed = state.interactiveBlocks.bumpedBlockTilePositions.some(
      (position) => position.x === 150 && position.y === 9,
    );
    expect(revealed).toBe(true);

    // Phase B — mount the block. A standstill (tier-0) jump peaks at 63.8px,
    // a hair under the 4-tile block top — exactly the ROM feel: the mount
    // needs a WALKING jump (tier 1 rises ~68px). Search run-up length, jump
    // hold, and how long Right stays held in the air; the block's underside
    // bonks any jump that slides under it too low, so timing matters.
    const settled = state;
    let mounted: SimulationState | undefined;
    for (let runUp = 6; runUp <= 60 && mounted === undefined; runUp += 3) {
      for (
        let rightHold = 0;
        rightHold <= 22 && mounted === undefined;
        rightHold += 2
      ) {
        for (let jumpHold = 12; jumpHold <= 26; jumpHold += 3) {
          let candidate = settled;
          // Retreat left of the block and settle to a stable take-off spot.
          for (let correction = 0; correction < 8; correction += 1) {
            const takeOffCenter = centerOf(candidate);
            if (takeOffCenter <= 148 * 16 - 24) {
              break;
            }
            for (
              let frame = 0;
              frame < 40 && centerOf(candidate) > 148 * 16 - 28;
              frame += 1
            ) {
              candidate = step(candidate, input(HorizontalInput.Left, false));
            }
            for (let frame = 0; frame < 14; frame += 1) {
              candidate = step(
                candidate,
                input(HorizontalInput.Neutral, false),
              );
            }
          }
          if (!grounded(candidate) || !alive(candidate)) {
            continue;
          }
          // Run-up, then the moving jump.
          for (let frame = 0; frame < runUp; frame += 1) {
            candidate = step(candidate, input(HorizontalInput.Right, false));
          }
          if (!grounded(candidate)) {
            continue;
          }
          let success = false;
          for (let frame = 0; frame < 60; frame += 1) {
            const jump = frame < jumpHold;
            const right = frame < rightHold;
            candidate = step(
              candidate,
              input(
                right ? HorizontalInput.Right : HorizontalInput.Neutral,
                jump,
              ),
            );
            if (!alive(candidate)) {
              break;
            }
            const centerX = centerOf(candidate);
            if (
              grounded(candidate) &&
              feetOf(candidate) === 9 * 16 &&
              centerX >= 150 * 16 &&
              centerX < 151 * 16
            ) {
              success = true;
              break;
            }
          }
          if (success) {
            mounted = candidate;
            break;
          }
        }
      }
    }
    expect(
      mounted,
      "no jump/drift window mounts the hidden block",
    ).toBeDefined();
    if (mounted === undefined) {
      return;
    }

    // Phase C — leap from the block onto the pipe cap and press Down.
    let entered = false;
    for (let jumpHold = 18; jumpHold <= 30 && !entered; jumpHold += 3) {
      for (let driftStart = 0; driftStart <= 24 && !entered; driftStart += 2) {
        for (
          let driftFrames = 4;
          driftFrames <= 30 && !entered;
          driftFrames += 2
        ) {
          let candidate = mounted;
          for (let frame = 0; frame < 70; frame += 1) {
            const jump = frame < jumpHold;
            const right =
              frame >= driftStart && frame < driftStart + driftFrames;
            candidate = step(
              candidate,
              input(
                right ? HorizontalInput.Right : HorizontalInput.Neutral,
                jump,
              ),
            );
            if (!alive(candidate)) {
              break;
            }
            if (
              grounded(candidate) &&
              feetOf(candidate) === 6 * 16 &&
              playerOf(candidate).position.x >= 151 * 16
            ) {
              // On the cap: press Down to enter.
              for (let downFrame = 0; downFrame < 4; downFrame += 1) {
                candidate = step(
                  candidate,
                  input(HorizontalInput.Neutral, false, true),
                );
              }
              if (candidate.pipeEntry.phase === PipeEntryPhase.Entering) {
                entered = true;
              }
              break;
            }
          }
        }
      }
    }
    expect(entered, "no leap window reaches the pipe cap entry").toBe(true);
  }, 120_000);
});
