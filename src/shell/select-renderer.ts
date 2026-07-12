// NOTE: This module is intentionally Phaser-free so it stays unit-testable in
// the node test environment (importing Phaser there throws — it needs `window`).
// The choice→Phaser-constant mapping lives in create-game-config.ts.

// The renderer backend Phaser uses. "canvas" is the historical default (a
// software 2D fill that thumbnail capture reads back directly); "webgl" batches
// on the GPU (faster, especially on mobile); "auto" prefers WebGL and falls
// back to Canvas when it is unavailable.
export type RendererChoice = "canvas" | "webgl" | "auto";

const rendererStorageKey = "regular-mario:renderer";
const defaultRenderer: RendererChoice = "canvas";

function isRendererChoice(value: string | null): value is RendererChoice {
  return value === "canvas" || value === "webgl" || value === "auto";
}

// Resolve the renderer choice from (in priority order) an explicit `?renderer=`
// URL parameter, then a persisted preference, then the default. A URL parameter
// is also persisted so it sticks across in-app navigation (which drops the
// query string) — this makes an A/B fidelity check as simple as loading the
// same URL once with `?renderer=canvas` and once with `?renderer=webgl`.
export function resolveRendererChoice(
  search: string,
  storage: Pick<Storage, "getItem" | "setItem"> | undefined,
): RendererChoice {
  let fromQuery: RendererChoice | undefined;
  try {
    const raw = new URLSearchParams(search).get("renderer");
    if (isRendererChoice(raw)) {
      fromQuery = raw;
    }
  } catch {
    // Malformed search string — ignore and fall through to storage/default.
  }

  if (fromQuery !== undefined) {
    try {
      storage?.setItem(rendererStorageKey, fromQuery);
    } catch {
      // Persistence is best-effort (private mode / disabled storage).
    }
    return fromQuery;
  }

  try {
    const stored = storage?.getItem(rendererStorageKey) ?? null;
    if (isRendererChoice(stored)) {
      return stored;
    }
  } catch {
    // Storage unreadable — fall through to the default.
  }

  return defaultRenderer;
}

// True when the chosen renderer may use WebGL (webgl or auto): WebGL discards
// its drawing buffer after compositing unless preserveDrawingBuffer is set, so
// the thumbnail readback would otherwise capture a blank frame.
export function rendererNeedsPreservedDrawingBuffer(
  choice: RendererChoice,
): boolean {
  return choice === "webgl" || choice === "auto";
}
