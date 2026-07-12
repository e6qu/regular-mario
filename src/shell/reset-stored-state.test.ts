import { describe, expect, it } from "vitest";

import {
  resetStoredState,
  storedStateKeyPrefix,
  storedStateKeys,
} from "./reset-stored-state";

// A minimal in-memory localStorage stub for the reset helpers.
function makeStorage(initial: Record<string, string>): Storage {
  const map = new Map<string, string>(Object.entries(initial));
  return {
    get length() {
      return map.size;
    },
    key: (index: number) => [...map.keys()][index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

describe("reset-stored-state", () => {
  it("lists only this app's prefixed keys", () => {
    const storage = makeStorage({
      [`${storedStateKeyPrefix}:renderer`]: "webgl",
      [`${storedStateKeyPrefix}-editor-levels`]: "[]",
      "some-other-app:setting": "keep-me",
    });

    expect(storedStateKeys(storage).sort()).toEqual([
      `${storedStateKeyPrefix}-editor-levels`,
      `${storedStateKeyPrefix}:renderer`,
    ]);
  });

  it("removes every prefixed key and leaves unrelated keys intact", () => {
    const storage = makeStorage({
      [`${storedStateKeyPrefix}:renderer`]: "webgl",
      [`${storedStateKeyPrefix}.editor.tileset`]: "shabby",
      [`${storedStateKeyPrefix}:touch-control-scale`]: "1.2",
      unrelated: "keep-me",
    });

    const removed = resetStoredState(storage);

    expect(removed).toBe(3);
    expect(storedStateKeys(storage)).toEqual([]);
    expect(storage.getItem("unrelated")).toBe("keep-me");
  });

  it("is idempotent — a second reset removes nothing", () => {
    const storage = makeStorage({
      [`${storedStateKeyPrefix}:renderer`]: "auto",
    });

    expect(resetStoredState(storage)).toBe(1);
    expect(resetStoredState(storage)).toBe(0);
  });
});
