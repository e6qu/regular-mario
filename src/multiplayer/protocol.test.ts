import { describe, expect, it } from "vitest";

import {
  multiplayerProtocolVersion,
  requireMultiplayerProtocolVersion,
} from "./protocol";

describe("multiplayer protocol boundary", () => {
  it("accepts only the current explicit protocol version", () => {
    expect(() =>
      requireMultiplayerProtocolVersion(multiplayerProtocolVersion),
    ).not.toThrow();
    expect(() => requireMultiplayerProtocolVersion("0")).toThrow(
      "Unsupported multiplayer protocol version.",
    );
    expect(() => requireMultiplayerProtocolVersion(undefined)).toThrow(
      "Unsupported multiplayer protocol version.",
    );
  });
});
