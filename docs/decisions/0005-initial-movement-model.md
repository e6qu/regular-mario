# 0005: Initial Movement Model

## Status

Accepted

## Context

The project needs a first movement-state data model before entity/player simulation code can land.

The user requires classic platformer mechanics, but also requires that exact mechanics claims be backed by tests, measurements, documented source references, or facts we can verify. At this stage, the repository does not contain measured movement data and must not copy copyrighted game behavior as an unverified claim.

## Decision

Use original authored seed constants for the first movement model:

- Walk acceleration: `900` pixels per second squared.
- Run acceleration: `1300` pixels per second squared.
- Ground friction: `1600` pixels per second squared.
- Maximum walk speed: `120` pixels per second.
- Maximum run speed: `190` pixels per second.
- Jump launch speed: `360` pixels per second.
- Gravity: `980` pixels per second squared.

These values are placeholders for our own game feel. They are not claims of equivalence to any existing game. Any future claim of exact mechanic matching must be backed by repository-local tests, measurements, or documented allowed sources before replacing or tuning these constants.

## Consequences

- Movement code can depend on strongly typed constants without magic numbers.
- Mechanics tuning remains explicit and testable.
- We avoid representing unverified constants as factual copies of another game.
