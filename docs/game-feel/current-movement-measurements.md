# Current Movement Measurements

## Inputs

- Movement constants source: `src/engine/simulation/movement-model.ts`.
- Measurement helper source: `src/engine/simulation/movement-measurements.ts`.
- Authored tile size: `16` pixels.
- Nominal frame duration: `16.666666667` milliseconds.
- Verification test: `src/engine/simulation/movement-model.test.ts`.

## Horizontal Measurements

- Maximum walk speed: `90` pixels per second, or `5.625` tiles per second.
- Maximum run speed: `150` pixels per second, or `9.375` tiles per second.
- Walk acceleration reaches maximum walk speed in `14` nominal frames, or `0.233333333338` seconds.
- Run acceleration reaches maximum run speed in `16` nominal frames, or `0.266666666672` seconds.
- Ground friction stops maximum walk speed in `12` nominal frames, or `0.200000000004` seconds.
- Ground friction stops maximum run speed in `20` nominal frames, or `0.33333333334` seconds.

## Vertical Measurements

- Jump launch speed: `240` pixels per second, or `15` tiles per second.
- Rising-held gravity: `563` pixels per second squared, or `35.1875` tiles per second squared.
- Continuous jump apex estimate: `0.426287744227` seconds, `51.154529307282` pixels, or `3.197158081705` tiles.
- Continuous jump apex estimate crosses after `26` nominal frames.
- Continuous return-to-launch-height estimate: `0.852575488455` seconds, crossing after `52` nominal frames.
- Current discrete simulation samples apex at frame `26`, at `53.173611111158` pixels or `3.323350694447` tiles above launch height.
- Current discrete simulation crosses back through launch height at frame `53`.

## Notes

These are measurements of the current original placeholder constants. They are not claims of equivalence to any existing game.
