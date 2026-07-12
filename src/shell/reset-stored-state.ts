// All of this app's persisted state lives in localStorage under keys beginning
// with this prefix (the renderer choice, the editor's tileset/tutorial-seen
// flags and saved levels, the replay timeline-collapsed flag, and the touch-
// control scale). Resetting removes exactly these, leaving any unrelated keys
// from other apps on the same origin untouched.
export const storedStateKeyPrefix = "regular-mario";

type ResettableStorage = Pick<
  Storage,
  "length" | "key" | "removeItem" | "getItem"
>;

// Return every stored key that belongs to this app (prefix-matched), in a stable
// order. Reads a snapshot of keys first so removal during iteration is safe.
export function storedStateKeys(storage: ResettableStorage): string[] {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null && key.startsWith(storedStateKeyPrefix)) {
      keys.push(key);
    }
  }
  return keys;
}

// Remove all of this app's persisted state and return the number of keys
// removed. Idempotent — calling it again removes nothing and returns 0.
export function resetStoredState(storage: ResettableStorage): number {
  const keys = storedStateKeys(storage);
  for (const key of keys) {
    storage.removeItem(key);
  }
  return keys.length;
}
