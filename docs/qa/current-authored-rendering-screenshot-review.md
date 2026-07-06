# Current Authored Rendering Screenshot Review

## Inputs

- Date: 2026-06-26.
- Build served by `pnpm run preview` from the current production bundle.
- Browser capture tool: Playwright Chromium through `@playwright/test`.
- Original review viewport: `400` by `240` pixels.
- Follow-up framing viewport: `400` by `120` pixels.
- Temporary screenshots:
  - `/tmp/regular-mario-initial.png`
  - `/tmp/regular-mario-finish.png`

The screenshot files are temporary QA artifacts and are not repository content.

## Initial Viewport

- The authored sky tile grid, cloud marks, grass strip, stone blocks, player face/scarf details, item shine, and enemy shell/body details are visible.
- The visuals are source-neutral and composed from repo-authored Phaser primitive drawing code.
- The level height is `96` pixels while the viewport height is `240` pixels, leaving a large unused lower band.
- The initial player, item, enemy, stone, hazard, grass, and sky features are visually separable at the current scale.

## Finish Viewport

- The camera scrolls to `scrollX: 112` by the finish state.
- The finish snapshot reports `playerOutcome.kind: "finished"` with `reason: "goal-contact"`.
- The scrolled goal area shows the gate tile edge highlight and the exit actor glow.
- Camera-fixed finish feedback remains visible over the scrolled scene.
- The same unused lower viewport band remains visible.

## Follow-Up

- The follow-up viewport-framing task reduced the browser viewport height from `240` pixels to `120` pixels.
- The follow-up debug snapshot reported `worldHeightPixels: 96`, `viewportHeightPixels: 120`, and a remaining lower band of `24` pixels.
- Keep exact canvas-pixel assertions for deterministic smoke coverage, but add screenshot review notes when visual intent matters more than one pixel coordinate.
