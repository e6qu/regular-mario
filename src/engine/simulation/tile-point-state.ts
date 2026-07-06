export function assertValidTilePointArray(
  value: unknown,
  collectionName: string,
  positionName: string,
): void {
  if (!Array.isArray(value)) {
    throw new Error(`${collectionName} must be an array.`);
  }

  for (const [index, position] of value.entries()) {
    if (
      typeof position !== "object" ||
      position === null ||
      typeof (position as Readonly<Record<string, unknown>>).x !== "number" ||
      typeof (position as Readonly<Record<string, unknown>>).y !== "number"
    ) {
      throw new Error(
        `${positionName} at index ${index} must have numeric x and y.`,
      );
    }
  }
}
