import type { Brand } from "./brand";

type NonEmptyString = Brand<string, "NonEmptyString">;

const prohibitedTitleTerms = ["mario", "super mario"];

export type GameTitle = {
  readonly value: NonEmptyString;
};

export function makeGameTitle(value: string): GameTitle {
  const trimmedValue = value.trim();

  if (trimmedValue.length === 0) {
    throw new Error("GameTitle requires non-empty text.");
  }

  if (trimmedValue !== value) {
    throw new Error(
      "GameTitle must not contain leading or trailing whitespace.",
    );
  }

  const normalizedValue = trimmedValue.toLocaleLowerCase("en-US");

  for (const prohibitedTitleTerm of prohibitedTitleTerms) {
    if (normalizedValue.includes(prohibitedTitleTerm)) {
      throw new Error(
        "GameTitle must not contain project-prohibited source-specific terms.",
      );
    }
  }

  return {
    value: trimmedValue as NonEmptyString,
  };
}
