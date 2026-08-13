// NOTE: This module is intentionally Phaser-free so it stays unit-testable in
// the node test environment (importing Phaser there throws — it needs `window`).
// The choice→Phaser-constant mapping lives in create-game-config.ts.

// The renderer backend Phaser uses. "canvas" is a software 2D fill that
// thumbnail capture reads back directly; "webgl" batches on the GPU (faster,
// especially on mobile); "auto" prefers WebGL and falls back to Canvas when it
// is unavailable.
export type RendererChoice = "canvas" | "webgl" | "auto";

const rendererStorageKey = "regular-mario:renderer";
/**
 * Canvas by default, WebGL by choice.
 *
 * The GPU renderer was tried as the default and measured worse for this game,
 * for a reason specific to it: thumbnail capture and the diagnostic screenshot
 * both read pixels back out of the canvas, which forces
 * `preserveDrawingBuffer` on every WebGL context we create — and that is the
 * flag that costs WebGL its advantage. Measured with two clients sharing a
 * machine, the watching client's rendered frame rate fell from comfortably
 * past 40/s to about 30/s; with one client it was 103 fps against Canvas's
 * 120. The batching win never materialised.
 *
 * What made the 224-column courses affordable was culling the level to the
 * columns on screen, which is renderer-agnostic and already in place. Keep
 * WebGL a first-class choice (the menu selector and `?renderer=`), and revisit
 * the default if the readback requirement ever goes away.
 */
const defaultRenderer: RendererChoice = "canvas";

export function isRendererChoice(
  value: string | null,
): value is RendererChoice {
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

// Persist an explicit renderer choice (e.g. from the start-menu selector). The
// next game created reads it via resolveRendererChoice. Best-effort — storage
// may be unavailable (private mode / disabled).
export function persistRendererChoice(
  choice: RendererChoice,
  storage: Pick<Storage, "setItem"> | undefined,
): void {
  try {
    storage?.setItem(rendererStorageKey, choice);
  } catch {
    // Ignore — the choice simply will not persist across navigation.
  }
}

// True when the chosen renderer may use WebGL (webgl or auto): WebGL discards
// its drawing buffer after compositing unless preserveDrawingBuffer is set, so
// the thumbnail readback would otherwise capture a blank frame.
export function rendererNeedsPreservedDrawingBuffer(
  choice: RendererChoice,
): boolean {
  return choice === "webgl" || choice === "auto";
}
