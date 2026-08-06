export const multiplayerProtocolVersion = "1";

export function requireMultiplayerProtocolVersion(value: unknown): void {
  if (value !== multiplayerProtocolVersion) {
    throw new Error("Unsupported multiplayer protocol version.");
  }
}
