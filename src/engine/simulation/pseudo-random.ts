// A faithful port of Super Mario Bros' PseudoRandom generator: a 56-bit (7-byte)
// linear-feedback shift register seeded once at power-on and advanced exactly
// once per rendered frame. Enemy spawners read individual register bytes by
// enemy-slot index. Reproduced here so the deterministic sim's frenzy spawns
// match the original bit-for-bit (verified against the ROM: seed `lda #$a5`,
// register `$07a7..$07ad`, feedback tap on bit 1 of the two lowest bytes).

export const pseudoRandomRegisterSize = 7;

export type PseudoRandomState = {
  // Exactly `pseudoRandomRegisterSize` bytes, each 0..255.
  readonly register: readonly number[];
};

export function makeInitialPseudoRandomState(): PseudoRandomState {
  // SMB's ColdBoot seeds only the first byte with $a5; the rest are zeroed.
  return { register: [0xa5, 0, 0, 0, 0, 0, 0] };
}

export function assertValidPseudoRandomState(
  candidate: unknown,
): asserts candidate is PseudoRandomState {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error("PseudoRandom state must be an object.");
  }

  const register = (candidate as { register?: unknown }).register;
  if (
    !Array.isArray(register) ||
    register.length !== pseudoRandomRegisterSize ||
    register.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 0xff)
  ) {
    throw new Error(
      `PseudoRandom register must be ${pseudoRandomRegisterSize} bytes in 0..255.`,
    );
  }
}

// Advance the register one step (one frame). Rotates each byte right through a
// carry chain; the carry fed into the top of byte 0 is the XOR of bit 1 of
// bytes 0 and 1 (the LFSR feedback tap).
export function advancePseudoRandom(
  state: PseudoRandomState,
): PseudoRandomState {
  const register = [...state.register];
  const feedbackBit = (register[0]! & 0b10) ^ (register[1]! & 0b10);
  let carry = feedbackBit !== 0 ? 1 : 0;
  for (let index = 0; index < pseudoRandomRegisterSize; index += 1) {
    const outgoingBit = register[index]! & 0b1;
    register[index] = (register[index]! >> 1) | (carry << 7);
    carry = outgoingBit;
  }
  return { register };
}

// Read the register byte an enemy slot consumes (SMB indexes PseudoRandomBitReg
// by enemy-buffer slot). Slots wrap into the register just as the game's does.
export function pseudoRandomByteForSlot(
  state: PseudoRandomState,
  slotIndex: number,
): number {
  return state.register[slotIndex % pseudoRandomRegisterSize]!;
}
