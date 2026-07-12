# 0020: WebGL Renderer Evaluation

## Status

Proposed. The renderer is selectable at runtime (Canvas is the default); a
permanent switch to WebGL is gated on the multi-session work below.

## Context

The game renders through Phaser, which ships both a Canvas-2D and a WebGL
renderer selected by one config field. The project historically used Canvas-2D
(`Phaser.CANVAS`). Canvas-2D fills the whole backing store in software every
frame, so its cost scales with the pixel count; on high-density mobile displays
this is the dominant per-frame cost. WebGL batches sprites on the GPU and is
markedly cheaper there.

To evaluate a switch without risking the default, the renderer choice was
decoupled: `src/shell/select-renderer.ts` resolves a `?renderer=canvas|webgl|auto`
URL parameter (persisted to `localStorage`), defaulting to Canvas. The scene
code is identical under both, so the same URL loaded each way is an exact A/B.
WebGL and Auto set `preserveDrawingBuffer` so the run-thumbnail read-back
(`drawImage`/`toDataURL` off the game canvas) keeps working after compositing,
exactly as under Canvas.

## Findings

### Rendering fidelity — excellent

Matched scenes were captured under each renderer and compared with
`scripts/compare-png-images.mjs`. The in-game scene was captured at an identical
deterministic simulation frame so any difference is purely rendering, not
timing.

- Menu and editor (DOM-heavy): effectively identical (0% and ~0.0005% of pixels
  differ).
- In-game (canvas pixels): about 2% of pixels differ, but the mean absolute RGB
  channel delta across the whole image is **under 1 of 255** — the differing
  pixels are sprite/tile boundary pixels differing by rounding, with only a few
  hard-edge pixels flipping. The two frames are visually indistinguishable.

Conclusion: WebGL is effectively pixel-faithful for this pixel-art game. The
screenshot-regression baselines (`tests/browser/boot.spec.ts`) would need
regenerating for WebGL, but the change is cosmetically negligible.

### Multi-session WebGL context budget — largely mitigated by Phaser's restore

The session system lets several games coexist: suspending a session
(`suspendSession` in `src/main.ts`) sleeps its game loop but only hides the
canvas (`display: none`); it does **not** destroy the Phaser game, so a suspended
session keeps its renderer context alive. There is no cap on the number of
concurrent sessions. Under Canvas-2D this is fine — there is no per-page context
limit. Under WebGL a browser caps live contexts (commonly 8–16) and drops the
oldest when the cap is exceeded.

The concern was that a dropped context would blank a game's canvas with no
recovery. Testing this directly (force a loss with the `WEBGL_lose_context`
extension, then restore — the same sequence a browser performs when reclaiming
the oldest context) shows that **Phaser 4 fully recovers**: it `preventDefault`s
the loss (so the browser will restore) and re-uploads its GL resources on
`webglcontextrestored`. In the app the simulation keeps advancing across the loss
and rendering resumes correctly with no page errors and no dead canvas. This is
guarded by `tests/browser/renderer.spec.ts`.

So the multi-session risk is smaller than first feared: a suspended session whose
context is reclaimed under pressure recovers when it is next shown. The residual
consideration is only pressure/thrash if very many WebGL games are open at once;
proactively releasing a suspended session's context on suspend (and letting
Phaser restore on resume) is an available optimization but is not required for
correctness.

## Decision

Keep Canvas-2D as the default and ship the runtime renderer selector for
evaluation. The two originally-feared blockers are resolved or reduced:

- **Fidelity** is effectively pixel-faithful (above).
- **Context loss** is handled by Phaser's built-in restore, verified in-app and
  guarded by a test — a reclaimed context recovers, so no custom
  `webglcontextlost` handling is required for correctness.

Remaining work before making WebGL the default:

- Regenerate the CI screenshot baselines in (and review them against) the
  environment that captures them, since headless software WebGL can differ from a
  real GPU.
- Optionally, to reduce context pressure with many simultaneous WebGL games,
  release a suspended session's context on suspend and let Phaser restore it on
  resume. Not required for correctness.

## Consequences

- Developers and users can opt into WebGL per session via `?renderer=` to test
  performance on their own devices, with zero risk to the default experience.
- The performance win from WebGL (especially on mobile) remains available but is
  not yet the default.
- The mobile Canvas-2D cost is mitigated independently by capping the device
  pixel ratio on touch devices (see `sizeCanvasToDisplay` in the boot scene).
