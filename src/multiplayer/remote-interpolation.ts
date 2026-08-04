export type RemotePlayerPosition = {
  readonly playerId: string;
  readonly x: number;
  readonly y: number;
};

type TimedPosition = RemotePlayerPosition & {
  readonly receivedAtMilliseconds: number;
};

export type RemotePlayerInterpolator = {
  push(
    positions: readonly RemotePlayerPosition[],
    receivedAtMilliseconds: number,
  ): void;
  positions(nowMilliseconds: number): ReadonlyMap<string, RemotePlayerPosition>;
};

export function makeRemotePlayerInterpolator(
  interpolationDelayMilliseconds: number,
): RemotePlayerInterpolator {
  if (!Number.isFinite(interpolationDelayMilliseconds)) {
    throw new Error("Interpolation delay must be finite.");
  }
  const samplesByPlayerId = new Map<
    string,
    { readonly previous: TimedPosition; readonly latest: TimedPosition }
  >();
  return {
    push(positions, receivedAtMilliseconds) {
      for (const position of positions) {
        const latest: TimedPosition = { ...position, receivedAtMilliseconds };
        const prior = samplesByPlayerId.get(position.playerId);
        samplesByPlayerId.set(position.playerId, {
          previous: prior?.latest ?? latest,
          latest,
        });
      }
    },
    positions(nowMilliseconds) {
      const renderAtMilliseconds =
        nowMilliseconds - interpolationDelayMilliseconds;
      return new Map(
        [...samplesByPlayerId.entries()].map(([playerId, samples]) => {
          const span =
            samples.latest.receivedAtMilliseconds -
            samples.previous.receivedAtMilliseconds;
          const progress =
            span <= 0
              ? 1
              : Math.max(
                  0,
                  Math.min(
                    1,
                    (renderAtMilliseconds -
                      samples.previous.receivedAtMilliseconds) /
                      span,
                  ),
                );
          return [
            playerId,
            {
              playerId,
              x:
                samples.previous.x +
                (samples.latest.x - samples.previous.x) * progress,
              y:
                samples.previous.y +
                (samples.latest.y - samples.previous.y) * progress,
            },
          ];
        }),
      );
    },
  };
}
