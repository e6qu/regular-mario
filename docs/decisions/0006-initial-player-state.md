# 0006: Initial Player State

## Status

Accepted

## Context

The simulation needs a first player-state shape before movement integration can be implemented. The repository already has authored movement seed constants, but player spawn and collider values must also avoid magic numbers and unbacked exact-mechanics claims.

## Decision

Use original authored seed values for the initial player state:

- Spawn position: `16` pixels on x and `56` pixels on y.
- Initial velocity: `0` pixels per second on x and y.
- Collider size: `14` pixels wide and `24` pixels tall.

These values are placeholders for our authored game and are not claims of equivalence to any existing game. The y position places the 24-pixel-tall collider on the authored ground top at 80 pixels. They give tests and future movement work a typed baseline while keeping tuning explicit.

## Consequences

- Player-state construction can use named config instead of hard-coded literals.
- Future tuning can change spawn/collider values in one place.
- Movement integration remains separate from state construction.
