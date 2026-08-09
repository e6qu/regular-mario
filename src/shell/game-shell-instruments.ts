import { MultiplayerGamePhase } from "../multiplayer/game-runner";

/**
 * The game shell's DOM instruments: what the running game reports about itself.
 *
 * These attributes are how the browser tests observe a live game, and they were
 * written as bare `setAttribute` calls with bare string literals. That allowed
 * three kinds of bad state, all of which produced intermittent
 * `toHaveAttribute` failures rather than honest ones:
 *
 * - **Absent.** Most instruments were only written once the first authoritative
 *   snapshot arrived, so between mounting the shell and that snapshot they did
 *   not exist. A reader could not tell "the game has not said yet" from "the
 *   game says no", and a test that looked too early failed for a reason that had
 *   nothing to do with what it was testing.
 * - **Misspelled.** `data-game-phase` was seeded with the literal `"waiting"`
 *   beside a `MultiplayerGamePhase` enum that already spells it. Two sources of
 *   the same truth, free to drift.
 * - **Collapsed.** The spectator flag was `String(local?.spectator === true)`,
 *   so a snapshot with no entry for this client reported a confident `false` —
 *   indistinguishable from a player who is genuinely still playing.
 *
 * The remedy is a total encoding. Every instrument has an exact value union, so
 * a wrong value cannot be written; every instrument is written when the shell
 * mounts, so absent is not a state a reader can observe; and states like "no
 * local player in this snapshot" get a value of their own instead of borrowing
 * a neighbour's.
 */

/** A value written when the game genuinely has nothing to report yet. */
export const instrumentAbsent = "absent";

export type InstrumentBoolean = "true" | "false";

export function instrumentBoolean(value: boolean): InstrumentBoolean {
  return value ? "true" : "false";
}

/**
 * Whether the local player is watching rather than playing.
 *
 * Three states, not two: a snapshot need not contain this client at all (the
 * moment before a join is acknowledged, or after being dropped), and that is
 * not the same as being an active participant.
 */
type SpectatorInstrument = InstrumentBoolean | typeof instrumentAbsent;

/** Where the local player was painted, or that they were not painted at all. */
export type RenderedPositionInstrument =
  | typeof instrumentAbsent
  | `${number},${number}`;

export function renderedPositionInstrument(
  position: { readonly x: number; readonly y: number } | undefined,
): RenderedPositionInstrument {
  return position === undefined
    ? instrumentAbsent
    : `${Math.round(position.x)},${Math.round(position.y)}`;
}

/**
 * Every instrument the game shell publishes, with the exact values it may take.
 *
 * Adding an instrument here forces a matching initial value below, so a new
 * instrument cannot be introduced in the absent state.
 */
/** Where the other party members were painted, or that there are none. */
export type RemotePositionsInstrument =
  | typeof instrumentAbsent
  | `${number},${number}${string}`;

export function remotePositionsInstrument(
  positions: readonly { readonly x: number; readonly y: number }[],
): RemotePositionsInstrument {
  if (positions.length === 0) {
    return instrumentAbsent;
  }
  const [first, ...rest] = positions;
  if (first === undefined) {
    return instrumentAbsent;
  }
  const encode = (position: {
    readonly x: number;
    readonly y: number;
  }): string => `${Math.round(position.x)},${Math.round(position.y)}`;
  return [encode(first), ...rest.map(encode)].join(
    ";",
  ) as RemotePositionsInstrument;
}

export type GameShellInstruments = {
  "data-game-phase": MultiplayerGamePhase;
  "data-chat-open": InstrumentBoolean;
  "data-menu-open": InstrumentBoolean;
  "data-local-player-spectator": SpectatorInstrument;
  "data-local-player-rendered": RenderedPositionInstrument;
  "data-remote-players-rendered": RemotePositionsInstrument;
};

export function setGameShellInstrument<K extends keyof GameShellInstruments>(
  element: Element,
  name: K,
  value: GameShellInstruments[K],
): void {
  element.setAttribute(name, value);
}

/**
 * The value each instrument holds before the game has anything else to say.
 *
 * Written when the shell is created, so no reader ever meets a missing
 * attribute. The phase comes from the enum rather than a literal, so it cannot
 * disagree with the phase the runner reports a moment later.
 */
const initialGameShellInstruments: GameShellInstruments = {
  "data-game-phase": MultiplayerGamePhase.Waiting,
  "data-chat-open": "false",
  "data-menu-open": "false",
  "data-local-player-spectator": instrumentAbsent,
  "data-local-player-rendered": instrumentAbsent,
  "data-remote-players-rendered": instrumentAbsent,
};

export function mountGameShellInstruments(element: Element): void {
  for (const [name, value] of Object.entries(initialGameShellInstruments)) {
    element.setAttribute(name, value);
  }
}
