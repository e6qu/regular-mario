import { describe, expect, it } from "vitest";

// The check is an .mjs script (typed via scripts/check-image-pins.d.mts);
// import it dynamically so the test runs against the module CI runs.
const checkModule = import("../../scripts/check-image-pins.mjs");

const now = Date.parse("2026-10-11T12:00:00Z");
const old = now - 24 * 60 * 60 * 1000;
const young = old + 1;
const pinned = `sha256:${"a".repeat(64)}`;
const moved = `sha256:${"b".repeat(64)}`;

describe("check-image-pins", () => {
  it("names the Docker Hub repository each pin copies", async () => {
    const { findPins } = await checkModule;
    const pins = findPins([
      {
        path: "Dockerfile",
        text: `FROM public.ecr.aws/docker/library/node:26-bookworm-slim@${pinned} AS build`,
      },
      {
        path: "publish.yml",
        text: `driver-opts: image=mirror.gcr.io/moby/buildkit:buildx-stable-1@${pinned}`,
      },
      {
        path: "compose.yaml",
        text: "image: public.ecr.aws/docker/library/postgres:17-alpine",
      },
    ]);
    expect(
      [...pins.values()].map((pin) => [pin.hubRepository, pin.tag]),
    ).toEqual([
      ["library/node", "26-bookworm-slim"],
      ["moby/buildkit", "buildx-stable-1"],
    ]);
  });

  it("finds newer releases of the same variant and major version only", async () => {
    const { newerTags } = await checkModule;
    const candidates = [
      "26.11.2-bookworm-slim",
      "26.12.0-bookworm-slim",
      "26.12.0-alpine",
      "27.0.0-bookworm-slim",
      "26.11-bookworm-slim",
      "26.11.0-bookworm-slim",
    ].map((name) => ({ name, pushedAt: old }));
    expect(
      newerTags("26.11.1-bookworm-slim", candidates).map((tag) => tag.name),
    ).toEqual(["26.12.0-bookworm-slim", "26.11.2-bookworm-slim"]);
    expect(newerTags("buildx-stable-1", candidates)).toEqual([]);
    expect(newerTags("26-bookworm-slim", candidates)).toEqual([]);
  });

  it("accepts a current pin the mirror serves", async () => {
    const { verdict } = await checkModule;
    expect(
      verdict({
        pinned,
        hub: pinned,
        hubPushedAt: old,
        mirror: pinned,
        newer: [],
        now,
      }).state,
    ).toBe("ok");
  });

  it("holds a moved tag for 24 hours, then fails", async () => {
    const { verdict } = await checkModule;
    const base = { pinned, hub: moved, mirror: pinned, newer: [], now };
    expect(verdict({ ...base, hubPushedAt: young }).state).toBe("HELD");
    expect(verdict({ ...base, hubPushedAt: old }).state).toBe("DRIFT");
  });

  it("holds a newer release for 24 hours, then fails", async () => {
    const { verdict } = await checkModule;
    const base = { pinned, hub: pinned, hubPushedAt: old, mirror: pinned, now };
    expect(
      verdict({ ...base, newer: [{ name: "26.12.0", pushedAt: young }] }).state,
    ).toBe("HELD");
    expect(
      verdict({ ...base, newer: [{ name: "26.12.0", pushedAt: old }] }).state,
    ).toBe("DRIFT");
  });

  it("fails when the mirror serves another digest", async () => {
    const { verdict } = await checkModule;
    expect(
      verdict({
        pinned,
        hub: pinned,
        hubPushedAt: old,
        mirror: moved,
        newer: [],
        now,
      }).state,
    ).toBe("DRIFT");
  });
});
