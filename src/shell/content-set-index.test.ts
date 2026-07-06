import { describe, expect, it } from "vitest";

import {
  parseContentSetIndex,
  resolveDefaultContentSetSelection,
} from "./content-set-index";

const validIndex = {
  assetSets: [
    {
      id: "rom-smb",
      title: "SMB (ROM)",
      origin: "rom-extracted",
      selectable: true,
    },
    {
      id: "castaway-parody",
      title: "Shabby Castaway",
      origin: "authored",
      selectable: true,
    },
    { id: "broken", title: "Broken", selectable: false },
  ],
  mapSets: [
    { id: "official-smb", title: "SMB 1-1", levelCount: 1, selectable: true },
  ],
};

describe("content set index", () => {
  it("parses index entries into dropdown options", () => {
    const result = parseContentSetIndex(validIndex);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.assetSets.map((option) => option.id)).toEqual([
      "rom-smb",
      "castaway-parody",
      "broken",
    ]);
    expect(result.value.assetSets[2]?.selectable).toBe(false);
    expect(result.value.mapSets[0]?.title).toBe("SMB 1-1");
  });

  it("falls back to the id when a title is missing", () => {
    const result = parseContentSetIndex({
      assetSets: [{ id: "no-title", selectable: true }],
      mapSets: [{ id: "m", selectable: true }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.assetSets[0]?.title).toBe("no-title");
  });

  it("rejects a non-object index", () => {
    expect(parseContentSetIndex("nope").ok).toBe(false);
  });

  it("rejects entries with a blank id", () => {
    const result = parseContentSetIndex({
      assetSets: [{ id: "", selectable: true }],
      mapSets: [],
    });
    expect(result.ok).toBe(false);
  });

  it("picks the first selectable asset and map set as the default", () => {
    const parsed = parseContentSetIndex(validIndex);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    const selection = resolveDefaultContentSetSelection(parsed.value);
    expect(selection.ok).toBe(true);
    if (!selection.ok) {
      return;
    }
    expect(selection.assetSetId).toBe("rom-smb");
    expect(selection.mapSetId).toBe("official-smb");
  });

  it("reports when no selectable set is available", () => {
    const selection = resolveDefaultContentSetSelection({
      assetSets: [{ id: "a", title: "a", selectable: false }],
      mapSets: [{ id: "m", title: "m", selectable: true }],
    });
    expect(selection.ok).toBe(false);
    if (selection.ok) {
      return;
    }
    expect(selection.reason).toContain("asset set");
  });
});
