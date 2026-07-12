import { beforeEach, describe, expect, it } from "vitest";

import {
  persistRendererChoice,
  rendererNeedsPreservedDrawingBuffer,
  resolveRendererChoice,
  type RendererChoice,
} from "./select-renderer";

// A minimal in-memory Storage stub for the two methods the resolver uses.
function makeStorage(initial?: Record<string, string>): {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  readonly map: Map<string, string>;
} {
  const map = new Map<string, string>(Object.entries(initial ?? {}));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

describe("resolveRendererChoice", () => {
  let storage: ReturnType<typeof makeStorage>;

  beforeEach(() => {
    storage = makeStorage();
  });

  it("defaults to canvas with no query and no stored preference", () => {
    expect(resolveRendererChoice("", storage)).toBe("canvas");
  });

  it("reads an explicit renderer from the query string", () => {
    expect(resolveRendererChoice("?renderer=webgl", storage)).toBe("webgl");
    expect(resolveRendererChoice("?renderer=auto", storage)).toBe("auto");
    expect(resolveRendererChoice("?renderer=canvas", storage)).toBe("canvas");
  });

  it("persists a query choice so it survives query-less navigation", () => {
    resolveRendererChoice("?renderer=webgl", storage);
    expect(storage.map.get("regular-mario:renderer")).toBe("webgl");
    // A later render with no query keeps the persisted webgl choice.
    expect(resolveRendererChoice("", storage)).toBe("webgl");
  });

  it("lets the query override a stored preference", () => {
    storage.map.set("regular-mario:renderer", "canvas");
    expect(resolveRendererChoice("?renderer=webgl", storage)).toBe("webgl");
  });

  it("ignores an unrecognized renderer value", () => {
    expect(resolveRendererChoice("?renderer=vulkan", storage)).toBe("canvas");
    expect(storage.map.has("regular-mario:renderer")).toBe(false);
  });

  it("falls back to the default when storage is unavailable", () => {
    expect(resolveRendererChoice("", undefined)).toBe("canvas");
    expect(resolveRendererChoice("?renderer=webgl", undefined)).toBe("webgl");
  });

  it("tolerates a malformed search string", () => {
    expect(resolveRendererChoice("not a query", storage)).toBe("canvas");
  });
});

describe("persistRendererChoice", () => {
  it("writes the choice so a later resolve (no query) reads it back", () => {
    const storage = makeStorage();
    persistRendererChoice("webgl", storage);
    expect(resolveRendererChoice("", storage)).toBe("webgl");
  });

  it("is a no-op when storage is unavailable", () => {
    expect(() => persistRendererChoice("auto", undefined)).not.toThrow();
  });
});

describe("rendererNeedsPreservedDrawingBuffer", () => {
  it("preserves the buffer only for the WebGL-capable choices", () => {
    const cases: readonly [RendererChoice, boolean][] = [
      ["canvas", false],
      ["webgl", true],
      ["auto", true],
    ];
    for (const [choice, expected] of cases) {
      expect(rendererNeedsPreservedDrawingBuffer(choice)).toBe(expected);
    }
  });
});
