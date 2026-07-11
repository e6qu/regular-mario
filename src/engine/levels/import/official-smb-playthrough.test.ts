// Live playthrough of every main level against the real simulation engine:
// a frame-perfect driver steps stepSimulation() with a seeded exploring
// controller (run right, bounce-jump, press down over known pipe entrances,
// swim in water), keeps immutable state checkpoints, and rolls back with a
// new seed on death. Every one of the 36 main levels must reach a Finished
// outcome (following pipe transfers across sub-areas like the shell does).
// This exercises movement, enemies, hazards, mechanisms, pipes, loop zones,
// timers, and scoring end to end — everything but rendering.

import { describe, expect, it } from "vitest";

import { makeSimulationInputCommand } from "../../simulation/input-command";
import type { SimulationInputCommand } from "../../simulation/input-command";
import { HorizontalInput } from "../../simulation/input-command";
import { TileCollisionKind } from "../../domain/level-spec";
import { liveFrenzyCheeps } from "../../simulation/cheep-frenzy-state";
import {
  initialMovementConstants,
  swimmingMovementConstants,
  VerticalMovementState,
} from "../../simulation/movement-model";
import {
  PipeEntryPhase,
  teleportPlayerToTilePosition,
} from "../../simulation/pipe-state";
import {
  PlayerDefeatReason,
  PlayerOutcomeKind,
} from "../../simulation/player-outcome";
import {
  makeInitialSimulationStateWithPlayerVitality,
  type SimulationState,
} from "../../simulation/simulation-state";
import { PlayerVitalityKind } from "../../simulation/player-vitality";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../../simulation/simulation-units";
import { stepSimulation } from "../../simulation/step-simulation";
import {
  loadOfficialSmbPack,
  type OfficialPackLevel,
} from "./official-smb-pack.test-support";

const pack = loadOfficialSmbPack();

function requireInput(
  horizontal: HorizontalInput,
  jump: boolean,
  down: boolean,
): SimulationInputCommand {
  const result = makeSimulationInputCommand(
    horizontal,
    jump,
    true,
    false,
    false,
    down,
  );
  if (!result.ok) {
    throw new Error("playthrough input must validate");
  }
  return result.value;
}

// Deterministic xorshift PRNG so failures reproduce exactly.
function makeRng(seed: number): () => number {
  let value = seed || 1;
  return () => {
    value ^= value << 13;
    value ^= value >>> 17;
    value ^= value << 5;
    value >>>= 0;
    return value / 0xffffffff;
  };
}

type LevelRuntime = {
  readonly level: OfficialPackLevel;
  readonly constants: typeof initialMovementConstants;
  readonly solid: (col: number, row: number) => boolean;
  readonly downPipeCols: readonly number[];
  readonly walkInCols: readonly number[];
  readonly goalCols: readonly number[];
  readonly water: boolean;
};

const runtimes = new Map<string, LevelRuntime>();
function runtimeFor(name: string): LevelRuntime {
  const cached = runtimes.get(name);
  if (cached !== undefined) {
    return cached;
  }
  const level = pack.get(name);
  if (level === undefined) {
    throw new Error(`unknown level ${name}`);
  }
  const spec = level.levelSpec;
  const collisionByTileId = new Map(
    spec.tileDefinitions.map((definition) => [
      definition.tileId,
      definition.collision,
    ]),
  );
  const solidKinds = new Set([
    TileCollisionKind.Solid,
    TileCollisionKind.Breakable,
    TileCollisionKind.Interactive,
    TileCollisionKind.SolidHazard,
    TileCollisionKind.Spring,
  ]);
  const water = level.metadata.theme === "water";
  const transitions = Array.isArray(level.metadata.transitions)
    ? (level.metadata.transitions as readonly {
        readonly x: number;
        readonly entryDirection?: string;
      }[])
    : [];
  const runtime: LevelRuntime = {
    level,
    constants: water ? swimmingMovementConstants : initialMovementConstants,
    solid: (col, row) => {
      const tileId = spec.tiles[row]?.[col];
      const collision =
        tileId === undefined ? undefined : collisionByTileId.get(tileId);
      return collision !== undefined && solidKinds.has(collision);
    },
    downPipeCols: transitions
      .filter((transition) => (transition.entryDirection ?? "down") === "down")
      .map((transition) => transition.x),
    walkInCols: transitions
      .filter((transition) => transition.entryDirection === "right")
      .map((transition) => transition.x),
    goalCols: (() => {
      const cols = new Set<number>();
      for (const row of spec.tiles) {
        for (const [column, tileId] of row.entries()) {
          if (collisionByTileId.get(tileId) === TileCollisionKind.Goal) {
            cols.add(column);
          }
        }
      }
      return [...cols];
    })(),
    water,
  };
  runtimes.set(name, runtime);
  return runtime;
}

function pitAhead(runtime: LevelRuntime, col: number): boolean {
  for (const dx of [1, 2, 3, 4]) {
    const target = col + dx;
    if (target >= runtime.level.levelSpec.widthTiles) {
      continue;
    }
    let solid = false;
    for (
      let row = Math.floor(runtime.level.levelSpec.heightTiles / 2);
      row <= runtime.level.levelSpec.heightTiles;
      row += 1
    ) {
      if (runtime.solid(target, row)) {
        solid = true;
      }
    }
    if (!solid) {
      return true;
    }
  }
  return false;
}

type Checkpoint = {
  readonly state: SimulationState;
  readonly levelName: string;
};

function playLevel(
  startName: string,
  budgetSteps: number,
): {
  readonly finished: boolean;
  readonly maxX: number;
  readonly steps: number;
  readonly lastLevel: string;
  readonly lastX: number;
  readonly restarts: number;
} {
  let restarts = 0;
  let runtime = runtimeFor(startName);
  const initial = makeInitialSimulationStateWithPlayerVitality(
    nominalSixtyHertzFrameDurationMilliseconds,
    runtime.level.levelSpec,
    runtime.constants,
    { kind: PlayerVitalityKind.Fire },
  );
  if (!initial.ok) {
    throw new Error(`${startName} initial state invalid`);
  }
  let state = initial.value;
  let rng = makeRng(1);
  let seed = 1;
  const checkpoints: Checkpoint[] = [{ state, levelName: startName }];
  // The state as of entering the current level, with its full timer — the
  // recovery point for time-up deaths.
  let levelEntry: Checkpoint = { state, levelName: startName };
  // Monotone progress: the frontier of best-x checkpoints per level (only
  // recorded with a healthy timer). Deaths resume near the frontier instead
  // of discarding progress.
  const bestByLevel = new Map<
    string,
    { bestX: number; frontier: Checkpoint[] }
  >();
  const recordBest = (checkpoint: Checkpoint, x: number): void => {
    const timer = checkpoint.state.levelTimer.remainingFrames;
    if (timer !== undefined && timer < 3000) {
      return; // poisoned clock — not a useful resume point
    }
    const entry = bestByLevel.get(checkpoint.levelName) ?? {
      bestX: -1,
      frontier: [],
    };
    if (x > entry.bestX + 32) {
      entry.bestX = x;
      entry.frontier.push(checkpoint);
      if (entry.frontier.length > 30) {
        entry.frontier.shift();
      }
      bestByLevel.set(checkpoint.levelName, entry);
    }
  };
  const resumeFromFrontier = (timeUp: boolean): Checkpoint => {
    const entry = bestByLevel.get(runtime.level.name);
    if (entry === undefined || entry.frontier.length === 0) {
      return levelEntry;
    }
    // Time-ups resume from an early frontier point (more clock headroom);
    // ordinary deaths resume near the frontier's edge.
    const pool = timeUp
      ? entry.frontier.slice(
          0,
          Math.max(1, Math.ceil(entry.frontier.length / 3)),
        )
      : entry.frontier.slice(-8);
    return pool[Math.floor(rng() * pool.length)] ?? levelEntry;
  };
  let steps = 0;
  let maxX = 0;
  let jumpFramesLeft = 0;
  let downFramesLeft = 0;
  let idleFramesLeft = 0;
  // "Ground mode": a post-rollback stretch with jumping suppressed (except
  // over pits), so retries explore the low route instead of re-wedging on
  // elevated platforms.
  let groundModeFramesLeft = 0;
  let pendingWarp:
    | { readonly target: string; readonly x: number; readonly y: number }
    | undefined;

  let deathsSinceProgress = 0;
  let progressHighWater = 0;
  let stallX = 0;
  let stallSteps = 0;
  let swimTargetY = 6 * 16;

  // Shared reset after any rollback/re-entry: fresh seed, varied arrival
  // phase (hazard cycles are frame-locked), and a chance of ground mode.
  const resetExploration = (restore: Checkpoint): void => {
    state = restore.state;
    runtime = runtimeFor(restore.levelName);
    seed += 1;
    rng = makeRng(seed * 2654435761);
    jumpFramesLeft = 0;
    downFramesLeft = 0;
    idleFramesLeft = Math.floor(rng() * 100);
    groundModeFramesLeft = rng() < 0.5 ? 240 : 0;
    pendingWarp = undefined;
  };

  while (steps < budgetSteps) {
    steps += 1;
    const player = state.player;
    const col = Math.floor(
      (player.position.x + player.collider.width / 2) /
        runtime.level.levelSpec.tileSizePixels,
    );
    if (runtime.level.name === startName && player.position.x > maxX) {
      maxX = player.position.x;
    }
    const grounded =
      player.movement.vertical === VerticalMovementState.Grounded;

    // Controller policy.
    if (
      downFramesLeft === 0 &&
      grounded &&
      runtime.downPipeCols.includes(col)
    ) {
      // Stand on a known pipe entrance and press down (mostly — leave room
      // for exploration past a pipe the maze doesn't want).
      if (rng() < 0.85) {
        downFramesLeft = 30;
      } else {
        downFramesLeft = -45; // walk past it before reconsidering
      }
    } else if (
      downFramesLeft === 0 &&
      grounded &&
      jumpFramesLeft === 0 &&
      runtime.downPipeCols.some((x) => col >= x - 3 && col <= x - 1)
    ) {
      // Hop up onto an approaching pipe entrance instead of walking into it.
      jumpFramesLeft = 18 + Math.floor(rng() * 10);
    }
    if (downFramesLeft < 0) {
      downFramesLeft += 1;
    }
    const pressingDown = downFramesLeft > 0;
    if (pressingDown) {
      downFramesLeft -= 1;
      if (downFramesLeft === 0) {
        // The press didn't take (not actually on the mouth) — walk on a bit
        // before trying this column again.
        downFramesLeft = -60;
      }
    }

    if (groundModeFramesLeft > 0) {
      groundModeFramesLeft -= 1;
    }
    if (runtime.water) {
      // Weave around approaching frenzy cheeps; otherwise hold an altitude
      // band with an occasional random stroke.
      let evadeUp = false;
      let threatened = false;
      for (const cheep of liveFrenzyCheeps(state.cheepFrenzy)) {
        const dx = cheep.position.x - player.position.x;
        const dy = cheep.position.y - player.position.y;
        if (dx > -8 && dx < 56 && Math.abs(dy) < 28) {
          threatened = true;
          evadeUp = dy >= 0; // cheep level-or-below: stroke over it
        }
      }
      const playerRow = Math.floor(
        (player.position.y + player.collider.height / 2) /
          runtime.level.levelSpec.tileSizePixels,
      );
      const wallAhead =
        runtime.solid(col + 1, playerRow) || runtime.solid(col + 2, playerRow);
      jumpFramesLeft = wallAhead
        ? 5
        : threatened
          ? evadeUp
            ? 5
            : 0
          : player.position.y > swimTargetY || rng() < 0.08
            ? 4
            : Math.max(0, jumpFramesLeft - 1);
    } else if (jumpFramesLeft > 0) {
      jumpFramesLeft -= 1;
    } else if (runtime.walkInCols.some((x) => col >= x - 12 && col <= x + 1)) {
      // Approaching a walk-in mouth: stay on the ground and press into it.
      jumpFramesLeft = 0;
    } else if (runtime.goalCols.some((x) => col >= x - 16 && col <= x + 1)) {
      // Near the goal pole: short hops only — enough to climb the end
      // staircase, never enough to sail clean over the flagpole.
      if (grounded && rng() < 0.3) {
        jumpFramesLeft = 6 + Math.floor(rng() * 4);
      }
    } else if (grounded && pitAhead(runtime, col)) {
      jumpFramesLeft = 24 + Math.floor(rng() * 12);
    } else if (groundModeFramesLeft === 0 && rng() < 0.09) {
      jumpFramesLeft = 8 + Math.floor(rng() * 28);
    }

    if (idleFramesLeft > 0) {
      idleFramesLeft -= 1;
      jumpFramesLeft = 0;
    }
    const input = requireInput(
      idleFramesLeft > 0 || pressingDown
        ? HorizontalInput.Neutral
        : HorizontalInput.Right,
      jumpFramesLeft > 0,
      pressingDown,
    );
    state = stepSimulation(
      state,
      input,
      runtime.constants,
      runtime.level.levelSpec,
    );

    // Checkpoint every two seconds of sim time — but never a stalled state,
    // or the rollback ring fills with wedged positions.
    if (state.clock.frameIndex % 120 === 0 && stallSteps < 120) {
      const checkpoint = { state, levelName: runtime.level.name };
      checkpoints.push(checkpoint);
      if (checkpoints.length > 40) {
        checkpoints.shift();
      }
      recordBest(checkpoint, player.position.x);
    }

    const outcome = state.playerOutcome.kind;
    if (
      outcome === PlayerOutcomeKind.Finished ||
      outcome === PlayerOutcomeKind.DefeatedAndFinished
    ) {
      return {
        finished: true,
        maxX,
        steps,
        lastLevel: runtime.level.name,
        lastX: player.position.x,
        restarts,
      };
    }
    // A live stall (wedged on geometry with nothing lethal around) never
    // dies, so treat it like a death: roll back and explore differently.
    if (player.position.x > stallX + 8) {
      stallX = player.position.x;
      stallSteps = 0;
    } else {
      stallSteps += 1;
      if (stallSteps > 420) {
        stallSteps = 0;
        stallX = 0;
        const back =
          1 + Math.floor(rng() * Math.min(8, checkpoints.length - 1));
        const restore =
          checkpoints[Math.max(0, checkpoints.length - back)] ?? checkpoints[0];
        if (restore !== undefined) {
          checkpoints.length = Math.max(1, checkpoints.length - back);
          resetExploration(restore);
        }
        continue;
      }
    }
    if (outcome === PlayerOutcomeKind.Defeated) {
      // Running out of time can't be fixed by a short rollback — restart the
      // attempt with a fresh clock and a new exploration seed.
      const reason =
        "reason" in state.playerOutcome
          ? state.playerOutcome.reason
          : undefined;
      if (player.position.x > progressHighWater + 64) {
        progressHighWater = player.position.x;
        deathsSinceProgress = 0;
      } else {
        deathsSinceProgress += 1;
      }
      if (reason === PlayerDefeatReason.TimeUp || deathsSinceProgress > 50) {
        // Resume from the progress frontier (early points for time-ups) —
        // never throw deep progress away.
        deathsSinceProgress = 0;
        progressHighWater = 0;
        restarts += 1;
        const resume = resumeFromFrontier(reason === PlayerDefeatReason.TimeUp);
        checkpoints.length = 0;
        checkpoints.push(resume);
        resetExploration(resume);
        continue;
      }
      swimTargetY = (4 + Math.floor(rng() * 6)) * 16;
      // Roll back — progressively further the longer this spot resists.
      const reach = Math.min(
        6 + Math.floor(deathsSinceProgress / 5) * 4,
        checkpoints.length - 1,
      );
      const back = 1 + Math.floor(rng() * Math.max(1, reach));
      const restore =
        checkpoints[Math.max(0, checkpoints.length - back)] ?? checkpoints[0];
      if (restore === undefined) {
        return {
          finished: false,
          maxX,
          steps,
          lastLevel: runtime.level.name,
          lastX: state.player.position.x,
          restarts,
        };
      }
      checkpoints.length = Math.max(1, checkpoints.length - back);
      resetExploration(restore);
      continue;
    }

    // Follow pipe transfers across levels the way the shell does.
    const pipeEntry = state.pipeEntry;
    if (
      pipeEntry.phase === PipeEntryPhase.Entering &&
      pipeEntry.targetLevelName !== undefined &&
      pendingWarp === undefined
    ) {
      pendingWarp = {
        target: pipeEntry.targetLevelName,
        x: pipeEntry.targetTilePosition.x,
        y: pipeEntry.targetTilePosition.y,
      };
    }
    if (pendingWarp !== undefined && pipeEntry.phase === PipeEntryPhase.None) {
      const warp = pendingWarp;
      pendingWarp = undefined;
      if (pack.has(warp.target)) {
        runtime = runtimeFor(warp.target);
        const fresh = makeInitialSimulationStateWithPlayerVitality(
          nominalSixtyHertzFrameDurationMilliseconds,
          runtime.level.levelSpec,
          runtime.constants,
          { kind: PlayerVitalityKind.Fire },
        );
        if (!fresh.ok) {
          throw new Error(`${warp.target} initial state invalid`);
        }
        state = {
          ...fresh.value,
          player: teleportPlayerToTilePosition(
            fresh.value.player,
            { x: warp.x, y: warp.y } as Parameters<
              typeof teleportPlayerToTilePosition
            >[1],
            runtime.level.levelSpec,
          ),
        };
        levelEntry = { state, levelName: runtime.level.name };
        checkpoints.push(levelEntry);
      }
    }
  }
  return {
    finished: false,
    maxX,
    steps,
    lastLevel: runtime.level.name,
    lastX: state.player.position.x,
    restarts,
  };
}

describe("official-smb headless playthroughs", () => {
  const mains = (
    process.env.SMB_PLAY_ONLY?.split(",") ??
    [...pack.keys()].filter((name) => /^smb-\d+-\d+$/.test(name))
  ).sort();

  it("plays every main level to a finish against the real engine", () => {
    const failures: string[] = [];
    const budgetScale = Number(process.env.SMB_PLAY_BUDGET_SCALE ?? "1");
    for (const name of mains) {
      const budget = (name === "smb-8-4" ? 400_000 : 200_000) * budgetScale;
      const result = playLevel(name, budget);
      if (!result.finished) {
        failures.push(
          `${name} (maxX=${String(Math.round(result.maxX))} ended in ${result.lastLevel} at x=${String(Math.round(result.lastX))} after ${String(result.restarts)} restarts)`,
        );
      }
    }
    expect(failures, `not finished: ${failures.join(", ")}`).toEqual([]);
  }, 1_800_000);
});
