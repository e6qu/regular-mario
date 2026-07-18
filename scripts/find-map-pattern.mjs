#!/usr/bin/env node
// Locate a structure seen in a screenshot inside the committed map pack.
// Usage:
//   node scripts/find-map-pattern.mjs "BB?B"            (single row, literal)
//   node scripts/find-map-pattern.mjs "$'[]\npP'"       (multi-row, newline-separated)
//   node scripts/find-map-pattern.mjs --file pattern.txt
// `.` in a pattern cell matches any glyph (so `?` blocks stay searchable). Prints every level and (col,row)
// where the pattern occurs, so a screenshot region can be pinned to its exact
// source instead of guessed at.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const packDir = "content/map-sets/official-smb";

function readPattern() {
  const fileFlag = process.argv.indexOf("--file");
  if (fileFlag >= 0) {
    return readFileSync(process.argv[fileFlag + 1], "utf8").replace(/\n+$/, "");
  }
  const raw = process.argv[2];
  if (raw === undefined || raw === "") {
    console.error("Usage: find-map-pattern.mjs <pattern>|--file <path>");
    process.exit(1);
  }
  return raw;
}

const pattern = readPattern().split("\n");
const patternWidth = Math.max(...pattern.map((row) => row.length));

function matchesAt(rows, col, row) {
  for (let pr = 0; pr < pattern.length; pr += 1) {
    const want = pattern[pr];
    const have = rows[row + pr];
    if (have === undefined) return false;
    for (let pc = 0; pc < want.length; pc += 1) {
      const wanted = want[pc];
      if (wanted === ".") continue;
      if (have[col + pc] !== wanted) return false;
    }
  }
  return true;
}

let hits = 0;
for (const file of readdirSync(packDir).filter((f) => f.endsWith(".txt"))) {
  const rows = readFileSync(join(packDir, file), "utf8").split("\n");
  const width = rows[0]?.length ?? 0;
  for (let row = 0; row + pattern.length <= rows.length; row += 1) {
    for (let col = 0; col + patternWidth <= width; col += 1) {
      if (matchesAt(rows, col, row)) {
        console.log(`${file.replace(".txt", "")} @ col ${col}, row ${row}`);
        hits += 1;
      }
    }
  }
}
console.log(hits === 0 ? "no matches" : `${hits} match(es)`);
