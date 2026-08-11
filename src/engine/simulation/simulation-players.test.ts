import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../domain/level-spec";
import {
  makeFlatLevelInput,
  requireMechanicsLevelSpec,
} from "./mechanics-test-support";
import { finishRouteLevelInput } from "../levels/finish-route-level";
import { powerUpRouteLevelInput } from "../levels/power-up-route-level";
import { firstAuthoredLevelSpec } from "./level-test-support";
import { PipeEntryPhase } from "./pipe-state";
import { PlayerOutcomeKind } from "./player-outcome";
import { HorizontalInput, type SimulationInputCommand } from "./input-command";
import { initialMovementConstants } from "./movement-model";
import {
  makeInitialPlayerVitalityState,
  makePoweredPlayerVitalityState,
  PlayerVitalityKind,
} from "./player-vitality";
import {
  appendSimulationPlayerAt,
  makeInitialSimulationState,
  makeInitialSimulationStateWithPlayerVitality,
  maxSimulationPlayers,
  reviveSimulationPlayerAt,
  type SimulationState,
} from "./simulation-state";
import { stepSimulation } from "./step-simulation";
import {
  nominalSixtyHertzFrameDurationMilliseconds,
  requireSimulationPixelPosition,
} from "./simulation-units";

function initialState(): SimulationState {
  const result = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    firstAuthoredLevelSpec(),
    initialMovementConstants,
  );
  if (!result.ok) {
    throw new Error("expected a valid initial simulation state");
  }
  return result.value;
}

function runRight(): SimulationInputCommand {
  return {
    horizontal: HorizontalInput.Right,
    jumpPressed: true,
    runHeld: false,
    firePressed: false,
    upHeld: false,
    downHeld: false,
  };
}

function twoPlayerState(): SimulationState {
  const result = makeInitialSimulationStateWithPlayerVitality(
    nominalSixtyHertzFrameDurationMilliseconds,
    firstAuthoredLevelSpec(),
    initialMovementConstants,
    makeInitialPlayerVitalityState(),
    2,
  );
  if (!result.ok) {
    throw new Error("expected a valid two-player state");
  }
  return result.value;
}

function neutral(): SimulationInputCommand {
  return {
    horizontal: HorizontalInput.Neutral,
    jumpPressed: false,
    runHeld: false,
    firePressed: false,
    upHeld: false,
    downHeld: false,
  };
}

// One step of a hazard fixture per tier: a big co-op player shrinks into the
// blinking recovery window and stays active; a small one is defeated.
function expectTieredCoopHazardDamage(
  makeStateWithCoopVitality: (
    vitality: SimulationState["players"][number]["vitality"],
  ) => SimulationState,
  level: ReturnType<typeof firstAuthoredLevelSpec>,
): void {
  const shrunk = stepSimulation(
    makeStateWithCoopVitality(makePoweredPlayerVitalityState()),
    neutral(),
    initialMovementConstants,
    level,
    [neutral()],
  );
  expect(shrunk.players[1]!.vitality.kind).toBe(PlayerVitalityKind.Recovering);
  expect(shrunk.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Active);

  const killed = stepSimulation(
    makeStateWithCoopVitality(makeInitialPlayerVitalityState()),
    neutral(),
    initialMovementConstants,
    level,
    [neutral()],
  );
  expect(killed.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Defeated);
}

// Return a copy of `base` with its single co-op player's vitality replaced.
function withCoopVitality(
  base: SimulationState,
  vitality: SimulationState["players"][number]["vitality"],
): SimulationState {
  return {
    ...base,
    players: [
      base.players[0],
      { ...base.players[1]!, vitality },
    ] as SimulationState["players"],
  };
}

function expectCoopPlayerDefeatedAt(x: number, y: number): void {
  const base = afterSpawnInvincibility(twoPlayerState());
  const stepped = stepSimulation(
    withCoopPlayerAt(base, x, y),
    neutral(),
    initialMovementConstants,
    firstAuthoredLevelSpec(),
    [neutral()],
  );
  expect(stepped.players).toHaveLength(2);
  expect(stepped.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Defeated);
}

// The uniform players array is the sole player store: players[0] is player one,
// players[1..] the same-screen co-op players.
describe("simulation players array", () => {
  // Time ran out for slot 0 alone. The level clock was only read on the primary
  // player's path, so when it expired the creator died and every co-op member
  // played on for ever — which is how a party stuck in World 1-1's staircase
  // notch was still alive at frame 15,993, long past a 400-unit timer, unable
  // to finish the run and unable to end it.
  it("defeats every player when the level clock runs out, not only slot 0", () => {
    const result = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      3,
    );
    if (!result.ok) {
      throw new Error("expected a valid initial simulation state");
    }
    // One frame from expiry, so the next step is the one that runs it out.
    const state: SimulationState = {
      ...result.value,
      levelTimer: { ...result.value.levelTimer, remainingFrames: 1 },
    } as SimulationState;

    const stepped = stepSimulation(
      state,
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral(), neutral()],
    );

    expect(
      stepped.players.map((runtime) => runtime.outcome.kind),
      "the whole party is out of time, not just the creator",
    ).toEqual([
      PlayerOutcomeKind.Defeated,
      PlayerOutcomeKind.Defeated,
      PlayerOutcomeKind.Defeated,
    ]);
  });

  it("supports up to sixteen players", () => {
    expect(maxSimulationPlayers).toBe(16);
  });

  it("appends a joining player at an authoritative in-screen position", () => {
    const base = twoPlayerState();
    const spawnPosition = {
      x: requireSimulationPixelPosition(120, "spawn.x"),
      y: requireSimulationPixelPosition(64, "spawn.y"),
    };
    const joined = appendSimulationPlayerAt(base, spawnPosition);
    expect(joined.players).toHaveLength(3);
    expect(joined.players[2]!.player.position).toEqual(spawnPosition);
  });

  it("revives a retained slot at an authoritative checkpoint without resetting the world", () => {
    const base = twoPlayerState();
    const checkpoint = {
      x: requireSimulationPixelPosition(192, "checkpoint.x"),
      y: requireSimulationPixelPosition(64, "checkpoint.y"),
    };
    const defeated = {
      ...base,
      players: [
        base.players[0],
        {
          ...base.players[1]!,
          outcome: { kind: "defeated", reason: "pit-contact" },
        },
      ] as SimulationState["players"],
    };
    const revived = reviveSimulationPlayerAt(defeated, 1, checkpoint);
    expect(revived.players[0]).toBe(defeated.players[0]);
    expect(revived.players[1]!.player.position).toEqual(checkpoint);
    expect(revived.players[1]!.outcome).toEqual({ kind: "active" });
  });

  it("seeds additional co-op players beside the primary from the player count", () => {
    const result = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      3,
    );
    if (!result.ok) {
      throw new Error("expected a valid initial state");
    }
    const state = result.value;
    expect(state.players).toHaveLength(3);
    // Each additional player spawns further right than the one before it.
    expect(state.players[1]!.player.position.x).toBeGreaterThan(
      state.players[0].player.position.x,
    );
    expect(state.players[2]!.player.position.x).toBeGreaterThan(
      state.players[1]!.player.position.x,
    );
  });

  it("clamps the player count to sixteen", () => {
    const result = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      firstAuthoredLevelSpec(),
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      100,
    );
    if (!result.ok) {
      throw new Error("expected a valid initial state");
    }
    expect(result.value.players).toHaveLength(maxSimulationPlayers);
  });

  it("has a single full-runtime player at the initial state", () => {
    const state = initialState();
    expect(state.players).toHaveLength(1);
    const runtime = state.players[0];
    expect(runtime.player).toBeDefined();
    expect(runtime.vitality).toBeDefined();
    expect(runtime.invincibility).toBeDefined();
    expect(runtime.outcome).toBeDefined();
    expect(runtime.reaction).toBeDefined();
  });

  it("advances the primary player each step", () => {
    const before = initialState();
    const after = stepSimulation(
      before,
      runRight(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
    );
    expect(after.players).toHaveLength(1);
    expect(after.players[0].player).not.toBe(before.players[0].player);
  });

  it("steps a co-op player with its own input, leaving a non-overlapping primary untouched", () => {
    const base = initialState();
    // Seed a co-op player at its own (non-overlapping) spawn beside the primary.
    const withCoop = twoPlayerState();

    const solo = stepSimulation(
      base,
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
    );
    const coop = stepSimulation(
      withCoop,
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral()],
    );

    // With the players apart, the primary is identical whether or not co-op
    // players are present.
    expect(coop.players[0].player).toEqual(solo.players[0].player);
    // The uniform array now holds both players.
    expect(coop.players).toHaveLength(2);
  });

  it("keeps a pit-defeated co-op player in a stable spectator slot", () => {
    const base = afterSpawnInvincibility(twoPlayerState());
    expectCoopPlayerDefeatedAt(
      Number(base.players[1]!.player.position.x),
      10000,
    );
  });

  it("keeps an enemy-defeated co-op player in a stable spectator slot", () => {
    // firstAuthored has an enemy (beetle-1) at pixel (96, 64). Stand level with
    // it, in its walking path: the resulting side contact is a FRESH touch,
    // which damages. (Teleporting a player straight inside an enemy is not a
    // fresh touch — co-op damage fires on the contact edge, the same
    // no-second-hit-without-separation rule the primary's debounce encodes, so
    // a body already overlapping at spawn is not insta-killed.)
    const base = afterSpawnInvincibility(twoPlayerState());
    let current = withCoopPlayerAt(base, 72, 64);
    for (
      let frame = 0;
      frame < 300 &&
      current.players[1]!.outcome.kind === PlayerOutcomeKind.Active;
      frame += 1
    ) {
      current = stepSimulation(
        current,
        neutral(),
        initialMovementConstants,
        firstAuthoredLevelSpec(),
        [neutral()],
      );
    }
    expect(current.players).toHaveLength(2);
    expect(current.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Defeated);
  });

  // Damage used to be a flat kill for co-op players: a Fire co-op member died
  // to a walker's touch that would merely have shrunk the host. Co-op damage
  // now carries the primary's tiering — big shrinks into the blinking recovery
  // window, small dies.
  it("shrinks a big co-op player on enemy contact instead of defeating them", () => {
    const base = afterSpawnInvincibility(twoPlayerState());
    let current = withCoopVitality(
      withCoopPlayerAt(base, 72, 64),
      makePoweredPlayerVitalityState(),
    );
    for (
      let frame = 0;
      frame < 300 &&
      current.players[1]!.vitality.kind === PlayerVitalityKind.Powered;
      frame += 1
    ) {
      current = stepSimulation(
        current,
        neutral(),
        initialMovementConstants,
        firstAuthoredLevelSpec(),
        [neutral()],
      );
    }
    expect(current.players[1]!.vitality.kind).toBe(
      PlayerVitalityKind.Recovering,
    );
    expect(current.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Active);

    // Away from every enemy, the recovery window expires back to small — the
    // same countdown the primary runs.
    let recovering = withCoopPlayerAt(current, 200, 64);
    for (
      let frame = 0;
      frame < 300 &&
      recovering.players[1]!.vitality.kind === PlayerVitalityKind.Recovering;
      frame += 1
    ) {
      recovering = stepSimulation(
        recovering,
        neutral(),
        initialMovementConstants,
        firstAuthoredLevelSpec(),
        [neutral()],
      );
    }
    expect(recovering.players[1]!.vitality.kind).toBe(PlayerVitalityKind.Small);
    expect(recovering.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Active);
  });

  it("protects a starred co-op player from enemy contact", () => {
    const base = afterSpawnInvincibility(twoPlayerState());
    const positioned = withCoopPlayerAt(base, 72, 64);
    const coop = positioned.players[1]!;
    const starred: SimulationState = {
      ...positioned,
      players: [
        positioned.players[0],
        {
          ...coop,
          invincibility: {
            ...coop.invincibility,
            remainingFrames:
              600 as SimulationState["players"][number]["invincibility"]["remainingFrames"],
          },
        },
      ],
    };
    let current = starred;
    for (let frame = 0; frame < 120; frame += 1) {
      current = stepSimulation(
        current,
        neutral(),
        initialMovementConstants,
        firstAuthoredLevelSpec(),
        [neutral()],
      );
    }
    // The star kills the beetle on touch and the co-op player plays on.
    expect(current.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Active);
    expect(current.enemies.defeatedEnemyEntityIds).toContain("beetle-1");
  });

  it("tiers co-op hazard damage: big shrinks, small dies", () => {
    // firstAuthored has a thorn hazard tile at pixels (80..96, 64..80).
    const base = afterSpawnInvincibility(twoPlayerState());
    expectTieredCoopHazardDamage(
      (vitality) => withCoopVitality(withCoopPlayerAt(base, 80, 64), vitality),
      firstAuthoredLevelSpec(),
    );
  });

  // A finish through a co-op grab pays like any finish. The primary path's
  // scoring keys off its own outcome edge, so a co-op player reaching the flag
  // used to end the level with zero time bonus and zero grab-height score.
  it("awards the time bonus and grab-height score when a co-op player finishes", () => {
    const levelResult = makeLevelSpec(finishRouteLevelInput);
    if (!levelResult.ok) {
      throw new Error("expected the finish route to validate");
    }
    const level = levelResult.value;
    const result = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      level,
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      2,
    );
    if (!result.ok) {
      throw new Error("expected a valid finish-route state");
    }
    // The fixture has no authored timer, so give the run a live clock: the
    // bonus converts whatever remains of it.
    const base: SimulationState = {
      ...afterSpawnInvincibility(result.value),
      levelTimer: {
        ...result.value.levelTimer,
        remainingFrames: 3600,
      } as SimulationState["levelTimer"],
    };
    // The flagpole column spans pixels 128..144; stand the co-op player's box
    // into it while the primary idles at the start.
    const stepped = stepSimulation(
      withCoopPlayerAt(base, 120, 64),
      neutral(),
      initialMovementConstants,
      level,
      [neutral()],
    );
    expect(stepped.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Finished);
    expect(stepped.players[0].outcome.kind).toBe(PlayerOutcomeKind.Finished);
    expect(Number(stepped.timeBonusScore)).toBeGreaterThan(0);
    expect(Number(stepped.goalHeightScore)).toBeGreaterThan(0);
  });

  // The screen is shared and cross-level pipes already move everyone, so a
  // completed same-level warp carries the whole party too — whoever entered.
  it("a completed warp carries the whole party to the target tile", () => {
    const base = afterSpawnInvincibility(twoPlayerState());
    const entering: SimulationState = {
      ...base,
      pipeEntry: {
        phase: PipeEntryPhase.Entering,
        pipeEntityId: "pipe-1",
        // The CO-OP player is the one riding the entry animation.
        enteringPlayerSlot: 1,
        sourceLevelName: undefined,
        targetLevelName: undefined,
        targetTilePosition: { x: 10, y: 3 },
        remainingFrames: 1,
      } as SimulationState["pipeEntry"],
    };
    const stepped = stepSimulation(
      entering,
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral()],
    );
    // Both players arrive at the target column (solid player collision may
    // separate the overlapping arrivals by a few pixels).
    expect(
      Math.abs(Number(stepped.players[0].player.position.x) - 160),
    ).toBeLessThan(16);
    expect(
      Math.abs(Number(stepped.players[1]!.player.position.x) - 160),
    ).toBeLessThan(16);
  });

  // Castle maze checkpoints follow the party's leader; a failed crossing sends
  // the WHOLE party back rather than checking (and moving) slot 0 alone.
  it("loops the whole party back when the leading co-op player fails a checkpoint", () => {
    const level = requireMechanicsLevelSpec(
      makeFlatLevelInput(160, {
        loopZones: [
          {
            loopZoneId: "loop-0",
            checkTileX: 80,
            // Unreachable rows: any grounded crossing fails and loops.
            requiredRowMin: 5,
            requiredRowMax: 6,
            groupId: "group-0",
            groupSize: 1,
          },
        ],
      }),
    );
    const result = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      level,
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      2,
    );
    if (!result.ok) {
      throw new Error("expected a valid loop-zone state");
    }
    const base = afterSpawnInvincibility(result.value);
    // The primary idles near the start; the co-op player leads, standing just
    // short of the checkpoint column (tile 80) on the ground.
    let current = withCoopPlayerAt(base, 80 * 16 - 24, 192);
    let looped = false;
    for (let frame = 0; frame < 180 && !looped; frame += 1) {
      current = stepSimulation(
        current,
        neutral(),
        initialMovementConstants,
        level,
        [runRight()],
      );
      looped = Number(current.players[1]!.player.position.x) < 80 * 16 - 400;
    }
    expect(looped, "the leading co-op player should loop back").toBe(true);
    // The primary went back with them, clamped to the minimum return position.
    expect(Number(current.players[0].player.position.x)).toBe(32);
  });

  // Castle flame hazards used to exist only for slot 0: a firebar swept clean
  // through every co-op player. They now damage each player with the same
  // tiering as any hazard.
  it("tiers co-op firebar damage: big shrinks, small dies", () => {
    const level = requireMechanicsLevelSpec(
      makeFlatLevelInput(16, {
        firebars: [
          {
            firebarId: "bar-1",
            x: 4,
            y: 8,
            orbCount: 6,
            direction: "clockwise",
            speed: "slow",
          },
        ],
      }),
    );
    const result = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      level,
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      2,
    );
    if (!result.ok) {
      throw new Error("expected a valid firebar state");
    }
    // The base orb never leaves the anchor block (~68–76, 132–140); a player
    // overlapping it touches the firebar at any rotation frame.
    const base = afterSpawnInvincibility(result.value);
    expectTieredCoopHazardDamage(
      (vitality) => withCoopVitality(withCoopPlayerAt(base, 66, 126), vitality),
      level,
    );
  });

  // Co-op players used to pass straight through enemies: enemy interaction ran
  // for slot 0 only, so the identical player state stomping the identical enemy
  // defeated it from slot 0 and did nothing from any other slot. Everyone but
  // the host was unable to stomp anything.
  it("lets a co-op player stomp an enemy, and rebounds them off it", () => {
    const base = afterSpawnInvincibility(twoPlayerState());
    const stepped = stepSimulation(
      withCoopPlayerAt(base, 96, 56),
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral()],
    );

    expect(stepped.enemies.defeatedEnemyEntityIds).toContain("beetle-1");
    // Stomping is not dying: the stomper stays in play...
    expect(stepped.players[1]!.outcome.kind).toBe(PlayerOutcomeKind.Active);
    // ...and bounces, exactly as slot 0 does.
    expect(Number(stepped.players[1]!.player.velocity.y)).toBeLessThan(0);
  });

  // Coins and power-ups reached the primary alone: a co-op player walked through
  // a mushroom without collecting it and stayed small for the whole level —
  // unable to break a brick, and killed by any contact.
  it("lets a co-op player collect a power-up and grow from it", () => {
    const levelResult = makeLevelSpec(powerUpRouteLevelInput);
    if (!levelResult.ok) {
      throw new Error("expected a valid power-up route level");
    }
    const level = levelResult.value;
    const stateResult = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      level,
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      2,
    );
    if (!stateResult.ok) {
      throw new Error("expected a valid two-player state");
    }
    // The power-up sits at tile (4, 4); stand the co-op player on it while the
    // primary stays at spawn, so only the co-op player can have collected it.
    const onThePowerUp = withCoopPlayerAt(stateResult.value, 4 * 16, 4 * 16);
    expect(onThePowerUp.players[1]!.vitality.kind).toBe(
      PlayerVitalityKind.Small,
    );

    const stepped = stepSimulation(
      onThePowerUp,
      neutral(),
      initialMovementConstants,
      level,
      [neutral()],
    );

    expect(stepped.players[1]!.vitality.kind).not.toBe(
      PlayerVitalityKind.Small,
    );
    // The primary did not silently grow from somebody else's mushroom.
    expect(stepped.players[0].vitality.kind).toBe(PlayerVitalityKind.Small);
  });

  it("keeps a co-op player alive during the spawn-invincibility window", () => {
    // The same on-the-enemy placement, but stepped on an early frame: the bot
    // is invincible for the first 10 seconds, so it survives.
    const base = twoPlayerState();
    const stepped = stepSimulation(
      withCoopPlayerAt(base, 96, 56),
      neutral(),
      initialMovementConstants,
      firstAuthoredLevelSpec(),
      [neutral()],
    );
    expect(stepped.players).toHaveLength(2);
  });

  it("finishes the level when any player (a co-op player) reaches the goal", () => {
    const levelResult = makeLevelSpec(finishRouteLevelInput);
    if (!levelResult.ok) {
      throw new Error("expected a valid finish-route level");
    }
    const level = levelResult.value;
    const stateResult = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      level,
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      2,
    );
    if (!stateResult.ok) {
      throw new Error("expected a valid two-player state");
    }
    const base = stateResult.value;
    // Put the co-op player on the flagpole column (col 8).
    const stepped = stepSimulation(
      withCoopPlayerAt(
        base,
        8 * 16,
        Number(base.players[1]!.player.position.y),
      ),
      neutral(),
      initialMovementConstants,
      level,
      [neutral()],
    );
    expect(stepped.players[0].outcome.kind).toBe(PlayerOutcomeKind.Finished);
  });

  it("advances a co-op player's position across frames from its input", () => {
    let state = twoPlayerState();
    const startX = Number(state.players[1]!.player.position.x);
    for (let frame = 0; frame < 15; frame += 1) {
      state = stepSimulation(
        state,
        neutral(),
        initialMovementConstants,
        firstAuthoredLevelSpec(),
        [runRight()],
      );
    }
    expect(Number(state.players[1]!.player.position.x)).toBeGreaterThan(
      Number(startX),
    );
  });
});

// Advance `base`'s clock past the 10-second co-op spawn-invincibility window so
// the next step applies the normal death rules to the bots.
function afterSpawnInvincibility(base: SimulationState): SimulationState {
  return {
    ...base,
    clock: {
      ...base.clock,
      frameIndex: 700 as SimulationState["clock"]["frameIndex"],
    },
  };
}

// Return a copy of `base` with its single co-op player moved to (x, y).
function withCoopPlayerAt(
  base: SimulationState,
  x: number,
  y: number,
): SimulationState {
  const coop = base.players[1]!;
  return {
    ...base,
    players: [
      base.players[0],
      {
        ...coop,
        player: {
          ...coop.player,
          position: {
            x: requireSimulationPixelPosition(x, "player.position.x"),
            y: requireSimulationPixelPosition(y, "player.position.y"),
          },
        },
      },
    ],
  };
}
