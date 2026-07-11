// Content census over the committed official-smb pack: for every one of the
// 54 levels, the exact count of every actor id, every mechanism, and every
// tile id is pinned against the committed census file. Any decode or import
// regression that adds, drops, or moves an enemy/mechanic/scenery element in
// any level fails this suite loudly. Regenerate deliberately with:
//   REGENERATE_SMB_CENSUS=1 pnpm vitest run src/engine/levels/import/official-smb-census.test.ts

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { ActorRole } from "../../domain/level-spec";
import {
  loadOfficialSmbPack,
  type OfficialPackLevel,
} from "./official-smb-pack.test-support";

const censusPath = resolve("src/engine/levels/import/official-smb-census.json");

function countBy<T>(items: readonly T[], key: (item: T) => string) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const k = key(item);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort());
}

function metadataArray(
  level: OfficialPackLevel,
  key: string,
): readonly unknown[] {
  const value = level.metadata[key];
  return Array.isArray(value) ? value : [];
}

function buildCensus(level: OfficialPackLevel) {
  const spec = level.levelSpec;
  const placedActors = spec.actors.filter((actor) => {
    const definition = spec.actorDefinitions.find(
      (candidate) => candidate.actorId === actor.actorId,
    );
    return (
      definition !== undefined && definition.role !== ActorRole.PlayerStart
    );
  });
  return {
    widthTiles: spec.widthTiles,
    theme: level.metadata.theme ?? "overworld",
    actors: countBy(placedActors, (actor) => actor.actorId),
    tiles: countBy(
      spec.tiles.flatMap((row) => row.filter((tile) => tile !== "empty")),
      (tile) => tile,
    ),
    piranhaPlants: placedActors.filter(
      (actor) => actor.actorId === "vglc-smb-piranha",
    ).length,
    firebars: spec.firebars.length,
    podoboos: spec.podoboos.length,
    platforms: countBy(spec.platforms, (platform) => platform.kind),
    loopZones: spec.loopZones.length,
    timedHazardSpawners: spec.timedHazardProjectileSpawners.length,
    transitions: metadataArray(level, "transitions").length,
    vineTransitions: metadataArray(level, "vineTransitions").length,
    hasFallExit: level.metadata.fallExitTransition !== undefined,
    hasCheepFrenzy: level.metadata.cheepFrenzy !== undefined,
    hasFlyingCheepFrenzy: level.metadata.flyingCheepFrenzy !== undefined,
    hasBulletFrenzy: level.metadata.bulletBillFrenzy !== undefined,
    halfwayTileX: level.metadata.halfwayTileX ?? null,
  };
}

describe("official-smb content census", () => {
  const pack = loadOfficialSmbPack();
  const census = Object.fromEntries(
    [...pack.values()]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((level) => [level.name, buildCensus(level)]),
  );

  if (process.env.REGENERATE_SMB_CENSUS !== undefined) {
    writeFileSync(censusPath, `${JSON.stringify(census, null, 1)}\n`);
  }

  it("matches the committed per-level census exactly (all 54 levels)", () => {
    const committed = JSON.parse(readFileSync(censusPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(Object.keys(census).length).toBe(54);
    expect(census).toEqual(committed);
  });

  it("pins well-known original facts on famous levels", () => {
    const level11 = census["smb-1-1"];
    // 1-1: goombas and a single green koopa, no piranha plants (first level).
    expect(level11?.actors["vglc-smb-enemy"]).toBe(16);
    expect(level11?.actors["vglc-smb-koopa"]).toBe(1);
    expect(level11?.piranhaPlants).toBe(0);
    expect(level11?.halfwayTileX).toBe(82);

    // 4-1 is Lakitu's debut; the stream re-seeds him at later screens.
    expect(
      census["smb-4-1"]?.actors["vglc-smb-aerial-throwing-enemy"],
    ).toBeGreaterThanOrEqual(1);

    // Every castle stages exactly one boss.
    for (const name of [
      "smb-1-5",
      "smb-2-5",
      "smb-3-4",
      "smb-4-5",
      "smb-5-4",
      "smb-6-4",
      "smb-7-5",
      "smb-8-4",
    ]) {
      const bosses =
        (census[name]?.actors["vglc-smb-bowser"] ?? 0) +
        (census[name]?.actors["vglc-smb-bowser-hammers"] ?? 0);
      expect(bosses, `${name} boss`).toBe(1);
    }

    // The bridge levels run the leaping-cheep frenzy; water levels swim one.
    expect(census["smb-2-4"]?.hasFlyingCheepFrenzy).toBe(true);
    expect(census["smb-7-4"]?.hasFlyingCheepFrenzy).toBe(true);
    expect(census["smb-2-3"]?.hasCheepFrenzy).toBe(true);
    expect(census["smb-7-3"]?.hasCheepFrenzy).toBe(true);

    // SecondaryHardMode turns on at 5-3: it reuses 1-3's layout with red
    // koopas and offscreen Bullet Bill volleys added.
    expect(census["smb-5-3"]?.hasBulletFrenzy).toBe(true);
    expect(
      census["smb-5-3"]?.actors["vglc-smb-koopa-red"] ?? 0,
    ).toBeGreaterThan(0);
    expect(census["smb-1-4"]?.hasBulletFrenzy).toBe(false);
    expect(census["smb-1-1"]?.hasBulletFrenzy).toBe(false);
  });
});
