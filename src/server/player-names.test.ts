import { describe, expect, it } from "vitest";

import {
  longestGeneratedNicknameLength,
  makeArrivalNickname,
} from "./player-names";

describe("arrival nicknames", () => {
  // Everyone arrived as "Guest", so a lobby of four was four Guests.
  it("does not hand everybody the same name", () => {
    // A fixed sequence rather than Math.random: a test that samples randomness
    // is a test that fails on someone else's machine one run in a hundred.
    const names = new Set<string>();
    for (let index = 0; index < 8; index += 1) {
      const values = [index / 8, (index * 3) / 8 - Math.floor((index * 3) / 8)];
      let call = 0;
      names.add(makeArrivalNickname(() => values[call++ % values.length] ?? 0));
    }
    expect(names.size).toBeGreaterThan(1);
  });

  it("always produces a name the domain accepts", () => {
    // requireMultiplayerNickname enforces 3–24 characters; the generator calls
    // it, so an over-long word list fails here rather than at a player's join.
    for (let index = 0; index < 200; index += 1) {
      const nickname = makeArrivalNickname();
      expect(nickname.length).toBeGreaterThanOrEqual(3);
      expect(nickname.length).toBeLessThanOrEqual(24);
    }
  });

  it("cannot outgrow the nickname bound by construction", () => {
    // Guards the word lists themselves: adding "Extraordinarily Hippopotamus"
    // fails here instead of only on the unlucky player who is dealt it.
    expect(longestGeneratedNicknameLength).toBeLessThanOrEqual(24);
  });

  it("picks both halves from the random source", () => {
    const lowest = makeArrivalNickname(() => 0);
    const highest = makeArrivalNickname(() => 0.999);
    expect(lowest).not.toBe(highest);
    expect(lowest.split(" ")).toHaveLength(2);
  });
});
