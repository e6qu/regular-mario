import { describe, expect, it } from "vitest";

import { fail, succeed } from "./result";

describe("domain result helpers", () => {
  it("creates success results", () => {
    expect(succeed<number, string>(1)).toEqual({
      ok: true,
      value: 1,
    });
  });

  it("creates failure results", () => {
    expect(fail<number, string>(["invalid"])).toEqual({
      ok: false,
      errors: ["invalid"],
    });
  });

  it("rejects empty failure results", () => {
    expect(() => fail<number, string>([])).toThrow(
      "Domain failure requires at least one error.",
    );
  });
});
