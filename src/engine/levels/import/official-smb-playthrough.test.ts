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
  computeFirebarOrbs,
  computePodobooPositions,
} from "../../simulation/flame-hazards";
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
  run = true,
): SimulationInputCommand {
  const result = makeSimulationInputCommand(
    horizontal,
    jump,
    run,
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
  readonly walkIns: readonly { readonly x: number; readonly y: number }[];
  readonly goalCols: readonly number[];
  readonly gateCols: readonly number[];
  readonly lowGates: readonly number[];
  readonly reachableGates: readonly {
    readonly col: number;
    readonly elevated: boolean;
  }[];
  readonly elevatedGates: readonly number[];
  readonly springCols: readonly number[];
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
        readonly y: number;
        readonly entryDirection?: string;
        readonly targetLevelName?: string;
        readonly targetTileX?: number;
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
      // The only down pipes a completion ever REQUIRES are forward self-warps
      // (maze bypasses). Bonus rooms and warp zones are optional side content
      // that just burns the clock — and backward self-warps are maze traps.
      .filter(
        (transition) =>
          transition.targetLevelName === name &&
          typeof transition.targetTileX === "number" &&
          transition.targetTileX > transition.x,
      )
      .map((transition) => transition.x),
    walkIns: transitions
      .filter((transition) => transition.entryDirection === "right")
      .map((transition) => ({ x: transition.x, y: transition.y })),
    // Any reachable gate must be crossed standing; elevated ones also need
    // a climbing approach and low ones a grounded (descending) approach.
    gateCols: spec.loopZones
      .filter((zone) => zone.requiredRowMin < spec.heightTiles)
      .map((zone) => zone.checkTileX),
    lowGates: spec.loopZones
      .filter(
        (zone) =>
          zone.requiredRowMin >= 9 && zone.requiredRowMin < spec.heightTiles,
      )
      .map((zone) => zone.checkTileX),
    reachableGates: spec.loopZones
      .filter((zone) => zone.requiredRowMin < spec.heightTiles)
      .map((zone) => ({
        col: zone.checkTileX,
        elevated: zone.requiredRowMax < 9,
      }))
      .sort((a, b) => a.col - b.col),
    elevatedGates: spec.loopZones
      .filter((zone) => zone.requiredRowMax < 9)
      .map((zone) => zone.checkTileX),
    springCols: (() => {
      const cols = new Set<number>();
      for (const row of spec.tiles) {
        for (const [column, tileId] of row.entries()) {
          if (collisionByTileId.get(tileId) === TileCollisionKind.Spring) {
            cols.add(column);
          }
        }
      }
      return [...cols];
    })(),
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

function columnHasFooting(runtime: LevelRuntime, col: number): boolean {
  if (col >= runtime.level.levelSpec.widthTiles) {
    return true; // level edge, not a pit
  }
  for (
    let row = Math.floor(runtime.level.levelSpec.heightTiles / 2);
    row <= runtime.level.levelSpec.heightTiles;
    row += 1
  ) {
    if (runtime.solid(col, row)) {
      return true;
    }
  }
  return false;
}

// Width of the pit starting within the next 3 columns (0 = no pit ahead).
function pitWidthAhead(runtime: LevelRuntime, col: number): number {
  for (const dx of [1, 2, 3]) {
    if (!columnHasFooting(runtime, col + dx)) {
      let width = 0;
      while (
        !columnHasFooting(runtime, col + dx + width) &&
        col + dx + width < runtime.level.levelSpec.widthTiles
      ) {
        width += 1;
      }
      return width;
    }
  }
  return 0;
}

function pitAhead(runtime: LevelRuntime, col: number): boolean {
  return pitWidthAhead(runtime, col) > 0;
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
  const baseSeed = Number(process.env.SMB_PLAY_SEED ?? "1");
  let rng = makeRng(baseSeed);
  let seed = baseSeed;
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
    if (checkpoint.state.players[0].player.position.y < 40) {
      return; // on the roof above the ceiling — a dead-end route
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
    // Pipe-gated mazes: the frontier often sits past an un-taken mandatory
    // pipe; resume early so the pipe approach is retried.
    const pipeGated = runtime.level.levelSpec.loopZones.some(
      (zone) => zone.requiredRowMin >= runtime.level.levelSpec.heightTiles,
    );
    if (pipeGated) {
      timeUp = true;
    }
    // Time-ups resume from an early frontier point (more clock headroom);
    // ordinary deaths resume near the frontier's edge.
    const pool = timeUp
      ? entry.frontier.slice(
          0,
          Math.max(1, Math.ceil(entry.frontier.length / 3)),
        )
      : rng() < 0.3
        ? entry.frontier
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
  // Pocket escape: when progress stalls, briefly walk BACK, then commit a
  // running jump — the way a player leaves a dead-end underpass (e.g. 1-2's
  // wall pockets) that pure forward bouncing can't escape.
  let backoffFramesLeft = 0;
  let swimTargetY = 6 * 16;
  let loopBacks = 0;
  let previousX = 0;
  // Scripted pipe mount: straight-up jump beside the mouth, then a nudge
  // onto it (frames > 13: rise; frames 1-13: nudge right).
  let mountFramesLeft = 0;
  // "Sky mode": an attempt that favors the high route from the start —
  // elevated loop gates need it.
  let skyMode = false;

  // Shared reset after any rollback/re-entry: fresh seed, varied arrival
  // phase (hazard cycles are frame-locked), and a chance of ground mode.
  const resetExploration = (restore: Checkpoint): void => {
    state = restore.state;
    previousX = restore.state.players[0].player.position.x;
    runtime = runtimeFor(restore.levelName);
    seed += 1;
    rng = makeRng(seed * 2654435761);
    jumpFramesLeft = 0;
    downFramesLeft = 0;
    backoffFramesLeft = 0;
    idleFramesLeft = Math.floor(rng() * 100);
    groundModeFramesLeft = rng() < 0.5 ? 240 : 0;
    // Re-roll the route bias too: some sections (1-2's brick staircases over
    // walled underpass pockets) are only passable via the high route, and a
    // persistent ground bias would retry the same dead end forever.
    skyMode = rng() < 0.5;
    pendingWarp = undefined;
  };

  while (steps < budgetSteps) {
    steps += 1;
    const player = state.players[0].player;
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
    const nearDownPipe = runtime.downPipeCols.some(
      (x) => col >= x - 6 && col <= x + 1,
    );
    if (
      mountFramesLeft === 0 &&
      downFramesLeft === 0 &&
      grounded &&
      jumpFramesLeft === 0 &&
      runtime.downPipeCols.some((x) => col === x - 1) &&
      runtime.solid(col + 1, Math.floor(player.position.y / 16) + 1)
    ) {
      // Flush beside a solid pipe: mount it with a straight-up jump.
      mountFramesLeft = 30;
    } else if (
      downFramesLeft === 0 &&
      grounded &&
      runtime.downPipeCols.includes(col)
    ) {
      // Stand on a known pipe entrance and press down (mostly — leave room
      // for exploration past a pipe the maze doesn't want).
      // In a pipe-gated maze (loop zones no route can pass) the pipes are
      // mandatory; elsewhere leave a little room for exploration.
      const mandatory = runtime.level.levelSpec.loopZones.some(
        (zone) => zone.requiredRowMin >= runtime.level.levelSpec.heightTiles,
      );
      if (mandatory || rng() < 0.9) {
        downFramesLeft = 40;
      } else {
        downFramesLeft = -45; // walk past it before reconsidering
      }
    } else if (
      downFramesLeft === 0 &&
      grounded &&
      jumpFramesLeft === 0 &&
      runtime.downPipeCols.some((x) => col >= x - 3 && col <= x - 1)
    ) {
      // Hop up onto an approaching pipe entrance instead of walking into
      // it — pipe heights vary, so vary the hop.
      jumpFramesLeft = 10 + Math.floor(rng() * 22);
    } else if (nearDownPipe && jumpFramesLeft > 28) {
      // Don't sail clean over the pipe with a long bounce.
      jumpFramesLeft = 12;
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
    // A loop-zone rejection teleports the player backward without a death;
    // after a few cycles, restart the level with a different route bias.
    if (
      previousX - player.position.x > 48 &&
      pendingWarp === undefined &&
      state.pipeEntry.phase === PipeEntryPhase.None
    ) {
      loopBacks += 1;
      // Pipe-gated mazes (8-4) loop back by design until the right pipe is
      // taken — keep cycling there instead of restarting.
      const pipeGated = runtime.level.levelSpec.loopZones.some(
        (zone) => zone.requiredRowMin >= runtime.level.levelSpec.heightTiles,
      );
      if (!pipeGated && loopBacks >= 3) {
        loopBacks = 0;
        restarts += 1;
        checkpoints.length = 0;
        checkpoints.push(levelEntry);
        resetExploration(levelEntry);
        skyMode = rng() < 0.6;
        previousX = 0;
        continue;
      }
    }
    previousX = player.position.x;
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
      const inWalkInZone = runtime.walkIns.some(
        (mouth) => col >= mouth.x - 4 && col <= mouth.x + 1,
      );
      const wallAhead =
        !inWalkInZone &&
        (runtime.solid(col + 1, playerRow) ||
          runtime.solid(col + 2, playerRow));
      // At a walk-in mouth, sink onto its row and press into it; elsewhere a
      // wall ahead means stroke over it.
      jumpFramesLeft = inWalkInZone
        ? 0
        : wallAhead
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
    } else if (
      runtime.walkIns.some((mouth) => col >= mouth.x - 12 && col <= mouth.x + 1)
    ) {
      // Approaching a walk-in mouth: no long jumps (they sail over it).
      // A mouth ABOVE the current walking line sits on a step — short hops
      // mount it; a mouth at the walking line just gets walked into.
      const playerRow = Math.floor(
        (player.position.y + player.collider.height / 2) /
          runtime.level.levelSpec.tileSizePixels,
      );
      const raisedMouth = runtime.walkIns.some(
        (mouth) =>
          col >= mouth.x - 12 && col <= mouth.x + 1 && mouth.y < playerRow,
      );
      if (!raisedMouth) {
        jumpFramesLeft = 0;
      } else if (jumpFramesLeft > 10) {
        jumpFramesLeft = 10;
      } else if (grounded && jumpFramesLeft === 0 && rng() < 0.25) {
        jumpFramesLeft = 6 + Math.floor(rng() * 5);
      }
    } else if (runtime.springCols.some((x) => Math.abs(col - x) <= 1)) {
      // On a springboard: hold the jump through the entire launch — the big
      // bounce needs the held-jump gravity, exactly like holding A.
      jumpFramesLeft = 50;
    } else if (runtime.goalCols.some((x) => col >= x - 16 && col <= x + 1)) {
      // Near the goal pole: short hops climb the end staircase without
      // sailing over the flagpole; pits still get a committed medium jump.
      if (grounded && pitAhead(runtime, col)) {
        const width = pitWidthAhead(runtime, col);
        jumpFramesLeft = Math.max(8, Math.min(22, width * 4));
      } else if (grounded && rng() < 0.3) {
        jumpFramesLeft = 6 + Math.floor(rng() * 4);
      }
    } else if (
      !nearDownPipe &&
      runtime.gateCols.some((x) => col >= x - 8 && col <= x + 1) &&
      !(grounded && pitAhead(runtime, col))
    ) {
      // Loop gates require STANDING at the correct height when crossing —
      // never jump through the gate column itself (unless a pit demands it).
      jumpFramesLeft = 0;
    } else if (grounded && pitAhead(runtime, col)) {
      // Pits outrank all route biases. Match the hold to the measured gap
      // (short hops land 1-wide islands; full holds clear wide lava), with
      // a little jitter for retry diversity.
      const width = pitWidthAhead(runtime, col);
      jumpFramesLeft = Math.max(
        8,
        Math.min(38, width * 4 + Math.floor(rng() * 7) - 3),
      );
    } else if (
      !nearDownPipe &&
      runtime.reachableGates.some(
        (gate) => gate.elevated && col >= gate.col - 18 && col <= gate.col - 9,
      )
    ) {
      // The next gate needs an elevated standing crossing: climb hard.
      if (grounded && jumpFramesLeft === 0 && rng() < 0.5) {
        jumpFramesLeft = 16 + Math.floor(rng() * 20);
      }
    } else if (
      !nearDownPipe &&
      runtime.reachableGates.some(
        (gate) => !gate.elevated && col >= gate.col - 18 && col <= gate.col - 9,
      )
    ) {
      // The next gate needs a low standing crossing: stay grounded so gaps
      // drop the player onto the low route.
      jumpFramesLeft = 0;
    } else if (skyMode && grounded && jumpFramesLeft === 0 && rng() < 0.6) {
      // Favor the high route: climb whatever is above.
      jumpFramesLeft = 16 + Math.floor(rng() * 20);
    } else if (groundModeFramesLeft === 0 && rng() < 0.09) {
      jumpFramesLeft = 8 + Math.floor(rng() * 28);
    }

    // Bowser flames and cannon shots fly in as timed projectiles — hop over
    // one approaching at head height.
    if (!runtime.water && grounded && jumpFramesLeft === 0) {
      for (const projectile of state.timedHazardProjectiles.projectiles) {
        const dx = projectile.position.x - player.position.x;
        const dy = projectile.position.y - player.position.y;
        if (dx > -8 && dx < 80 && Math.abs(dy) < 26) {
          jumpFramesLeft = 20;
          break;
        }
      }
    }
    // Flame hazards are pure functions of the frame — wait out a bar or a
    // podoboo that is currently sweeping the path ahead.
    if (
      idleFramesLeft === 0 &&
      !runtime.water &&
      (runtime.level.levelSpec.firebars.length > 0 ||
        runtime.level.levelSpec.podoboos.length > 0)
    ) {
      const hazards = [
        ...computeFirebarOrbs(runtime.level.levelSpec, state.clock.frameIndex),
        ...computePodobooPositions(
          runtime.level.levelSpec,
          state.clock.frameIndex,
        ),
      ];
      for (const orb of hazards) {
        const dx = orb.x - player.position.x;
        const dy = orb.y - player.position.y;
        if (dx > -4 && dx < 44 && Math.abs(dy) < 40) {
          idleFramesLeft = 8;
          break;
        }
      }
    }
    if (idleFramesLeft > 0) {
      idleFramesLeft -= 1;
      jumpFramesLeft = 0;
    }
    // In a mandatory-pipe maze, walk flush into the pipe side (never hop
    // around it) so the scripted mount can trigger from the ground.
    if (
      mountFramesLeft === 0 &&
      runtime.level.levelSpec.loopZones.some(
        (zone) => zone.requiredRowMin >= runtime.level.levelSpec.heightTiles,
      ) &&
      runtime.downPipeCols.some((x) => col >= x - 4 && col <= x - 1)
    ) {
      jumpFramesLeft = 0;
    }
    let horizontal =
      idleFramesLeft > 0 || pressingDown
        ? HorizontalInput.Neutral
        : HorizontalInput.Right;
    if (backoffFramesLeft > 0) {
      backoffFramesLeft -= 1;
      horizontal = HorizontalInput.Left;
      jumpFramesLeft = 0;
      if (backoffFramesLeft === 0) {
        // Turn around with a committed running jump over whatever wedged us.
        jumpFramesLeft = 22 + Math.floor(rng() * 14);
      }
    }
    let jumpHeld = jumpFramesLeft > 0;
    if (mountFramesLeft > 0) {
      horizontal =
        mountFramesLeft > 13 ? HorizontalInput.Neutral : HorizontalInput.Right;
      jumpHeld = mountFramesLeft > 13;
      mountFramesLeft -= 1;
    }
    const input = requireInput(
      horizontal,
      jumpHeld,
      pressingDown,
      !nearDownPipe,
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

    const outcome = state.players[0].outcome.kind;
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
    // Roof-walking above the ceiling is a dead end — count it as stalling.
    if (player.position.x > stallX + 8 && player.position.y >= 40) {
      stallX = player.position.x;
      stallSteps = 0;
    } else {
      stallSteps += 1;
      // Halfway through a stall, try backing out and leaping before giving
      // up and rolling back to a checkpoint.
      if (
        (stallSteps === 150 || stallSteps === 300) &&
        backoffFramesLeft === 0
      ) {
        backoffFramesLeft = 30 + Math.floor(rng() * 30);
        // Alternate the recovery: half the time, follow the backoff with a
        // flat no-jump walk — one-tile crawls and low corridors are passed by
        // walking, and a jump-biased retry bonks forever at their mouths.
        if (rng() < 0.5) {
          groundModeFramesLeft = 240;
        }
      }
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
        "reason" in state.players[0].outcome
          ? state.players[0].outcome.reason
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
          lastX: state.players[0].player.position.x,
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
          players: [
            {
              ...fresh.value.players[0],
              player: teleportPlayerToTilePosition(
                fresh.value.players[0].player,
                { x: warp.x, y: warp.y } as Parameters<
                  typeof teleportPlayerToTilePosition
                >[1],
                runtime.level.levelSpec,
              ),
            },
            ...fresh.value.players.slice(1),
          ] as (typeof fresh.value)["players"],
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
    lastX: state.players[0].player.position.x,
    restarts,
  };
}

describe("official-smb headless playthroughs", () => {
  // The exhaustive sweeps are long verification runs; the default suite plays a
  // representative smoke set end-to-end: the overworld classic, the intro-strip
  // -> underground -> exit chain, and a firebar castle. Env overrides:
  //   SMB_PLAY_ONLY=a,b,c  — play exactly these start levels
  //   SMB_PLAY_ALL=1       — every one of the 54 pack levels (mains + warp and
  //                          bonus sub-areas), each played from its own start
  //   SMB_PLAY_FULL=1      — the 36 classic main levels
  //   SMB_PLAY_BUDGET_SCALE=6+  — more steps per level for the deep mazes
  // 1-3 is driven directly rather than via the 1-2 vestibule chain: the
  // chained run doubles the length and its RNG stream re-rolls on any
  // physics/data change, making it the flakiest smoke by far (the vestibule
  // transition itself is covered by the browser journeys).
  const smokeSet = ["smb-1-1", "smb-1-3", "smb-1-5"];
  const mains = (
    process.env.SMB_PLAY_ONLY?.split(",") ??
    (process.env.SMB_PLAY_ALL !== undefined
      ? [...pack.keys()]
      : process.env.SMB_PLAY_FULL !== undefined
        ? [...pack.keys()].filter((name) => /^smb-\d+-\d+$/.test(name))
        : smokeSet)
  ).sort();

  it("plays every selected level to a finish against the real engine", () => {
    const failures: string[] = [];
    const budgetScale = Number(process.env.SMB_PLAY_BUDGET_SCALE ?? "3");
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
