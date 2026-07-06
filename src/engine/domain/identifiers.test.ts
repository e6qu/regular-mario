import { describe, expect, it } from "vitest";

import { makeActorId, makeEntityId, makeTileId } from "./identifiers";
import { ValidationErrorCode } from "./validation-error";

describe("identifier constructors", () => {
  it("accepts lowercase slug identifiers", () => {
    expect(makeTileId("ground-1", "tileId")).toEqual({
      ok: true,
      value: "ground-1",
    });
  });

  it("rejects invalid tile IDs", () => {
    expect(makeTileId("Ground", "tileId")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.TileIdInvalid,
          message:
            "tileId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.",
          path: "tileId",
        },
      ],
    });
  });

  it("rejects invalid actor IDs", () => {
    expect(makeActorId("actor_id", "actorId")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.ActorIdInvalid,
          message:
            "actorId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.",
          path: "actorId",
        },
      ],
    });
  });

  it("rejects invalid entity IDs", () => {
    expect(makeEntityId("", "entityId")).toEqual({
      ok: false,
      errors: [
        {
          code: ValidationErrorCode.EntityIdInvalid,
          message:
            "entityId must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.",
          path: "entityId",
        },
      ],
    });
  });
});
