/**
 * Art for the coin blocks the level editor can paint.
 *
 * The editor bakes the coin count into the tile id (`coin-block-3`,
 * `coin-brick-3`, 1..9) so blocks in one level can hold different amounts and
 * keep their look. Those ids appear in no shipped level file, so nothing pulled
 * them into an asset set and every editor-authored level containing a coin
 * block threw while the scene built — the play-test hung with the canvas up and
 * no clue why.
 *
 * A block reads as a "?" (the renderer stamps the glyph and the count over it);
 * a brick keeps the brick. The range is mirrored from the editor's
 * min/maxCoinBlockCount and pinned by asset-coverage.test.ts, which fails if the
 * two ever drift.
 */

const minCoinBlockCount = 1;
const maxCoinBlockCount = 9;

export function editorCoinBlockTileSprites(blockEntry, brickEntry) {
  const sprites = {};
  for (let count = minCoinBlockCount; count <= maxCoinBlockCount; count += 1) {
    sprites[`coin-block-${String(count)}`] = blockEntry;
    sprites[`coin-brick-${String(count)}`] = brickEntry;
  }
  return sprites;
}
