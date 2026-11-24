// Whether the game's sound is muted: one switch for every game and menu in the page,
// remembered in this browser (best-effort: a blocked localStorage just forgets it).
// M toggles it in play; talk mode also shows it as a speaker button.

const storageKey = "regular-mario.muted";
const listeners = new Set<(muted: boolean) => void>();

function readStoredMuted(): boolean {
  try {
    return window.localStorage.getItem(storageKey) === "1";
  } catch {
    return false;
  }
}

let muted = typeof window === "undefined" ? false : readStoredMuted();

export function isAudioMuted(): boolean {
  return muted;
}

function setAudioMuted(next: boolean): void {
  if (next === muted) {
    return;
  }
  muted = next;
  try {
    window.localStorage.setItem(storageKey, next ? "1" : "0");
  } catch {
    // remembered for this page only
  }
  for (const listener of listeners) {
    listener(muted);
  }
}

export function toggleAudioMuted(): void {
  setAudioMuted(!muted);
}

// Calls `listener` on every change; returns the unsubscribe function.
export function onAudioMutedChange(
  listener: (muted: boolean) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
