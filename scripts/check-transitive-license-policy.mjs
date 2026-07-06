import { execFileSync } from "node:child_process";

const allowedLicenses = new Set([
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MIT",
  "MPL-2.0",
]);

function readLicenseReport() {
  const rawReport = execFileSync("pnpm", ["licenses", "list", "--json"], {
    encoding: "utf8",
  });

  try {
    return JSON.parse(rawReport);
  } catch (error) {
    throw new Error(
      `Unable to parse pnpm license report JSON: ${error.message}`,
      {
        cause: error,
      },
    );
  }
}

function validateLicenseReport(report) {
  if (report === null || Array.isArray(report) || typeof report !== "object") {
    throw new Error("pnpm license report must be a JSON object.");
  }

  for (const [license, packages] of Object.entries(report)) {
    if (!allowedLicenses.has(license)) {
      throw new Error(
        `Transitive dependency license "${license}" is not in the allowed license set.`,
      );
    }

    if (!Array.isArray(packages)) {
      throw new Error(
        `License bucket "${license}" must contain a package array.`,
      );
    }

    for (const packageRecord of packages) {
      validatePackageRecord(license, packageRecord);
    }
  }
}

function validatePackageRecord(license, packageRecord) {
  if (
    packageRecord === null ||
    Array.isArray(packageRecord) ||
    typeof packageRecord !== "object"
  ) {
    throw new Error(
      `License bucket "${license}" contains a malformed package record.`,
    );
  }

  if (
    typeof packageRecord.name !== "string" ||
    packageRecord.name.length === 0
  ) {
    throw new Error(
      `License bucket "${license}" contains a package without a name.`,
    );
  }

  if (
    !Array.isArray(packageRecord.versions) ||
    packageRecord.versions.length === 0
  ) {
    throw new Error(
      `Package "${packageRecord.name}" under license "${license}" has no versions.`,
    );
  }

  for (const version of packageRecord.versions) {
    if (typeof version !== "string" || version.length === 0) {
      throw new Error(
        `Package "${packageRecord.name}" under license "${license}" has an invalid version.`,
      );
    }
  }
}

const report = readLicenseReport();
validateLicenseReport(report);

console.log(
  `transitive license policy ok: ${Object.keys(report).length} license buckets checked`,
);
