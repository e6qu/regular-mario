// Type declarations for the image pin check so the tests get checked signatures.

export type ImagePin = {
  readonly registry: string;
  readonly repository: string;
  readonly hubRepository: string;
  readonly tag: string;
  readonly digest: string;
  readonly paths: Set<string>;
};

export type TagRelease = {
  readonly name: string;
  readonly pushedAt: number;
};

export type PinVerdict = {
  readonly state: "ok" | "HELD" | "DRIFT";
  readonly notes: readonly string[];
};

export function findPins(
  files: Iterable<{ readonly path: string; readonly text: string }>,
): Map<string, ImagePin>;

export function newerTags(
  tag: string,
  candidates: readonly TagRelease[],
): TagRelease[];

export function verdict(input: {
  readonly pinned: string;
  readonly hub: string;
  readonly hubPushedAt: number;
  readonly mirror: string;
  readonly newer: readonly TagRelease[];
  readonly now: number;
}): PinVerdict;
