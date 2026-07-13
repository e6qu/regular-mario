// Realistic AABB box physics for the flung body parts of the explode death
// effect. Each part is an axis-aligned box that falls under gravity, lands on
// (and bounces elastically off) the level's blocks and ground, bounces off the
// sides of walls, and bounces off — and knocks out — live enemies it touches.
// Pure and framework-free so the collision/bounce behaviour is unit-testable;
// the scene owns the sprites and drives one of these per part each frame.

export type DeathPartBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  readonly halfWidth: number;
  readonly halfHeight: number;
};

export type DeathPartBox = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

export type DeathPartPhysicsParams = {
  // Downward velocity added per frame.
  readonly gravity: number;
  // Fraction of speed kept across a bounce (elastic "rubber"; < 1 so bounces
  // decay and never run forever).
  readonly restitution: number;
  // Horizontal damping applied while resting on the ground (so parts don't slide
  // forever).
  readonly friction: number;
  // A bounce slower than this settles to rest instead of bouncing again.
  readonly stopSpeed: number;
  readonly tileSize: number;
};

export type DeathPartStepResult = {
  // Resolved a floor/ceiling this frame (used to damp spin on landing).
  readonly landed: boolean;
  // Resolved a side wall this frame.
  readonly bouncedWall: boolean;
  // Indices (into the enemyBoxes argument) of enemies the part struck this frame.
  readonly hitEnemyIndices: readonly number[];
};

// A tile predicate: true when the tile at (column, row) stops a part. The scene
// passes one that returns false out of bounds, so a part that leaves the level
// keeps falling.
export type SolidTileQuery = (column: number, row: number) => boolean;

function reflect(velocity: number, restitution: number, stopSpeed: number): number {
  return Math.abs(velocity) < stopSpeed ? 0 : -velocity * restitution;
}

function resolveHorizontal(
  body: DeathPartBody,
  isSolidTile: SolidTileQuery,
  params: DeathPartPhysicsParams,
): boolean {
  body.x += body.vx;
  if (body.vx === 0) {
    return false;
  }
  const size = params.tileSize;
  const rowStart = Math.floor((body.y - body.halfHeight) / size);
  const rowEnd = Math.floor((body.y + body.halfHeight - 0.001) / size);
  const movingRight = body.vx > 0;
  const column = Math.floor(
    (movingRight ? body.x + body.halfWidth : body.x - body.halfWidth) / size,
  );
  for (let row = rowStart; row <= rowEnd; row += 1) {
    if (isSolidTile(column, row)) {
      body.x = movingRight
        ? column * size - body.halfWidth
        : (column + 1) * size + body.halfWidth;
      body.vx = reflect(body.vx, params.restitution, params.stopSpeed);
      return true;
    }
  }
  return false;
}

function resolveVertical(
  body: DeathPartBody,
  isSolidTile: SolidTileQuery,
  params: DeathPartPhysicsParams,
): boolean {
  body.y += body.vy;
  if (body.vy === 0) {
    return false;
  }
  const size = params.tileSize;
  const columnStart = Math.floor((body.x - body.halfWidth) / size);
  const columnEnd = Math.floor((body.x + body.halfWidth - 0.001) / size);
  const movingDown = body.vy > 0;
  const row = Math.floor(
    (movingDown ? body.y + body.halfHeight : body.y - body.halfHeight) / size,
  );
  for (let column = columnStart; column <= columnEnd; column += 1) {
    if (isSolidTile(column, row)) {
      body.y = movingDown
        ? row * size - body.halfHeight
        : (row + 1) * size + body.halfHeight;
      body.vy = reflect(body.vy, params.restitution, params.stopSpeed);
      if (movingDown) {
        body.vx *= params.friction;
      }
      return true;
    }
  }
  return false;
}

function overlaps(body: DeathPartBody, box: DeathPartBox): boolean {
  return (
    body.x + body.halfWidth > box.left &&
    body.x - body.halfWidth < box.right &&
    body.y + body.halfHeight > box.top &&
    body.y - body.halfHeight < box.bottom
  );
}

// Push the part out of an enemy box along the shallower penetration axis and
// bounce it off that face.
function resolveEnemy(
  body: DeathPartBody,
  box: DeathPartBox,
  params: DeathPartPhysicsParams,
): void {
  const overlapX = Math.min(
    body.x + body.halfWidth - box.left,
    box.right - (body.x - body.halfWidth),
  );
  const overlapY = Math.min(
    body.y + body.halfHeight - box.top,
    box.bottom - (body.y - body.halfHeight),
  );
  const enemyCentreX = (box.left + box.right) / 2;
  const enemyCentreY = (box.top + box.bottom) / 2;
  if (overlapX < overlapY) {
    body.x += body.x < enemyCentreX ? -overlapX : overlapX;
    body.vx = -body.vx * params.restitution;
  } else {
    body.y += body.y < enemyCentreY ? -overlapY : overlapY;
    body.vy = -body.vy * params.restitution;
  }
}

// Advance one part by a frame: gravity, then axis-separated tile resolution,
// then enemy resolution. Mutates `body` in place and reports what it hit.
export function stepDeathPartBody(
  body: DeathPartBody,
  isSolidTile: SolidTileQuery,
  enemyBoxes: readonly DeathPartBox[],
  params: DeathPartPhysicsParams,
): DeathPartStepResult {
  body.vy += params.gravity;
  const bouncedWall = resolveHorizontal(body, isSolidTile, params);
  const landed = resolveVertical(body, isSolidTile, params);

  const hitEnemyIndices: number[] = [];
  for (let index = 0; index < enemyBoxes.length; index += 1) {
    const box = enemyBoxes[index];
    if (box !== undefined && overlaps(body, box)) {
      resolveEnemy(body, box, params);
      hitEnemyIndices.push(index);
    }
  }

  return { landed, bouncedWall, hitEnemyIndices };
}
