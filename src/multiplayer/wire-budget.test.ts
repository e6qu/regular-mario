import { readFileSync } from "node:fs";
import { deflateRawSync } from "node:zlib";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { makeLevelSpec } from "../engine/domain/level-spec";
import { parseVglcSmbMultiLayerLevel } from "../engine/levels/import/vglc-smb-text-level";
import { HorizontalInput } from "../engine/simulation/input-command";
import { initialMovementConstants } from "../engine/simulation/movement-model";
import { makeInitialPlayerVitalityState } from "../engine/simulation/player-vitality";
import { makeInitialSimulationStateWithPlayerVitality } from "../engine/simulation/simulation-state";
import { nominalSixtyHertzFrameDurationMilliseconds } from "../engine/simulation/simulation-units";
import { stepSimulation } from "../engine/simulation/step-simulation";
import { encodeMultiplayerSimulationState } from "./simulation-wire";
import { makeStateDelta } from "./state-transport";

/**
 * What a full party actually costs the network.
 *
 * The transport negotiates per-message deflate with no context takeover, so
 * each message is compressed on its own — which is how it is measured here.
 * That compression is also why the wire format itself was left alone: it
 * collapses exactly the repetition (repeated key names, shared numeric
 * prefixes) that a hand-rolled path dictionary or float quantization would
 * target, and quantizing would cost the "the wire state is exactly the
 * simulation state" invariant that `game-runner.test.ts` pins.
 *
 * These budgets are deliberately loose. They are here to catch a new field
 * that changes every frame for all sixteen players, not to pin a number.
 */

const budgets = {
  keyframeDeflatedBytes: 4_000,
  deltaDeflatedBytes: 1_000,
  perClientSecondDeflatedBytes: 24_000,
};

function releaseLevel(name: string) {
  const directory = resolve(
    process.cwd(),
    "public/game-content/content-set-bundles/castaway-parody__official-smb",
  );
  const manifest = JSON.parse(
    readFileSync(resolve(directory, "remote-manifest.json"), "utf8"),
  ) as {
    readonly levels: readonly {
      readonly name: string;
      readonly source: { readonly url: string };
      readonly importMetadataSource: { readonly url: string };
    }[];
  };
  const entry = manifest.levels.find((level) => level.name === name);
  if (entry === undefined) {
    throw new Error(`Release bundle has no level ${name}.`);
  }
  const input = parseVglcSmbMultiLayerLevel(
    readFileSync(resolve(directory, entry.source.url), "utf8"),
    JSON.parse(
      readFileSync(resolve(directory, entry.importMetadataSource.url), "utf8"),
    ) as unknown,
  );
  if (!input.ok) {
    throw new Error(`Release level ${name} did not parse.`);
  }
  const spec = makeLevelSpec(input.value);
  if (!spec.ok) {
    throw new Error(`Release level ${name} did not validate.`);
  }
  return spec.value;
}

const runningRight = {
  horizontal: HorizontalInput.Right,
  jumpPressed: false,
  runHeld: true,
  firePressed: false,
  upHeld: false,
  downHeld: false,
};

function deflatedBytes(value: unknown): number {
  return deflateRawSync(Buffer.from(JSON.stringify(value), "utf8"), {
    level: 4,
    memLevel: 7,
  }).byteLength;
}

describe("multiplayer wire budget", () => {
  it("keeps a sixteen-player party inside its transport budget", () => {
    const level = releaseLevel("smb-1-1");
    const playerCount = 16;
    const made = makeInitialSimulationStateWithPlayerVitality(
      nominalSixtyHertzFrameDurationMilliseconds,
      level,
      initialMovementConstants,
      makeInitialPlayerVitalityState(),
      playerCount,
    );
    if (!made.ok) {
      throw new Error("Expected a valid sixteen-player state.");
    }
    const coopCommands = Array.from(
      { length: playerCount - 1 },
      () => runningRight,
    );
    let state = made.value;
    // Run the party into the level so enemies are active and everybody moves.
    for (let frame = 0; frame < 240; frame += 1) {
      state = stepSimulation(
        state,
        runningRight,
        initialMovementConstants,
        level,
        coopCommands,
      );
    }
    const keyframe = encodeMultiplayerSimulationState(state);
    const next = stepSimulation(
      state,
      runningRight,
      initialMovementConstants,
      level,
      coopCommands,
    );
    const delta = makeStateDelta(
      keyframe,
      encodeMultiplayerSimulationState(next),
    );

    const keyframeBytes = deflatedBytes(keyframe);
    const deltaBytes = deflatedBytes(delta);
    // One second of transport for one client: the 20 Hz delta stream plus the
    // periodic full keyframe.
    const perClientSecond = 20 * deltaBytes + keyframeBytes;

    expect(keyframeBytes).toBeLessThan(budgets.keyframeDeflatedBytes);
    expect(deltaBytes).toBeLessThan(budgets.deltaDeflatedBytes);
    expect(perClientSecond).toBeLessThan(budgets.perClientSecondDeflatedBytes);
  });
});
