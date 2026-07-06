---
name: copyright-safe-original-game
description: Use for audits of original game identity, assets, level design, import boundaries, dependency licenses, and avoiding copyrighted third-party content in the repository.
---

# Copyright-Safe Original Game

Use this skill when adding names, characters, levels, assets, audio, samples, fixtures, importers, docs, screenshots, or dependency/license metadata.

## Rules

- Use original characters, levels, art, audio, names, UI, and story.
- Do not commit ROM files, extracted assets, copyrighted level data, patches, or third-party game dumps.
- Compatibility importers must operate on user-provided local files or documented open fixtures.
- Keep product names and package metadata neutral until an original name is chosen.
- Record licenses for any third-party asset or dependency before adoption.
- Prefer authored fixtures and synthetic test data.

## Checks

- Inspect changed asset and fixture paths.
- Inspect package metadata for copyrighted names or brand signals.
- Confirm `.gitignore` blocks common ROM and generated output file types.
- Confirm source files do not contain bundled copyrighted content.

