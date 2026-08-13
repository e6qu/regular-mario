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

/**
 * A change with its path shortened against the one before it.
 *
 * Every change used to carry its whole path from the root, which is what a
 * delta actually spends its bytes on: measured on a live game, 69 bytes of
 * addressing carried 9 bytes of data. Changes arrive in depth-first order, so
 * neighbours share nearly all of their path — `shared` says how many leading
 * parts to reuse from the previous change and `path` carries only the rest.
 *
 * Named tersely on purpose. These three keys repeat once per change, so their
 * spelling is itself a measurable share of the message.
 */
type WireStateDeltaChange = {
  /** Leading path parts reused from the previous change. */
  readonly s?: number;
  /** The remaining path parts, after the shared prefix. */
  readonly p: readonly StateDeltaPathPart[];
  readonly v?: unknown;
  readonly r?: true;
};

export type StateDelta = {
  readonly changes: readonly WireStateDeltaChange[];
};

function sharedPrefixLength(
  left: readonly StateDeltaPathPart[],
  right: readonly StateDeltaPathPart[],
): number {
  const limit = Math.min(left.length, right.length);
  let shared = 0;
  while (shared < limit && left[shared] === right[shared]) {
    shared += 1;
  }
  return shared;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneJson<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

function sameJson(left: unknown, right: unknown): boolean {
  // `collectChanges` recursively compares distinct records and arrays. A
  // JSON.stringify equality check here used to serialise the full simulation
  // state at every recursive level of every 20 Hz receipt, which is both
  // quadratic work and enough short-lived allocation to cause visible frame
  // hitches. Referential equality safely skips immutable shared branches;
  // primitives are the only other values that can be equal at this point.
  return Object.is(left, right);
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
  let previous: readonly StateDeltaPathPart[] = [];
  const wire = changes.map((change) => {
    const shared = sharedPrefixLength(previous, change.path);
    previous = change.path;
    const tail = change.path.slice(shared);
    return {
      ...(shared === 0 ? {} : { s: shared }),
      p: tail,
      ...(change.remove === true ? { r: true as const } : { v: change.value }),
    };
  });
  return { changes: wire };
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

function copyContainer(
  container: JsonRecord | unknown[],
): JsonRecord | unknown[] {
  return Array.isArray(container) ? [...container] : { ...container };
}

function copyPathForChange(
  baseline: unknown,
  path: readonly StateDeltaPathPart[],
): {
  readonly root: JsonRecord | unknown[];
  readonly parent: JsonRecord | unknown[];
} {
  const root = copyContainer(requireContainer(baseline, path));
  let source: unknown = baseline;
  let target: JsonRecord | unknown[] = root;
  for (const part of path.slice(0, -1)) {
    const sourceContainer = requireContainer(source, path);
    const sourceChild = readContainerPart(sourceContainer, part);
    const targetChild = copyContainer(requireContainer(sourceChild, path));
    writeContainerPart(target, part, targetChild);
    source = sourceChild;
    target = targetChild;
  }
  return { root, parent: target };
}

/** Apply a patch without mutating the retained keyframe/baseline. */
export function applyStateDelta<Value>(
  baseline: Value,
  delta: StateDelta,
): Value {
  let result: unknown = baseline;
  // Rebuild each full path from the shared prefix the encoder recorded.
  let previousPath: readonly StateDeltaPathPart[] = [];
  for (const wireChange of delta.changes) {
    const shared = wireChange.s ?? 0;
    if (shared > previousPath.length) {
      throw new Error(
        "State delta reuses more path parts than the previous change had.",
      );
    }
    const change: StateDeltaChange = {
      path: [...previousPath.slice(0, shared), ...wireChange.p],
      ...(wireChange.r === true
        ? { remove: true as const }
        : { value: wireChange.v }),
    };
    previousPath = change.path;
    if (change.path.length === 0) {
      if (change.remove === true) {
        throw new Error("A state delta cannot remove its root.");
      }
      result = cloneJson(change.value);
      continue;
    }
    const copied = copyPathForChange(result, change.path);
    result = copied.root;
    const container = copied.parent;
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
      // The value is taken directly from the freshly parsed delta message, so
      // nothing else holds a reference to it and the applied result is treated
      // as immutable everywhere downstream. Cloning it here meant a full
      // serialise-and-reparse per change — hundreds of them per receipt with a
      // full party — for no ownership the caller did not already have.
      writeContainerPart(container, finalPart, change.value);
    }
  }
  return result as Value;
}

export function stateTransportEncodedBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

/**
 * Whether a delta has been overtaken by state the client already holds.
 *
 * A delta names the snapshot it was built against. If the client has since
 * applied something newer, everything this delta carried is already contained
 * in that newer state and it can simply be dropped.
 *
 * The distinction matters because the alternative is expensive: treating every
 * baseline mismatch as "I have lost sync" makes the client ask for a full
 * keyframe, which is several times the size of the delta, at exactly the moment
 * it was already struggling to keep up. Arriving late is normal on a slow or
 * jittery link; only arriving *ahead* of the client's baseline means something
 * was genuinely missed.
 */
export function isSupersededDelta(
  deltaBaselineSnapshotSequence: number,
  heldSnapshotSequence: number,
): boolean {
  return deltaBaselineSnapshotSequence < heldSnapshotSequence;
}
