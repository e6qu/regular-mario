// Which costume a player wears. The default is the castaway; player two wears
// the Luigi costume (a green/blue palette swap of the same frames). Kept tiny
// and framework-free so the sprite-key logic is unit-testable without a scene.

export type PlayerCharacter = "castaway" | "luigi";

export const defaultPlayerCharacter: PlayerCharacter = "castaway";

// Parse a character from a query-string value (anything unrecognised is the
// default castaway).
export function parsePlayerCharacter(value: string | null): PlayerCharacter {
  return value === "luigi" ? "luigi" : "castaway";
}

// Prefix the resolved sprite-state candidates with the character so a
// non-default costume looks up its own art first (e.g. "luigi-powered-idle"),
// then falls back to the shared default art when a frame is missing. The
// castaway is the base art, so it needs no prefix.
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
