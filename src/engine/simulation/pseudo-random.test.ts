import { describe, expect, it } from "vitest";

import {
  advancePseudoRandom,
  assertValidPseudoRandomState,
  makeInitialPseudoRandomState,
  pseudoRandomByteForSlot,
} from "./pseudo-random";

describe("pseudo-random", () => {
  it("seeds the register the way SMB's ColdBoot does ($a5, rest zero)", () => {
    expect(makeInitialPseudoRandomState().register).toEqual([
      0xa5, 0, 0, 0, 0, 0, 0,
    ]);
  });

  it("advances one frame by rotating right through the feedback carry", () => {
    // Seed $a5 = 1010_0101: bit 1 is 0, byte 1 bit 1 is 0 -> feedback carry 0.
    // Byte 0 rotates to $52 and pushes its low bit (1) into byte 1's top -> $80.
    const next = advancePseudoRandom(makeInitialPseudoRandomState());
    expect(next.register).toEqual([0x52, 0x80, 0, 0, 0, 0, 0]);
  });

  it("is a pure deterministic function of its state", () => {
    const state = makeInitialPseudoRandomState();
    expect(advancePseudoRandom(state)).toEqual(advancePseudoRandom(state));
  });

  it("keeps the register valid across many advances and never repeats early", () => {
    let state = makeInitialPseudoRandomState();
    const seen = new Set<string>();
    for (let frame = 0; frame < 2000; frame += 1) {
      assertValidPseudoRandomState(state);
      seen.add(state.register.join(","));
      state = advancePseudoRandom(state);
    }
    // A 56-bit LFSR should not cycle within a couple thousand frames.
    expect(seen.size).toBe(2000);
  });

  it("reads register bytes by enemy slot", () => {
    const state = { register: [11, 22, 33, 0, 0, 0, 0] };
    expect(pseudoRandomByteForSlot(state, 0)).toBe(11);
    expect(pseudoRandomByteForSlot(state, 2)).toBe(33);
  });
});
