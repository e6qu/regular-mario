/**
 * JSON-safe delta transport for authoritative multiplayer snapshots.
 *
 * The game/debug API deliberately retains complete snapshots. The realtime
 * stream uses these small structural patches between periodic keyframes so a
 * slow client never receives an endlessly growing history of full states.
 */
type StateDeltaPathPart = string | number;

type StateDeltaChange = {
  readonly path: readonly StateDeltaPathPart[];
  readonly value?: unknown;
  readonly remove?: true;
};

export type StateDelta = {
  readonly changes: readonly StateDeltaChange[];
};

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function collectChanges(
  baseline: unknown,
  target: unknown,
  path: readonly StateDeltaPathPart[],
  changes: StateDeltaChange[],
): void {
  if (sameJson(baseline, target)) {
    return;
  }
  if (Array.isArray(baseline) && Array.isArray(target)) {
    if (baseline.length !== target.length) {
      changes.push({ path, value: cloneJson(target) });
      return;
    }
    for (let index = 0; index < target.length; index += 1) {
      collectChanges(baseline[index], target[index], [...path, index], changes);
    }
    return;
  }
  if (isRecord(baseline) && isRecord(target)) {
    const keys = new Set([...Object.keys(baseline), ...Object.keys(target)]);
    for (const key of keys) {
      if (!(key in target)) {
        changes.push({ path: [...path, key], remove: true });
      } else if (!(key in baseline)) {
        changes.push({ path: [...path, key], value: cloneJson(target[key]) });
      } else {
        collectChanges(baseline[key], target[key], [...path, key], changes);
      }
    }
    return;
  }
  changes.push({ path, value: cloneJson(target) });
}

/** Return a deterministic structural patch from a JSON-safe baseline. */
export function makeStateDelta(baseline: unknown, target: unknown): StateDelta {
  const changes: StateDeltaChange[] = [];
  collectChanges(baseline, target, [], changes);
  return { changes };
}

function requireContainer(
  value: unknown,
  path: readonly StateDeltaPathPart[],
): JsonRecord | unknown[] {
  if (isRecord(value) || Array.isArray(value)) {
    return value;
  }
  throw new Error(`State delta path ${path.join(".")} has no container.`);
}

function readContainerPart(
  container: JsonRecord | unknown[],
  part: StateDeltaPathPart,
): unknown {
  if (Array.isArray(container)) {
    if (typeof part !== "number") {
      throw new Error("State delta array path must use a numeric index.");
    }
    return container[part];
  }
  return container[String(part)];
}

function writeContainerPart(
  container: JsonRecord | unknown[],
  part: StateDeltaPathPart,
  value: unknown,
): void {
  if (Array.isArray(container)) {
    if (typeof part !== "number") {
      throw new Error("State delta array path must use a numeric index.");
    }
    container[part] = value;
    return;
  }
  container[String(part)] = value;
}

/** Apply a patch without mutating the retained keyframe/baseline. */
export function applyStateDelta<Value>(
  baseline: Value,
  delta: StateDelta,
): Value {
  let result: unknown = cloneJson(baseline);
  for (const change of delta.changes) {
    if (change.path.length === 0) {
      if (change.remove === true) {
        throw new Error("A state delta cannot remove its root.");
      }
      result = cloneJson(change.value);
      continue;
    }
    let parent = result;
    for (const part of change.path.slice(0, -1)) {
      parent = readContainerPart(requireContainer(parent, change.path), part);
    }
    const container = requireContainer(parent, change.path);
    const finalPart = change.path.at(-1);
    if (finalPart === undefined) {
      throw new Error("State delta path is empty.");
    }
    if (change.remove === true) {
      if (Array.isArray(container)) {
        throw new Error("State delta cannot remove an array member.");
      }
      delete container[String(finalPart)];
    } else {
      writeContainerPart(container, finalPart, cloneJson(change.value));
    }
  }
  return result as Value;
}

export function stateTransportEncodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
