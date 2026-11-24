import type Phaser from "phaser";

import type { MusicSong } from "../game-audio";

// What talk mode needs from the running BootScene, passed in its bootstrap: draw the
// slides once the level's objects exist (and again whenever the level is rebuilt), hear
// where the player is after every rendered frame (and frame the room it is in), and get a way to move the player to a
// room. The scene calls these; it holds no talk logic of its own.
export interface TalkSceneHooks {
  readonly decorateWorld: (scene: Phaser.Scene) => void;
  readonly afterRender: (player: TalkPlayerPosition) => void;
  // The x the camera should centre on while the player is at `playerXPixels`.
  readonly roomCenterXPixels: (playerXPixels: number) => number;
  // Talk mode's music: called once with a way to set the looping song; talk mode then
  // sets its world's song whenever the castaway enters a new world.
  readonly bindMusic: (setSong: (song: MusicSong) => void) => void;
  readonly bindMovePlayer: (
    movePlayer: (xPixels: number, yPixels: number) => void,
  ) => void;
}

interface TalkPlayerPosition {
  readonly xPixels: number;
  readonly yPixels: number;
}
