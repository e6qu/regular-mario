export type MultiplayerAvatarCharacter =
  | "castaway"
  | "luigi"
  | "robot1"
  | "robot2"
  | "robot3"
  | "robot4";

/**
 * Every public multiplayer avatar maps to an authored in-game costume. Keeping
 * this table outside Phaser makes the representation stable for both browser
 * clients and prevents a renderer from substituting a generic bot skin.
 */
const characterByAvatarId: Readonly<
  Record<string, MultiplayerAvatarCharacter>
> = {
  castaway: "castaway",
  tidekeeper: "luigi",
  "brass-scout": "robot1",
  "moss-runner": "robot2",
  "cloud-sailor": "robot3",
  "ember-warden": "robot4",
};

export function requireCharacterForMultiplayerAvatar(
  avatarId: string,
): MultiplayerAvatarCharacter {
  const character = characterByAvatarId[avatarId];
  if (character === undefined) {
    throw new Error(`Unsupported multiplayer avatar: ${avatarId}.`);
  }
  return character;
}
