import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import {
  HorizontalInput,
  type SimulationInputCommand,
} from "../engine/simulation/input-command";
import { makeLevelSpec } from "../engine/domain/level-spec";
import { finishRouteLevelInput } from "../engine/levels/finish-route-level";
import { firstAuthoredLevelInput } from "../engine/levels/first-authored-level";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import {
  makeInitialSimulationState,
  type SimulationState,
} from "../engine/simulation/simulation-state";
import { stepSimulation } from "../engine/simulation/step-simulation";
import {
  PlayerDefeatReason,
  PlayerFinishReason,
  PlayerOutcomeKind,
} from "../engine/simulation/player-outcome";
import {
  nominalSixtyHertzFrameDurationMilliseconds,
  requireSimulationPixelPosition,
} from "../engine/simulation/simulation-units";
import {
  MultiplayerGameMode,
  requireMultiplayerAvatar,
  requireMultiplayerGameId,
  requireMultiplayerNickname,
  requireMultiplayerPlayerId,
} from "./domain";
import {
  type AuthoritativeGameSnapshot,
  makeAuthoritativeGameRunner,
  MultiplayerGamePhase,
  type AuthoritativeGameRunner,
  type MultiplayerPlayerProfile,
} from "./game-runner";
import { decodeMultiplayerSimulationState } from "./simulation-wire";
import { loadOfficialSmbPack } from "../engine/levels/import/official-smb-pack.test-support";

const neutral: SimulationInputCommand = {
  horizontal: HorizontalInput.Neutral,
  jumpPressed: false,
  runHeld: false,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

type RecordedWorld11Input = {
  readonly count: number;
  readonly horizontal: HorizontalInput;
  readonly jump: boolean;
  readonly down: boolean;
  readonly run: boolean;
};

function readWorld11SmallInputTrace(): readonly RecordedWorld11Input[] {
  const encoded = readFileSync(
    "tests/multiplayer-browser/world11-small-input-trace.json.gz.base64",
    "utf8",
  ).trim();
  return JSON.parse(
    gunzipSync(Buffer.from(encoded, "base64")).toString("utf8"),
  ) as readonly RecordedWorld11Input[];
}

function profile(id: string, nickname = "Mira"): MultiplayerPlayerProfile {
  return {
    playerId: requireMultiplayerPlayerId(id),
    nickname: requireMultiplayerNickname(nickname),
    avatarId: requireMultiplayerAvatar("castaway"),
  };
}

function makeInitialState(): SimulationState {
  const initial = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    multiplayerLevelSpec(),
    initialMovementConstants,
  );
  if (!initial.ok) {
    throw new Error("Expected a valid simulation state.");
  }
  return initial.value;
}

/** A revive must return the player to play: no longer a spectator, active again. */
function expectRevivedToActivePlay(revived: AuthoritativeGameSnapshot): void {
  expect(revived.players[0]?.spectator).toBe(false);
  expect(
    decodeMultiplayerSimulationState(revived.simulationState).players[0].outcome
      .kind,
  ).toBe(PlayerOutcomeKind.Active);
}

function makeDefeatedPlayerRunner(): AuthoritativeGameRunner {
  const initial = makeInitialState();
  return makeRunnerWithInitialState({
    ...initial,
    players: [
      {
        ...initial.players[0],
        outcome: {
          kind: PlayerOutcomeKind.Defeated,
          reason: PlayerDefeatReason.PitContact,
        },
      },
    ],
  });
}

function multiplayerLevelSpec() {
  const result = makeLevelSpec(finishRouteLevelInput);
  if (!result.ok) {
    throw new Error("Expected a valid authored multiplayer level.");
  }
  return result.value;
}

function makeRunnerForMode(
  initialState: SimulationState,
  mode: MultiplayerGameMode,
) {
  return makeAuthoritativeGameRunner({
    gameId: requireMultiplayerGameId("game-1"),
    levelId: "finish-route",
    creator: profile("mira"),
    mode,
    initialState,
    levelSpec: multiplayerLevelSpec(),
    movementConstants: initialMovementConstants,
  });
}

function makeRunnerWithInitialState(initialState: SimulationState) {
  return makeRunnerForMode(initialState, MultiplayerGameMode.Regular);
}

function makeRunner() {
  return makeRunnerWithInitialState(makeInitialState());
}

function runCreatorRightToFinish(runner: AuthoritativeGameRunner) {
  let snapshot = runner.snapshot();
  for (let frame = 1; frame <= 1_200; frame += 1) {
    runner.submitInput(
      {
        playerId: requireMultiplayerPlayerId("mira"),
        sequence: frame,
        intendedFrame: frame,
        receivedAtMilliseconds: frame,
        command: {
          ...neutral,
          horizontal: HorizontalInput.Right,
          runHeld: true,
        },
      },
      frame,
    );
    snapshot = runner.step(frame);
    if (snapshot.phase === MultiplayerGamePhase.Finished) {
      break;
    }
  }
  return snapshot;
}

/** A runner on the bundled World 1-1, the shared course the browser suites play. */
function makeWorld11Runner(gameId: string) {
  const world11 = loadOfficialSmbPack().get("smb-1-1");
  if (world11 === undefined) {
    throw new Error("World 1-1 is missing from the bundled level pack.");
  }
  const initial = makeInitialSimulationState(
    nominalSixtyHertzFrameDurationMilliseconds,
    world11.levelSpec,
    initialMovementConstants,
  );
  if (!initial.ok) {
    throw new Error("World 1-1 initial state is invalid.");
  }
  return makeAuthoritativeGameRunner({
    gameId: requireMultiplayerGameId(gameId),
    levelId: "smb-1-1",
    creator: profile("mira"),
    mode: MultiplayerGameMode.Regular,
    initialState: initial.value,
    levelSpec: world11.levelSpec,
    movementConstants: initialMovementConstants,
  });
}

describe("authoritative multiplayer game runner", () => {
  it("spawns joining players at the party checkpoint and preserves stable slots", () => {
    const runner = makeRunner();
    const creator = runner.snapshot().players[0];
    const joined = runner.join(profile("ren", "Ren"));
    expect(joined.players).toHaveLength(2);
    // The checkpoint starts where the creator stands: somewhere a player has
    // provably existed. Overlap is resolved by solid player collision.
    expect(joined.players[1]).toMatchObject({
      playerId: "ren",
      slot: 1,
      x: creator?.x,
      y: creator?.y,
    });
  });

  it("spawns a late joiner at the party's grounded checkpoint", () => {
    const initial = makeInitialState();
    const runner = makeRunnerWithInitialState({
      ...initial,
      players: [
        {
          ...initial.players[0],
          player: {
            ...initial.players[0].player,
            position: {
              x: requireSimulationPixelPosition(560, "test.player.x"),
              y: initial.players[0].player.position.y,
            },
          },
        },
      ],
    });
    runner.start(requireMultiplayerPlayerId("mira"));
    runner.step(1);
    const beforeJoin = runner.snapshot();
    expect(beforeJoin.cameraLeftPixels).toBeGreaterThan(0);
    const joined = runner.join(profile("ren", "Ren"));
    // The checkpoint tracked the grounded leader, so the joiner lands beside
    // the party's progress rather than at an unvisited camera coordinate.
    expect(joined.players[1]?.x).toBe(beforeJoin.players[0]?.x);
  });

  it("follows the leading active guest when the creator remains idle", () => {
    // The creator idles mid-level; the joining guest spawns beside them (the
    // party checkpoint), hops over their solid body, and runs ahead. The shared
    // camera must follow the guest's progress, not the idle creator's slot.
    const initial = makeInitialState();
    const runner = makeRunnerWithInitialState({
      ...initial,
      players: [
        {
          ...initial.players[0],
          player: {
            ...initial.players[0].player,
            position: {
              x: requireSimulationPixelPosition(200, "test.creator.x"),
              y: initial.players[0].player.position.y,
            },
          },
        },
      ],
    });
    runner.join(profile("ren", "Ren"));
    runner.start(requireMultiplayerPlayerId("mira"));
    let snapshot = runner.snapshot();
    for (let frame = 1; frame <= 60; frame += 1) {
      runner.submitInput(
        {
          playerId: requireMultiplayerPlayerId("ren"),
          sequence: frame,
          intendedFrame: frame,
          receivedAtMilliseconds: frame,
          command: {
            ...neutral,
            horizontal: HorizontalInput.Right,
            runHeld: true,
            jumpPressed: frame <= 14,
          },
        },
        frame,
      );
      snapshot = runner.step(frame);
    }
    const creator = snapshot.players[0]!;
    const guest = snapshot.players[1]!;
    expect(guest.x).toBeGreaterThan(creator.x);
    expect(snapshot.cameraLeftPixels).toBeCloseTo(guest.x - 128, 5);
  });

  it("runs only after the creator starts and acknowledges queued input", () => {
    const runner = makeRunner();
    expect(runner.snapshot().phase).toBe(MultiplayerGamePhase.Waiting);
    expect(() => runner.start(requireMultiplayerPlayerId("ren"))).toThrow(
      "creator",
    );
    runner.start(requireMultiplayerPlayerId("mira"));
    runner.submitInput(
      {
        playerId: requireMultiplayerPlayerId("mira"),
        sequence: 1,
        intendedFrame: 1,
        receivedAtMilliseconds: 0,
        command: { ...neutral, horizontal: HorizontalInput.Right },
      },
      0,
    );
    const stepped = runner.step(1);
    expect(stepped.frame).toBe(1);
    expect(stepped.players[0]!.acknowledgedInputSequence).toBe(1);
    expect(stepped.players[0]!.inputAcknowledgementLagMilliseconds).toBe(1);
    expect(stepped.queue.depth).toBe(0);
  });

  it("can run the introductory course to its ground-level goal", () => {
    const runner = makeRunner();
    runner.start(requireMultiplayerPlayerId("mira"));
    const snapshot = runCreatorRightToFinish(runner);
    expect(snapshot.phase).toBe(MultiplayerGamePhase.Finished);
  });

  it("lets a moving player pass idle online party members", () => {
    const runner = makeRunner();
    runner.join(profile("ren", "Ren"));
    runner.join(profile("sol", "Sol"));
    runner.join(profile("ivy", "Ivy"));
    runner.start(requireMultiplayerPlayerId("mira"));
    const snapshot = runCreatorRightToFinish(runner);
    expect(snapshot.phase).toBe(MultiplayerGamePhase.Finished);
  });

  // A party that wipes must be able to get back up. The checkpoint used to be
  // the leading active player's position outright — and a leader falling into a
  // pit is still active and still moving right for the whole descent, so the
  // checkpoint could come to rest in mid-air over the pit. Every revive then
  // dropped the party straight back down it, forever: CI caught four players
  // spectating at the same point below the floor, the game still "playing" and
  // its frame counter climbing, after ninety-odd revives each.
  // Time-up now defeats the whole party, so a revive that leaves the clock at
  // zero is not a revive at all: the next step times the player straight back
  // out. Winding the clock back is what keeps the run playable.
  it("gives the party a fresh clock when it revives out of a time-up", () => {
    const runner = makeWorld11Runner("time-up-revive");
    runner.start(requireMultiplayerPlayerId("mira"));

    // Idle at the spawn until the level clock runs out.
    let timedOut = false;
    for (let frame = 1; frame <= 20_000 && !timedOut; frame += 1) {
      timedOut = runner.step(frame).players[0]?.spectator === true;
    }
    expect(timedOut, "the level clock should have run out").toBe(true);

    runner.revive(requireMultiplayerPlayerId("mira"));
    // Step on: an expired clock would defeat the revived player immediately.
    for (let frame = 20_001; frame <= 20_060; frame += 1) {
      runner.step(frame);
    }
    expect(
      runner.snapshot().players[0]?.spectator,
      "a player revived out of a time-up was timed out again at once",
    ).toBe(false);
  });

  it("never sets the party checkpoint somewhere a player cannot stand", () => {
    const runner = makeWorld11Runner("wipe-recovery");
    runner.start(requireMultiplayerPlayerId("mira"));

    // Run right into World 1-1's first pit without jumping, which is exactly
    // how a party loses its leader mid-fall.
    let died = false;
    for (let frame = 1; frame <= 1_200 && !died; frame += 1) {
      runner.submitInput(
        {
          playerId: requireMultiplayerPlayerId("mira"),
          sequence: frame,
          intendedFrame: frame,
          receivedAtMilliseconds: frame,
          command: { ...neutral, horizontal: HorizontalInput.Right },
        },
        frame,
      );
      const stepped = runner.step(frame);
      died = stepped.players[0]?.spectator === true;
    }
    expect(died, "the runner should have fallen into the pit").toBe(true);

    // Revive, then run the world on without touching the controls. A checkpoint
    // over a pit kills the revived player again within a second.
    runner.revive(requireMultiplayerPlayerId("mira"));
    for (let frame = 1_201; frame <= 1_320; frame += 1) {
      runner.step(frame);
    }
    expect(
      runner.snapshot().players[0]?.spectator,
      "a revived player fell straight back into the pit they died in",
    ).toBe(false);
  });

  it("keeps the World 1-1 completion trace valid with four online players", () => {
    const runner = makeWorld11Runner("world11-trace");
    runner.join(profile("ren", "Ren"));
    runner.join(profile("sol", "Sol"));
    runner.join(profile("ivy", "Ivy"));
    runner.start(requireMultiplayerPlayerId("mira"));

    let sequence = 0;
    let frame = 0;
    let snapshot = runner.snapshot();
    for (const input of readWorld11SmallInputTrace()) {
      sequence += 1;
      runner.submitInput(
        {
          playerId: requireMultiplayerPlayerId("mira"),
          sequence,
          intendedFrame: frame + 1,
          receivedAtMilliseconds: frame,
          command: {
            ...neutral,
            horizontal: input.horizontal,
            jumpPressed: input.jump,
            downHeld: input.down,
            runHeld: input.run,
          },
        },
        frame,
      );
      for (let repeat = 0; repeat < input.count; repeat += 1) {
        frame += 1;
        snapshot = runner.step(frame);
        if (snapshot.phase === MultiplayerGamePhase.Finished) {
          break;
        }
      }
      if (snapshot.phase === MultiplayerGamePhase.Finished) {
        break;
      }
    }
    expect(snapshot.phase).toBe(MultiplayerGamePhase.Finished);
  });

  it("advances an activated World 2-1 piranha plant on the authoritative server", () => {
    const world21 = loadOfficialSmbPack().get("smb-2-1");
    if (world21 === undefined) {
      throw new Error("World 2-1 is missing from the bundled level pack.");
    }
    const initial = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      world21.levelSpec,
      initialMovementConstants,
    );
    if (!initial.ok) {
      throw new Error("World 2-1 initial state is invalid.");
    }
    const plant = initial.value.enemyMotion.piranhaPlantActors[0];
    if (plant === undefined) {
      throw new Error("World 2-1 must contain a piranha plant.");
    }
    const activationPosition = requireSimulationPixelPosition(
      Number(plant.position.x) - 220,
      "test.world21.piranha.activation-position",
    );
    const runner = makeAuthoritativeGameRunner({
      gameId: requireMultiplayerGameId("world21-piranha"),
      levelId: "smb-2-1",
      creator: profile("mira"),
      mode: MultiplayerGameMode.Regular,
      initialState: {
        ...initial.value,
        players: [
          {
            ...initial.value.players[0],
            player: {
              ...initial.value.players[0].player,
              position: {
                x: activationPosition,
                y: initial.value.players[0].player.position.y,
              },
            },
          },
        ],
      },
      levelSpec: world21.levelSpec,
      movementConstants: initialMovementConstants,
    });
    runner.start(requireMultiplayerPlayerId("mira"));
    let snapshot = runner.snapshot();
    for (let frame = 1; frame <= 28; frame += 1) {
      snapshot = runner.step(frame);
    }
    const advancedPlant = decodeMultiplayerSimulationState(
      snapshot.simulationState,
    ).enemyMotion.piranhaPlantActors.find(
      (candidate) => candidate.entityId === plant.entityId,
    );

    expect(advancedPlant?.position.y).toBeLessThan(Number(plant.baseY));
  });

  it("is bit-for-bit state-equivalent to a local two-player engine trace", () => {
    const traceLevelResult = makeLevelSpec(firstAuthoredLevelInput);
    if (!traceLevelResult.ok) {
      throw new Error("Expected a valid authored trace level.");
    }
    const traceInitial = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      traceLevelResult.value,
      initialMovementConstants,
    );
    if (!traceInitial.ok) {
      throw new Error("Expected a valid authored trace state.");
    }
    const runner = makeAuthoritativeGameRunner({
      gameId: requireMultiplayerGameId("game-trace"),
      levelId: "first-authored",
      creator: profile("mira"),
      mode: MultiplayerGameMode.Regular,
      initialState: traceInitial.value,
      levelSpec: traceLevelResult.value,
      movementConstants: initialMovementConstants,
    });
    const joined = runner.join(profile("ren", "Ren"));
    let localState = decodeMultiplayerSimulationState(joined.simulationState);
    runner.start(requireMultiplayerPlayerId("mira"));

    const creatorCommand: SimulationInputCommand = {
      ...neutral,
      horizontal: HorizontalInput.Right,
      runHeld: true,
    };
    const guestCommand: SimulationInputCommand = {
      ...neutral,
      horizontal: HorizontalInput.Left,
      jumpPressed: true,
    };
    for (let frame = 1; frame <= 12; frame += 1) {
      const currentGuestCommand =
        frame === 1 ? guestCommand : { ...guestCommand, jumpPressed: false };
      if (frame === 1) {
        runner.submitInput(
          {
            playerId: requireMultiplayerPlayerId("mira"),
            sequence: 1,
            intendedFrame: frame,
            receivedAtMilliseconds: 0,
            command: creatorCommand,
          },
          0,
        );
        runner.submitInput(
          {
            playerId: requireMultiplayerPlayerId("ren"),
            sequence: 1,
            intendedFrame: frame,
            receivedAtMilliseconds: 0,
            command: currentGuestCommand,
          },
          0,
        );
      } else {
        runner.submitInput(
          {
            playerId: requireMultiplayerPlayerId("ren"),
            sequence: frame,
            intendedFrame: frame,
            receivedAtMilliseconds: 0,
            command: currentGuestCommand,
          },
          0,
        );
      }
      localState = stepSimulation(
        localState,
        creatorCommand,
        initialMovementConstants,
        traceLevelResult.value,
        [currentGuestCommand],
      );
      const server = runner.step(frame);
      expect(decodeMultiplayerSimulationState(server.simulationState)).toEqual(
        localState,
      );
    }
  });

  it("steps the same authoritative lifecycle in regular and revenge modes", () => {
    for (const mode of [
      MultiplayerGameMode.Regular,
      MultiplayerGameMode.Revenge,
    ]) {
      const runner = makeRunnerForMode(makeInitialState(), mode);
      runner.start(requireMultiplayerPlayerId("mira"));
      expect(runner.step(1)).toMatchObject({
        mode,
        phase: MultiplayerGamePhase.Playing,
        frame: 1,
      });
    }
  });

  it("supports admin-style pause and exact one-frame advancement", () => {
    const runner = makeRunner();
    runner.start(requireMultiplayerPlayerId("mira"));
    runner.pause();
    expect(runner.snapshot().phase).toBe(MultiplayerGamePhase.Paused);
    expect(() => runner.step(1)).toThrow("Only playing");
    expect(runner.stepPaused(1)).toMatchObject({
      frame: 1,
      phase: MultiplayerGamePhase.Paused,
    });
  });

  it("toggles pause from authoritative phase rather than a client receipt", () => {
    const runner = makeRunner();
    runner.start(requireMultiplayerPlayerId("mira"));

    expect(
      runner.togglePauseByPlayer(requireMultiplayerPlayerId("mira")).phase,
    ).toBe(MultiplayerGamePhase.Paused);
    expect(
      runner.togglePauseByPlayer(requireMultiplayerPlayerId("mira")).phase,
    ).toBe(MultiplayerGamePhase.Playing);
  });

  it("issues a strictly increasing snapshot sequence across same-frame lifecycle changes", () => {
    const runner = makeRunner();
    const waiting = runner.snapshot();
    const playing = runner.start(requireMultiplayerPlayerId("mira"));
    const paused = runner.pause();

    expect(waiting.frame).toBe(0);
    expect(playing.frame).toBe(0);
    expect(paused.frame).toBe(0);
    expect(waiting.snapshotSequence).toBeLessThan(playing.snapshotSequence);
    expect(playing.snapshotSequence).toBeLessThan(paused.snapshotSequence);
  });

  it("reuses an unchanged receipt while queued input waits for its frame", () => {
    const runner = makeRunner();
    const baseline = runner.snapshot();

    const queued = runner.submitInput(
      {
        playerId: requireMultiplayerPlayerId("mira"),
        sequence: 1,
        intendedFrame: 1,
        receivedAtMilliseconds: 0,
        command: neutral,
      },
      0,
    );

    expect(queued).toBe(baseline);
    expect(runner.snapshot()).toBe(baseline);
    expect(runner.start(requireMultiplayerPlayerId("mira"))).not.toBe(baseline);
  });

  it("retains defeated members as spectators while active players continue", () => {
    const runner = makeDefeatedPlayerRunner();
    const snapshot = runner.snapshot();
    expect(snapshot.players[0]?.spectator).toBe(true);
    expect(snapshot.phase).toBe(MultiplayerGamePhase.Waiting);
  });

  it("revives only the defeated player without restarting the shared game", () => {
    const runner = makeDefeatedPlayerRunner();
    runner.start(requireMultiplayerPlayerId("mira"));
    runner.step(1);
    runner.step(2);
    const beforeRevive = runner.snapshot();

    const revived = runner.revive(requireMultiplayerPlayerId("mira"));

    expect(revived.phase).toBe(MultiplayerGamePhase.Playing);
    expect(revived.frame).toBe(beforeRevive.frame);
    expectRevivedToActivePlay(revived);
  });

  // Defeat lives in two variants: a player killed ON the goal is
  // DefeatedAndFinished, not Defeated. revive() compared `kind === Defeated`
  // and refused them with "Only defeated players can revive." — the report
  // from the deployed game. Both variants must revive, so both are asserted
  // through one path rather than two near-identical tests.
  it.each([
    [
      "a plain defeat",
      {
        kind: PlayerOutcomeKind.Defeated,
        reason: PlayerDefeatReason.PitContact,
      } as const,
    ],
    [
      "a defeat at the goal",
      {
        kind: PlayerOutcomeKind.DefeatedAndFinished,
        defeatReason: PlayerDefeatReason.EnemyContact,
        finishReason: PlayerFinishReason.GoalContact,
      } as const,
    ],
  ])("revives a player after %s", (_label, outcome) => {
    const initial = makeInitialState();
    const runner = makeRunnerWithInitialState({
      ...initial,
      players: [{ ...initial.players[0], outcome }],
    });
    runner.start(requireMultiplayerPlayerId("mira"));

    const revived = runner.revive(requireMultiplayerPlayerId("mira"));

    expectRevivedToActivePlay(revived);
  });

  // Revive returns a player to the party's furthest progress, not to the level
  // start: if a team-mate has pushed ahead, dying should not cost the party the
  // ground they gained. The checkpoint advances only from an ACTIVE member and
  // never rewinds, so a revive cannot drag the run backwards either.
  it("revives a player at the party checkpoint rather than the level start", () => {
    const initial = makeInitialState();
    const startPosition = initial.players[0].player.position;
    const runner = makeRunnerWithInitialState({
      ...initial,
      players: [
        {
          ...initial.players[0],
          outcome: {
            kind: PlayerOutcomeKind.Defeated,
            reason: PlayerDefeatReason.PitContact,
          },
        },
      ],
    });
    const mira = requireMultiplayerPlayerId("mira");
    const ari = requireMultiplayerPlayerId("ari");
    runner.join({
      playerId: ari,
      nickname: requireMultiplayerNickname("Ari"),
      avatarId: requireMultiplayerAvatar("castaway"),
    });
    runner.start(mira);

    // Ari runs ahead while Mira lies defeated; the checkpoint follows the
    // leader. Ari spawns at the checkpoint (Mira's resting place) and stops
    // short of the flagpole column — reaching it would finish the course.
    for (let frame = 1; frame <= 45; frame += 1) {
      runner.submitInput(
        {
          playerId: ari,
          sequence: frame,
          intendedFrame: frame,
          receivedAtMilliseconds: frame,
          command: {
            ...neutral,
            horizontal: HorizontalInput.Right,
            runHeld: true,
          },
        },
        frame,
      );
      runner.step(frame);
    }
    // players[1] is Ari's slot; assert rather than index blindly so a runner
    // that silently dropped the join fails here with a clear reason.
    const leader = decodeMultiplayerSimulationState(
      runner.snapshot().simulationState,
    ).players[1];
    if (leader === undefined) {
      throw new Error("The joined player must occupy slot 1.");
    }
    const leaderX = Number(leader.player.position.x);
    expect(leaderX).toBeGreaterThan(Number(startPosition.x));

    const revived = runner.revive(mira);

    const revivedX = Number(
      decodeMultiplayerSimulationState(revived.simulationState).players[0]
        .player.position.x,
    );
    // Forward of the start, and on ground the level actually has.
    //
    // This used to assert the checkpoint equalled the leader's position exactly,
    // which passed only because the old rule followed the leader anywhere. This
    // fixture level is ten tiles wide and the leader has run to x≈389 — two and
    // a half level-widths past the end, falling through the void — so equality
    // was asserting that a party respawns off the map.
    expect(revivedX).toBeGreaterThan(Number(startPosition.x));
    expect(revivedX).toBeLessThanOrEqual(
      finishRouteLevelInput.widthTiles * finishRouteLevelInput.tileSizePixels,
    );
  });

  it("allows a defeated player to revive while the party is paused", () => {
    const runner = makeDefeatedPlayerRunner();
    runner.start(requireMultiplayerPlayerId("mira"));
    runner.pause();
    const revived = runner.revive(requireMultiplayerPlayerId("mira"));
    expect(revived.phase).toBe(MultiplayerGamePhase.Paused);
    expect(revived.players[0]?.spectator).toBe(false);
  });

  it("enforces the hard sixteen-player game cap", () => {
    const runner = makeRunner();
    for (let playerNumber = 1; playerNumber < 16; playerNumber += 1) {
      runner.join(profile(`player-${playerNumber}`, `Player ${playerNumber}`));
    }
    expect(runner.snapshot().players).toHaveLength(16);
    expect(() => runner.join(profile("overflow", "Overflow"))).toThrow(
      "cannot exceed 16",
    );
  });

  it("finishes the whole game when any authoritative player has finished", () => {
    const initial = makeInitialState();
    const runner = makeRunnerWithInitialState({
      ...initial,
      players: [
        {
          ...initial.players[0],
          outcome: {
            kind: PlayerOutcomeKind.Finished,
            reason: PlayerFinishReason.GoalContact,
          },
        },
      ],
    });
    runner.start(requireMultiplayerPlayerId("mira"));
    expect(runner.step(1).phase).toBe(MultiplayerGamePhase.Finished);
  });

  it("finishes the whole game when a joined player reaches the goal", () => {
    const levelResult = makeLevelSpec({
      ...finishRouteLevelInput,
      tiles: finishRouteLevelInput.tiles.map((row, rowIndex) =>
        row.map((tile, columnIndex) =>
          rowIndex === 4 && columnIndex === 9 ? "gate" : tile,
        ),
      ),
    });
    if (!levelResult.ok) {
      throw new Error("Expected a valid joined-player goal test level.");
    }
    const initial = makeInitialSimulationState(
      nominalSixtyHertzFrameDurationMilliseconds,
      levelResult.value,
      initialMovementConstants,
    );
    if (!initial.ok) {
      throw new Error("Expected a valid joined-player goal test state.");
    }
    const runner = makeAuthoritativeGameRunner({
      gameId: requireMultiplayerGameId("game-1"),
      levelId: "joined-player-goal",
      creator: profile("mira"),
      mode: MultiplayerGameMode.Regular,
      initialState: initial.value,
      levelSpec: levelResult.value,
      movementConstants: initialMovementConstants,
    });
    runner.join(profile("ren", "Ren"));
    runner.start(requireMultiplayerPlayerId("mira"));
    // Ren spawns beside the idle creator, hops over them, and runs to the
    // course's flagpole; the joined player's goal contact must finish the
    // whole game.
    let snapshot = runner.snapshot();
    for (
      let frame = 1;
      frame <= 300 && snapshot.phase !== MultiplayerGamePhase.Finished;
      frame += 1
    ) {
      runner.submitInput(
        {
          playerId: requireMultiplayerPlayerId("ren"),
          sequence: frame,
          intendedFrame: frame,
          receivedAtMilliseconds: frame,
          command: {
            ...neutral,
            horizontal: HorizontalInput.Right,
            runHeld: true,
            jumpPressed: frame <= 14,
          },
        },
        frame,
      );
      snapshot = runner.step(frame);
    }
    expect(snapshot.phase).toBe(MultiplayerGamePhase.Finished);
    expect(snapshot.players[1]).toMatchObject({
      playerId: "ren",
      spectator: true,
    });
  });
});
