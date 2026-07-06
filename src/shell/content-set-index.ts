import type { DomainResult } from "../engine/domain/result";
import { fail, succeed } from "../engine/domain/result";
import type { ValidationError } from "../engine/domain/validation-error";
import {
  makeValidationError,
  ValidationErrorCode,
} from "../engine/domain/validation-error";

// The dev-start UI fetches the content-sets index (written by `content-sets
// index`) and populates two dropdowns: asset sets and map sets. This module is
// the pure boundary that turns the fetched JSON into validated dropdown options,
// so the DOM layer only renders already-checked data.

type ContentSetOption = {
  readonly id: string;
  readonly title: string;
  readonly selectable: boolean;
};

export type ContentSetDropdowns = {
  readonly assetSets: readonly ContentSetOption[];
  readonly mapSets: readonly ContentSetOption[];
};

function parseOptions(
  rawEntries: unknown,
  label: string,
  errors: ValidationError[],
): ContentSetOption[] {
  if (!Array.isArray(rawEntries)) {
    errors.push(
      makeValidationError(
        ValidationErrorCode.ContentSetIdentityInvalid,
        `${label} must be an array.`,
        label,
      ),
    );
    return [];
  }

  const options: ContentSetOption[] = [];
  rawEntries.forEach((entry, index) => {
    const candidate = entry as {
      id?: unknown;
      title?: unknown;
      selectable?: unknown;
    };
    const path = `${label}[${index}]`;

    if (typeof candidate.id !== "string" || candidate.id.trim().length === 0) {
      errors.push(
        makeValidationError(
          ValidationErrorCode.ContentSetIdentityInvalid,
          `${path}.id must be a non-empty string.`,
          `${path}.id`,
        ),
      );
      return;
    }

    options.push({
      id: candidate.id,
      title:
        typeof candidate.title === "string" && candidate.title.trim().length > 0
          ? candidate.title
          : candidate.id,
      selectable: candidate.selectable === true,
    });
  });

  return options;
}

export function parseContentSetIndex(
  raw: unknown,
): DomainResult<ContentSetDropdowns, ValidationError> {
  const errors: ValidationError[] = [];

  if (raw === null || typeof raw !== "object") {
    return fail([
      makeValidationError(
        ValidationErrorCode.ContentSetIdentityInvalid,
        "content-set index must be an object.",
        "content-set-index",
      ),
    ]);
  }

  const candidate = raw as { assetSets?: unknown; mapSets?: unknown };
  const assetSets = parseOptions(
    candidate.assetSets,
    "content-set-index.assetSets",
    errors,
  );
  const mapSets = parseOptions(
    candidate.mapSets,
    "content-set-index.mapSets",
    errors,
  );

  if (errors.length > 0) {
    return fail(errors);
  }

  return succeed({ assetSets, mapSets });
}

// The dev UI can only boot a pair where both sides are selectable; this reports
// the default choice (first selectable of each), or a reason none is available.
export function resolveDefaultContentSetSelection(
  dropdowns: ContentSetDropdowns,
):
  | {
      readonly ok: true;
      readonly assetSetId: string;
      readonly mapSetId: string;
    }
  | { readonly ok: false; readonly reason: string } {
  const assetSet = dropdowns.assetSets.find((option) => option.selectable);
  const mapSet = dropdowns.mapSets.find((option) => option.selectable);

  if (assetSet === undefined) {
    return { ok: false, reason: "no selectable asset set" };
  }
  if (mapSet === undefined) {
    return { ok: false, reason: "no selectable map set" };
  }

  return { ok: true, assetSetId: assetSet.id, mapSetId: mapSet.id };
}
