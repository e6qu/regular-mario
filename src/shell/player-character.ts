// Which costume a player wears. The default is the castaway; the full green
// companion ("luigi") and four distinct Futurama-inspired robots are authored
// costumes, each with its own sprite set (not a palette tint). Kept tiny and
// framework-free so the sprite-key logic is unit-testable without a scene.

export type PlayerCharacter =
  | "castaway"
  | "luigi"
  | "robot1"
  | "robot2"
  | "robot3"
  | "robot4"
  // Revenge-mode protagonists: a tall Goomba and the Princess.
  | "goomba"
  | "princess";

export const defaultPlayerCharacter: PlayerCharacter = "castaway";

// The player characters offered in Revenge mode (you play the stomper): the
// Princess by default, or the tall Goomba.
export const revengePlayerCharacters: readonly PlayerCharacter[] = [
  "princess",
  "goomba",
];
export const defaultRevengePlayerCharacter: PlayerCharacter = "princess";

// The four robot costumes, in the order bots cycle through them, so every bot in
// a crowd reads as a distinct machine.
export const robotPlayerCharacters: readonly PlayerCharacter[] = [
  "robot1",
  "robot2",
  "robot3",
  "robot4",
];

const selectablePlayerCharacters: ReadonlySet<string> =
  new Set<PlayerCharacter>([
    "castaway",
    "luigi",
    "robot1",
    "robot2",
    "robot3",
    "robot4",
    "goomba",
    "princess",
  ]);

// Parse a character from a query-string value (anything unrecognised is the
// default castaway).
export function parsePlayerCharacter(value: string | null): PlayerCharacter {
  return value !== null && selectablePlayerCharacters.has(value)
    ? (value as PlayerCharacter)
    : "castaway";
}

// The robot a co-op bot at a given index wears, cycling through the four robot
// costumes so a stack or crowd of bots stays visually distinct.
export function robotCharacterForBotIndex(index: number): PlayerCharacter {
  const character = robotPlayerCharacters[index % robotPlayerCharacters.length];
  return character ?? "robot1";
}

// Prefix the resolved sprite-state candidates with the character so a
// non-default costume looks up its own art first (e.g. "luigi-powered-idle" or
// "robot2-small-jump"), then falls back to the shared default art when a frame
// is missing. The castaway is the base art, so it needs no prefix.
export function applyCharacterToCandidates(
  candidates: readonly string[],
  character: PlayerCharacter,
): string[] {
  if (character === "castaway") {
    return [...candidates];
  }
  return [
    ...candidates.map((candidate) => `${character}-${candidate}`),
    ...candidates,
  ];
}
