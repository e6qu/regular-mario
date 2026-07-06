export type DomainResult<Value, Failure> =
  | {
      readonly ok: true;
      readonly value: Value;
    }
  | {
      readonly ok: false;
      readonly errors: readonly Failure[];
    };

export function succeed<Value, Failure>(
  value: Value,
): DomainResult<Value, Failure> {
  return {
    ok: true,
    value,
  };
}

export function fail<Value, Failure>(
  errors: readonly Failure[],
): DomainResult<Value, Failure> {
  if (errors.length === 0) {
    throw new Error("Domain failure requires at least one error.");
  }

  return {
    ok: false,
    errors,
  };
}
