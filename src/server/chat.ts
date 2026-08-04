import {
  multiplayerChatMaximumCharacters,
  multiplayerChatMessagesPerSecond,
  type MultiplayerNickname,
  type MultiplayerPlayerId,
} from "../multiplayer/domain";

const retainedChatMessages = 100;

export type ChatMessage = {
  readonly id: number;
  readonly playerId: MultiplayerPlayerId;
  readonly nickname: MultiplayerNickname;
  readonly text: string;
  readonly sentAtMilliseconds: number;
};

export type EphemeralChatRoom = {
  send(
    playerId: MultiplayerPlayerId,
    nickname: MultiplayerNickname,
    text: string,
    nowMilliseconds: number,
  ): ChatMessage;
  messages(): readonly ChatMessage[];
};

export function makeEphemeralChatRoom(): EphemeralChatRoom {
  let nextMessageId = 1;
  let messages: readonly ChatMessage[] = [];
  const timestampsByPlayerId = new Map<MultiplayerPlayerId, number[]>();

  return {
    send(playerId, nickname, text, nowMilliseconds) {
      const normalizedText = text.trim();
      if (normalizedText.length === 0) {
        throw new Error("Chat messages must not be empty.");
      }
      if (normalizedText.length > multiplayerChatMaximumCharacters) {
        throw new Error(
          `Chat messages must be at most ${multiplayerChatMaximumCharacters} characters.`,
        );
      }
      const recentTimestamps = (
        timestampsByPlayerId.get(playerId) ?? []
      ).filter((timestamp) => nowMilliseconds - timestamp < 1000);
      if (recentTimestamps.length >= multiplayerChatMessagesPerSecond) {
        throw new Error(
          `Chat messages are limited to ${multiplayerChatMessagesPerSecond} per second.`,
        );
      }
      recentTimestamps.push(nowMilliseconds);
      timestampsByPlayerId.set(playerId, recentTimestamps);
      const message: ChatMessage = {
        id: nextMessageId,
        playerId,
        nickname,
        text: normalizedText,
        sentAtMilliseconds: nowMilliseconds,
      };
      nextMessageId += 1;
      messages = [...messages, message].slice(-retainedChatMessages);
      return message;
    },
    messages() {
      return messages;
    },
  };
}
