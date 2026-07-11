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

// A deterministic FNV-1a digest of the full tile grid. Storing every tile
// position for all 54 levels would bloat the census to ~140k entries; the
// digest still fails loudly if any single tile moves, is added, or is dropped,
// while the actor/mechanism layouts below pin the dynamic elements exactly.
function tileGridDigest(rows: readonly (readonly string[])[]): string {
  let hash = 0x811c9dc5;
  const joined = rows.map((row) => row.join(",")).join("\n");
  for (let index = 0; index < joined.length; index += 1) {
    hash ^= joined.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
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
    // Precise positions of every dynamic element, sorted so the digest is
    // order-independent. Any element that shifts by a single tile breaks the
    // committed layout — positions are pinned, not just counts.
    layout: {
      actors: placedActors
        .map(
          (actor) => `${actor.actorId}@${actor.position.x},${actor.position.y}`,
        )
        .sort(),
      pipes: spec.pipes
        .map(
          (pipe) =>
            `${pipe.actorId}@${pipe.position.x},${pipe.position.y}:${pipe.entryDirection}` +
            `>${pipe.targetLevelName ?? "self"}` +
            `@${pipe.targetTilePosition.x},${pipe.targetTilePosition.y}`,
        )
        .sort(),
      firebars: spec.firebars
        .map(
          (firebar) =>
            `${firebar.anchorTileX},${firebar.anchorTileY}x${firebar.orbCount}:` +
            `${firebar.direction}/${firebar.speed}`,
        )
        .sort(),
      podoboos: spec.podoboos
        .map((podoboo) => `${podoboo.tileX}@${podoboo.phaseOffsetFrames}`)
        .sort(),
      platforms: spec.platforms
        .map(
          (platform) =>
            `${platform.kind}@${platform.tileX},${platform.tileY}w${platform.widthTiles}` +
            `${platform.balancePartnerId === undefined ? "" : `~${platform.balancePartnerId}`}`,
        )
        .sort(),
      loopZones: spec.loopZones
        .map(
          (zone) =>
            `${zone.checkTileX}[${zone.requiredRowMin}-${zone.requiredRowMax}]` +
            `${zone.groupId}/${zone.groupSize}`,
        )
        .sort(),
      spawners: spec.timedHazardProjectileSpawners
        .map(
          (spawner) =>
            `${spawner.position.x},${spawner.position.y}:${spawner.direction}` +
            `@${spawner.intervalFrames}`,
        )
        .sort(),
      tileGridDigest: tileGridDigest(spec.tiles),
    },
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

  it("pins an exact position for every dynamic element in every level", () => {
    for (const [name, entry] of Object.entries(census)) {
      const actorTotal = Object.values(entry.actors).reduce(
        (sum, count) => sum + count,
        0,
      );
      // Every placed actor contributes exactly one pinned position.
      expect(entry.layout.actors.length, `${name} actor positions`).toBe(
        actorTotal,
      );
      expect(entry.layout.firebars.length, `${name} firebars`).toBe(
        entry.firebars,
      );
      expect(entry.layout.podoboos.length, `${name} podoboos`).toBe(
        entry.podoboos,
      );
      expect(entry.layout.loopZones.length, `${name} loop zones`).toBe(
        entry.loopZones,
      );
      // The tile grid is fingerprinted so any moved/added/dropped tile fails.
      expect(entry.layout.tileGridDigest, `${name} tile digest`).toMatch(
        /^[0-9a-f]{8}$/,
      );
    }
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
