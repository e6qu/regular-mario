import {
  requireMultiplayerNickname,
  type MultiplayerNickname,
} from "../multiplayer/domain";

/**
 * A readable name for somebody who has just arrived.
 *
 * Everyone used to join as "Guest", so a lobby of four was four Guests and the
 * scoreboard told you nothing about who was who. A name is picked instead, and
 * it is meant to be said out loud rather than merely be unique — a session is
 * two friends shouting at each other, not a database.
 *
 * Both word lists are chosen so that any pairing lands inside the 3–24 character
 * nickname bound with room for the separator: the longest possible result is
 * well short of the limit, so the generator cannot produce a name the domain
 * would reject.
 */

const adjectives = [
  "Brave",
  "Chunky",
  "Dizzy",
  "Eager",
  "Fuzzy",
  "Glum",
  "Hasty",
  "Jolly",
  "Keen",
  "Lucky",
  "Mighty",
  "Nimble",
  "Plucky",
  "Quiet",
  "Rowdy",
  "Sly",
  "Tiny",
  "Wily",
] as const;

const creatures = [
  "Badger",
  "Beetle",
  "Cactus",
  "Donkey",
  "Ferret",
  "Gopher",
  "Hedgehog",
  "Iguana",
  "Jackal",
  "Koala",
  "Lemur",
  "Marmot",
  "Newt",
  "Otter",
  "Puffin",
  "Quokka",
  "Raccoon",
  "Stoat",
  "Toad",
  "Walrus",
] as const;

/** The longest name this can produce, used to prove the bound holds. */
export const longestGeneratedNicknameLength =
  Math.max(...adjectives.map((word) => word.length)) +
  1 +
  Math.max(...creatures.map((word) => word.length));

/**
 * Pick a name. `random` is injected so tests are deterministic rather than
 * flaky-by-construction.
 */
export function makeArrivalNickname(
  random: () => number = Math.random,
): MultiplayerNickname {
  const adjective = adjectives[Math.floor(random() * adjectives.length)];
  const creature = creatures[Math.floor(random() * creatures.length)];
  if (adjective === undefined || creature === undefined) {
    throw new Error("Arrival nickname word lists must not be empty.");
  }
  // Validated rather than asserted: if a word list ever grows past the bound
  // this throws at the point of the mistake instead of shipping a name the
  // profile endpoint would refuse.
  return requireMultiplayerNickname(`${adjective} ${creature}`);
}
