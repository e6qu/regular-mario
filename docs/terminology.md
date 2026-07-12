# Terminology

The vocabulary used across the code and docs. Two rules govern naming here:

1. **Gameplay elements use their Super Mario Bros. names** (Goomba, Koopa,
   Hammer Bro, flagpole, …). These are the standard, widely understood names for
   the mechanics the project reproduces.
2. **Code constructs use their fully-qualified names** (`stepSimulation`,
   `SimulationState`, `LevelSpec`, `ActorRole.ThrowingEnemy`, …). Docs refer to
   symbols exactly as they appear in the source.

The engine deliberately uses **generic, abstract role names** for actors (an
`ActorRole.Enemy`, not a `Goomba`) so the same code drives any skin. This page
is the bridge between those abstract names and the Super Mario Bros. names.

## Architecture terms

- **Functional core** — the deterministic, pure-function simulation in
  `src/engine/`. See [`architecture.md`](architecture.md).
- **Imperative shell** — the impure browser layer in `src/shell/` and
  `src/main.ts` (rendering, input, audio, persistence).
- **`stepSimulation`** — the core's single entry point; advances the simulation
  by exactly one frame.
- **`SimulationState`** — the complete, immutable snapshot of one frame.
- **`LevelSpec`** — the validated in-memory level (tiles, actor placements,
  timers, spawners) that both the simulation and renderer read.
- **`ActorRole`** — the enum categorizing every placed actor (see the mapping
  below).
- **`BootScene`** — the Phaser scene that runs a game: steps the simulation and
  renders it.
- **Session** — a suspendable pairing of a Phaser game with a level, managed in
  `src/main.ts`.
- **Content set** — a chosen **asset set** (skin) plus **map set** (layouts).
- **Asset set / skin** — the visual and audio expression (sprites, tiles,
  sounds, music). "Shabby Castaway" is the original authored skin.
- **Map set** — the level layouts, independent of the skin.
- **Hurtbox** — the collision box used to resolve harm/defeat between the player
  and an actor. Decoupled from the rendered sprite and from terrain collision.
- **Hitbox** — the rendered/terrain collision box.
- **Tier** — the player's power state: **small**, **powered** (grown), or
  **fire** (can throw fireballs).

## Actors: `ActorRole` → Super Mario Bros. names

The engine's abstract `ActorRole` values map to Super Mario Bros. actors as
follows. The abstract name is what appears in code; the Super Mario Bros. name is
what appears in gameplay docs and comments.

| `ActorRole`            | Super Mario Bros. actor(s)                                |
| ---------------------- | --------------------------------------------------------- |
| `Enemy`                | Goomba (a walker defeated by a stomp)                     |
| `FlyingEnemy`          | Paratroopa / other airborne walkers                       |
| `ChasingEnemy`         | actors that pursue the player                             |
| `ArmoredEnemy`         | Koopa Troopa and Buzzy Beetle (leave a kickable shell)    |
| `ThrowingEnemy`        | Hammer Bro (paces and throws, hops between platform rows) |
| `AerialThrowingEnemy`  | Lakitu (hovers ahead of the player and drops Spinies)     |
| `PiranhaPlant`         | Piranha Plant (rises from and retreats into a pipe)       |
| `Coin`                 | coin                                                      |
| `Item`                 | collectible item                                          |
| `PowerUp`              | growth power-up (small → powered → fire)                  |
| `ExtraLife`            | 1-Up                                                      |
| `InvincibilityPowerUp` | Starman (temporary invincibility)                         |
| `Climbable`            | vine / climbable                                          |
| `Pipe`                 | pipe (enterable travel pipe)                              |
| `Exit`                 | level goal / flagpole finish                              |

Other Super Mario Bros. elements modeled by dedicated simulation modules rather
than an `ActorRole` include **Bullet Bill** (cannon-fired projectile),
**Cheep-cheep** (swimming fish, including the "frenzy" spawner), **Blooper**
(squid), **Podoboo** (lava bubble), **Firebar** (rotating fireball chain),
**Spiny** (a Lakitu's thrown egg that hatches), and **Bowser** (the castle
boss). See the corresponding files in `src/engine/simulation/`.

## Gameplay terms

- **Stomp** — defeating an enemy by landing on it from above.
- **Shell** — the kickable state a Koopa/Buzzy leaves when stomped; a moving
  shell slides and defeats other enemies (a **stomp chain** for escalating
  score).
- **Fireball** — the projectile thrown at the fire tier; arcs under gravity and
  bounces off the ground.
- **Flagpole finish** — the end-of-level pole; grab height sets the score, then
  the player slides down.
- **Frenzy** — an RNG-driven wave spawner (Cheep-cheep frenzy in water levels,
  the aerial Bullet Bill / Lakitu frenzy) modeled deterministically via the
  seeded generator.
- **Warp Zone** — a level region whose pipes jump to other worlds' starts,
  labeled "WELCOME TO WARP ZONE!".

## Session-persistent state (lives, coins, and score)

The **life count**, the **coin total**, and the **score** persist across levels
and deaths within a single play session, and reset only on a new game (after a
game over) — as in the original. This matters because the shell rebuilds a fresh
`SimulationState` for every level advance and retry, which would otherwise reset
all three to their level-start values.

- **Life count** — `SimulationState.livesRemaining`. The engine is authoritative:
  each frame it folds in extra lives from 1-Ups, the every-100-coins threshold,
  and stomp/shell chains, and decrements on the death frame. Starts at
  `initialLivesCount` (three).
- **Session coin total** — `SimulationState.sessionCoinBase` (coins collected in
  prior levels) plus the current level's coins
  (`collectibles.collectedCoinEntityIds`). The every-100-coins 1-Up is computed
  from this total, so it crosses level boundaries; the heads-up display shows the
  total wrapped 0–99, each rollover past 100 having awarded a life.
- **Score** — the whole-session total. Unlike lives and coins it is not an engine
  field; it is derived each frame from the current `SimulationState` (which
  resets per level), so the shell banks each finished level's score into a
  session base at every transition that keeps the score (advance, warp, and a
  retry that is not a fresh game) and displays the base plus the current level's
  score. The score is never lost on death, only on a new game.

The imperative shell (`BootScene`) carries these values across the states it
rebuilds and resets them when a new game begins. The life count and coin total
are read straight from the engine, which owns their rules; only the score's
running total is accumulated in the shell (from engine-computed per-level
scores). The start menu's free level selection is independent of session state —
choosing any level begins a fresh session at three lives, zero coins, and zero
score.

## Acronyms

Well-known acronyms are used as-is; less common ones are expanded on first use.

- **NES** — Nintendo Entertainment System (the target console being reproduced).
- **ROM** — read-only memory; here, a Super Mario Bros. cartridge image supplied
  locally by the developer. Never committed.
- **PPU / APU** — the NES Picture / Audio Processing Units (referenced by the
  reverse-engineering docs).
- **LFSR** — linear-feedback shift register; the structure of the NES
  pseudo-random bit register reproduced in `pseudo-random.ts`.
- **DPR** — device pixel ratio; the display's physical-to-CSS pixel density.
- **VGLC** — the Video Game Level Corpus, a public research corpus of level
  layouts used to cross-check the level decoder.
- **HUD** — heads-up display (the on-screen score/time/coins overlay).
- **RNG** — random number generation (here, always the seeded generator).
- **AGPL** — GNU Affero General Public License, the project's license.

## Related documents

- [`architecture.md`](architecture.md) — how the pieces fit together.
- [`smb-level-format.md`](smb-level-format.md) — the numeric level-data format.
- [`run-recording-format.md`](run-recording-format.md) — replay/export format.
