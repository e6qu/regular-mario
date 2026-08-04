import type { Brand } from "../engine/domain/brand";

export type MultiplayerPlayerId = Brand<string, "MultiplayerPlayerId">;
export type MultiplayerGameId = Brand<string, "MultiplayerGameId">;
export type MultiplayerSessionId = Brand<string, "MultiplayerSessionId">;
export type MultiplayerAvatarId = Brand<string, "MultiplayerAvatarId">;
export type MultiplayerNickname = Brand<string, "MultiplayerNickname">;

const identifierPattern = /^[a-z][a-z0-9-]*$/;
const nicknameControlCharacterPattern = /[\p{Cc}\p{Cf}]/u;

export const multiplayerMaximumPlayers = 16;
export const multiplayerNicknameMinimumCharacters = 3;
export const multiplayerNicknameMaximumCharacters = 24;
export const multiplayerChatMaximumCharacters = 256;
export const multiplayerChatMessagesPerSecond = 3;
export const multiplayerInputExpiryMilliseconds = 3000;
export const multiplayerAuthoritativeFramesPerSecond = 60;
export const multiplayerSnapshotFramesPerSecond = 20;

export enum MultiplayerGameMode {
  Regular = "regular",
  Revenge = "revenge",
}

export type MultiplayerAvatar = {
  readonly id: MultiplayerAvatarId;
  readonly label: string;
};

function requireIdentifier<Value>(
  value: string,
  path: string,
  make: (accepted: string) => Value,
): Value {
  if (!identifierPattern.test(value)) {
    throw new Error(
      `${path} must start with a lowercase letter and contain only lowercase letters, digits, or hyphens.`,
    );
  }
  return make(value);
}

export function requireMultiplayerPlayerId(value: string): MultiplayerPlayerId {
  return requireIdentifier(
    value,
    "playerId",
    (accepted) => accepted as MultiplayerPlayerId,
  );
}

export function requireMultiplayerGameId(value: string): MultiplayerGameId {
  return requireIdentifier(
    value,
    "gameId",
    (accepted) => accepted as MultiplayerGameId,
  );
}

export function requireMultiplayerSessionId(
  value: string,
): MultiplayerSessionId {
  return requireIdentifier(
    value,
    "sessionId",
    (accepted) => accepted as MultiplayerSessionId,
  );
}

function requireMultiplayerAvatarId(value: string): MultiplayerAvatarId {
  return requireIdentifier(
    value,
    "avatarId",
    (accepted) => accepted as MultiplayerAvatarId,
  );
}

// These are original project identities. Their presentation assets are supplied
// by the browser shell; network state only transports their stable IDs.
export const multiplayerAvatars: readonly MultiplayerAvatar[] = [
  { id: requireMultiplayerAvatarId("castaway"), label: "Castaway" },
  { id: requireMultiplayerAvatarId("tidekeeper"), label: "Tidekeeper" },
  { id: requireMultiplayerAvatarId("brass-scout"), label: "Brass Scout" },
  { id: requireMultiplayerAvatarId("moss-runner"), label: "Moss Runner" },
  { id: requireMultiplayerAvatarId("cloud-sailor"), label: "Cloud Sailor" },
  { id: requireMultiplayerAvatarId("ember-warden"), label: "Ember Warden" },
];

const multiplayerAvatarIds = new Set(
  multiplayerAvatars.map((avatar) => avatar.id),
);

export function requireMultiplayerAvatar(value: string): MultiplayerAvatarId {
  const avatarId = requireMultiplayerAvatarId(value);
  if (!multiplayerAvatarIds.has(avatarId)) {
    throw new Error(
      `avatarId must name a supported original multiplayer avatar.`,
    );
  }
  return avatarId;
}

export function requireMultiplayerNickname(value: string): MultiplayerNickname {
  const normalized = value.trim();
  const characterCount = Array.from(normalized).length;
  if (
    characterCount < multiplayerNicknameMinimumCharacters ||
    characterCount > multiplayerNicknameMaximumCharacters
  ) {
    throw new Error(
      `nickname must contain ${multiplayerNicknameMinimumCharacters}–${multiplayerNicknameMaximumCharacters} characters.`,
    );
  }
  if (nicknameControlCharacterPattern.test(normalized)) {
    throw new Error("nickname must not contain control characters.");
  }
  return normalized as MultiplayerNickname;
}

export function requireMultiplayerGameMode(value: string): MultiplayerGameMode {
  switch (value) {
    case "regular":
      return MultiplayerGameMode.Regular;
    case "revenge":
      return MultiplayerGameMode.Revenge;
    default:
      throw new Error("mode must be regular or revenge.");
  }
}
