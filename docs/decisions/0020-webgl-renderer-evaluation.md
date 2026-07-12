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

### Multi-session WebGL context budget — a blocker

The session system lets several games coexist: suspending a session
(`suspendSession` in `src/main.ts`) only hides the canvas (`display: none`); it
does **not** destroy the Phaser game, so a suspended session keeps its renderer
context alive. There is no cap on the number of concurrent sessions, and there is
no `webglcontextlost` / `webglcontextrestored` handling anywhere in the code.

Under Canvas-2D this is fine — there is no per-page context limit. Under WebGL a
browser caps live contexts (commonly 8–16) and drops the oldest when the cap is
exceeded, which would blank a suspended game's canvas with no recovery path.

This is the gating risk for a permanent switch.

## Decision

Keep Canvas-2D as the default and ship the runtime renderer selector for
evaluation. Before making WebGL the default, resolve the multi-session context
budget with one (or a combination) of:

- releasing a suspended game's WebGL context (destroy on suspend, rebuild on
  resume — requires serializing the in-memory replay state);
- capping the number of concurrent WebGL games; and/or
- adding `webglcontextlost` / `webglcontextrestored` handlers that re-upload
  textures.

The CI screenshot baselines must also be regenerated in (and reviewed against)
the environment that captures them, since headless software WebGL can differ from
a real GPU.

## Consequences

- Developers and users can opt into WebGL per session via `?renderer=` to test
  performance on their own devices, with zero risk to the default experience.
- The performance win from WebGL (especially on mobile) remains available but is
  not yet the default.
- The mobile Canvas-2D cost is mitigated independently by capping the device
  pixel ratio on touch devices (see `sizeCanvasToDisplay` in the boot scene).
