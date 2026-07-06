# Run recording, replay & export format

The simulation is a pure function stepped exactly once per frame
(`state = stepSimulation(prevState, inputCommand, movementConstants, levelSpec)`).
A whole play-through is therefore fully determined by the level plus the
per-frame input log — so a run can be reproduced **exactly** by replaying those
inputs, with no need to store screenshots.

## Pause & timeline

Pressing `P` (or dying) pauses the run and shows a timeline scrubber. It records
every run in memory:

- the per-frame input log,
- a full simulation-state snapshot every `runRecorderKeyframeInterval` (300)
  frames, so seeking to any frame replays at most 300 steps,
- a low-resolution canvas thumbnail every 30 frames for the timeline strip.

Seeking replays from the nearest keyframe and re-renders that exact frame.

## `run.json` (Export .json — no screenshots)

A self-contained, replayable description of the run:

```jsonc
{
  "version": 1,
  "level": {
    /* LevelSpecInput — the level's tile/actor data */
  },
  "initialPlayerVitality": { "kind": "small" },
  "frameCount": 293,
  "inputs": [
    {
      "horizontal": "right",
      "jumpPressed": false,
      "runHeld": true,
      "firePressed": false,
      "upHeld": false,
      "downHeld": false,
    },
    // ... one entry per frame
  ],
}
```

`inputs[n]` is the command applied to advance from frame `n` to frame `n+1`.

## `mario-run.zip` (Export .zip — with screenshots)

A dependency-free store-only (uncompressed) ZIP, readable by any standard tool:

- `run.json` — as above,
- `README.txt`,
- `thumbnails/frame-NNNNNN.png` — the periodic low-res snapshots.

## Reproducing a run headlessly (recovering screenshots)

To recover full-resolution screenshots from a `run.json`, replay its inputs
against the **same content set** (so the real sprites are present) and capture
frames. Before the game boots, set the injectable global:

```js
window.__marioReplayInputs = runExport.inputs; // from run.json
```

While it is set, the scene plays back these inputs deterministically instead of
reading the live keyboard (see `resolveReplayInput` in `boot-scene.ts`); once the
log is exhausted it falls back to neutral input. Driving this with Playwright
(select the same asset/map/level, inject the inputs, then screenshot any frame)
reproduces the run pixel-for-pixel — verified end-to-end: a live run and its
replay finish at the identical player position.
