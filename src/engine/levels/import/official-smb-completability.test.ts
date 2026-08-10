// Start-to-end completability proof over the committed official-smb pack:
// from every level's player start, a breadth-first search over a conservative
// movement envelope (walk, ledge drops, rise-then-glide jumps, swimming,
// springs, moving lifts, pipe/vine transitions, loop-zone gates) must reach a
// finish (a Goal tile) somewhere in the run. This machine-checks every one of
// the 54 decoded levels without needing the ROM or a browser.

import { describe, expect, it } from "vitest";

import { models, runSearch } from "./official-smb-completability.test-support";

// Each of these runs a breadth-first search over all 54 levels and takes the
// better part of ten seconds on an unloaded machine. Vitest's 5s default left
// them passing or failing on how busy the host was — a flake that says nothing
// about the levels. The budget is generous on purpose: it is a guard against a
// search that has genuinely stopped terminating, not a performance assertion.
const completabilitySearchTimeoutMs = 60_000;

describe("official-smb completability", () => {
  it(
    "every level's start reaches a finish (all 54, no exceptions)",
    () => {
      const failures: string[] = [];
      for (const name of models.keys()) {
        const { finished } = runSearch(name);
        if (!finished) {
          failures.push(name);
        }
      }
      expect(failures, `not completable from: ${failures.join(", ")}`).toEqual(
        [],
      );
    },
    completabilitySearchTimeoutMs,
  );

  it(
    "every sub-area is reachable from some main level",
    () => {
      const reachable = new Set<string>();
      for (const name of models.keys()) {
        if (!/^smb-\d+-\d+$/.test(name)) {
          continue;
        }
        for (const visited of runSearch(name).visitedLevels) {
          reachable.add(visited);
        }
      }
      const unreachable = [...models.keys()].filter(
        (name) => !reachable.has(name),
      );
      expect(
        unreachable,
        `never visited from any main: ${unreachable.join(", ")}`,
      ).toEqual([]);
    },
    completabilitySearchTimeoutMs,
  );
});
