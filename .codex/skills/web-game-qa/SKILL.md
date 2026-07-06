---
name: web-game-qa
description: Use for browser QA, Playwright coverage, screenshot checks, canvas rendering checks, input smoke tests, viewport behavior, performance smoke checks, and test-pyramid review.
---

# Web Game QA

Use this skill when adding or reviewing browser tests, screenshots, smoke tests, viewport behavior, input checks, accessibility checks, performance checks, or release-readiness gates.

## Rules

- Prefer automated tests for repeatable behavior.
- Use browser tests for browser-specific behavior only.
- Keep core mechanics covered by fast pure tests.
- Verify the canvas is nonblank when the game boots.
- Verify keyboard input reaches the simulation as explicit commands.
- Verify responsive sizing does not distort the simulation state.
- Fail loudly on missing assets, test fixtures, or unexpected browser console errors.

## Checks

- Run fast tests before browser tests when the toolchain exists.
- Capture screenshots for visual regressions when Playwright exists.
- Check desktop and mobile viewport sizes.
- Record any manual game-feel issue in `BUGS.md` or the task notes.

