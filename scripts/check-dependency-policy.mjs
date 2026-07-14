import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const dependencySections = [
  "dependencies",
  "devDependencies",
  "peerDependencies",
];

const forbiddenDependencySections = ["optionalDependencies"];

const requiredMetadataFields = [
  "name",
  "versionRange",
  "dependencySection",
  "purpose",
  "license",
  "licenseEvidence",
  "agplCompatibility",
  "registry",
  "checkedVersion",
  "checkedVersionPublishedAt",
  "checkedAt",
  "latestCompatibleVersionKnown",
  "wellKnownEvidence",
];

const compatibleLicenseValues = ["compatible"];
// Runtime `dependencies` are bundled into the shipped site and conveyed under
// AGPL-3.0-or-later, so they must use one of these strictly-permissive,
// unambiguously AGPL-compatible licenses.
const conveyedDependencyLicenses = new Set(["Apache-2.0", "ISC", "MIT"]);
// `devDependencies` / `peerDependencies` are build- and test-only tooling that is
// never bundled into the shipped site, so the conveyed-code AGPL-compatibility
// bar does not apply to them. They may additionally use permissive or weak
// (file-level) copyleft licenses that impose no obligation on our
// non-distributed use. See docs/decisions/0021-dev-dependency-license-scope.md.
const nonConveyedDependencyLicenses = new Set([
  ...conveyedDependencyLicenses,
  "MPL-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "0BSD",
]);

function allowedLicensesForSection(dependencySection) {
  return dependencySection === "dependencies"
    ? conveyedDependencyLicenses
    : nonConveyedDependencyLicenses;
}
const minimumPublishAgeMilliseconds = 3 * 24 * 60 * 60 * 1000;
const exactVersionPattern = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;

function readJsonFile(filePath) {
  const raw = readFileSync(filePath, "utf8");
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid JSON in ${filePath}: ${error.message}`, {
      cause: error,
    });
  }
}

function requireStringField(record, fieldName, filePath) {
  if (typeof record[fieldName] !== "string") {
    throw new Error(`${filePath} must define string field "${fieldName}".`);
  }

  if (record[fieldName].trim() !== record[fieldName]) {
    throw new Error(
      `${filePath} field "${fieldName}" must not contain leading or trailing whitespace.`,
    );
  }

  if (record[fieldName].length === 0) {
    throw new Error(`${filePath} field "${fieldName}" must not be empty.`);
  }
}

function requireBooleanField(record, fieldName, filePath) {
  if (typeof record[fieldName] !== "boolean") {
    throw new Error(`${filePath} must define boolean field "${fieldName}".`);
  }
}

function dependencyMetadataFileName(dependencyName) {
  return `${dependencyName.replaceAll("/", "__")}.json`;
}

function readDependencyMetadata(dependencyName) {
  const metadataPath = join(
    "docs",
    "dependencies",
    dependencyMetadataFileName(dependencyName),
  );

  if (!existsSync(metadataPath)) {
    throw new Error(
      `Dependency "${dependencyName}" is missing metadata file ${metadataPath}.`,
    );
  }

  return {
    metadataPath,
    metadata: readJsonFile(metadataPath),
  };
}

function validateDateIsOlderThanThreeDays(value, fieldName, filePath) {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    throw new Error(
      `${filePath} field "${fieldName}" must be an ISO-parseable date.`,
    );
  }

  const age = Date.now() - parsed;

  if (age <= minimumPublishAgeMilliseconds) {
    throw new Error(
      `${filePath} field "${fieldName}" must be more than 3 days old.`,
    );
  }
}

function validateDateIsNotInFuture(value, fieldName, filePath) {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    throw new Error(
      `${filePath} field "${fieldName}" must be an ISO-parseable date.`,
    );
  }

  if (parsed > Date.now()) {
    throw new Error(`${filePath} field "${fieldName}" must not be in future.`);
  }
}

function validateMetadata(
  dependencyName,
  dependencySection,
  versionRange,
  metadataPath,
  metadata,
) {
  for (const fieldName of requiredMetadataFields) {
    if (!(fieldName in metadata)) {
      throw new Error(
        `${metadataPath} is missing required field "${fieldName}".`,
      );
    }
  }

  for (const fieldName of [
    "name",
    "versionRange",
    "dependencySection",
    "purpose",
    "license",
    "licenseEvidence",
    "agplCompatibility",
    "registry",
    "checkedVersion",
    "checkedVersionPublishedAt",
    "checkedAt",
    "wellKnownEvidence",
  ]) {
    requireStringField(metadata, fieldName, metadataPath);
  }

  requireBooleanField(metadata, "latestCompatibleVersionKnown", metadataPath);

  if (metadata.name !== dependencyName) {
    throw new Error(
      `${metadataPath} field "name" must equal "${dependencyName}".`,
    );
  }

  if (metadata.dependencySection !== dependencySection) {
    throw new Error(
      `${metadataPath} field "dependencySection" must equal "${dependencySection}".`,
    );
  }

  if (metadata.versionRange !== versionRange) {
    throw new Error(
      `${metadataPath} field "versionRange" must equal "${versionRange}".`,
    );
  }

  if (!exactVersionPattern.test(versionRange)) {
    throw new Error(
      `${metadataPath} field "versionRange" must be an exact package version.`,
    );
  }

  if (metadata.checkedVersion !== versionRange) {
    throw new Error(
      `${metadataPath} field "checkedVersion" must equal exact version "${versionRange}".`,
    );
  }

  if (!compatibleLicenseValues.includes(metadata.agplCompatibility)) {
    throw new Error(
      `${metadataPath} field "agplCompatibility" must be "compatible".`,
    );
  }

  const allowedLicenses = allowedLicensesForSection(dependencySection);
  if (!allowedLicenses.has(metadata.license)) {
    throw new Error(
      `${metadataPath} field "license" must be one of: ${Array.from(allowedLicenses).join(", ")} for a ${dependencySection} dependency.`,
    );
  }

  if (!metadata.latestCompatibleVersionKnown) {
    throw new Error(
      `${metadataPath} must confirm latestCompatibleVersionKnown is true.`,
    );
  }

  validateDateIsOlderThanThreeDays(
    metadata.checkedVersionPublishedAt,
    "checkedVersionPublishedAt",
    metadataPath,
  );
  validateDateIsNotInFuture(metadata.checkedAt, "checkedAt", metadataPath);
}

function readDependencies(packageJson) {
  const dependencies = [];

  for (const dependencySection of forbiddenDependencySections) {
    if (packageJson[dependencySection] !== undefined) {
      throw new Error(
        `package.json field "${dependencySection}" is forbidden by project policy.`,
      );
    }
  }

  for (const dependencySection of dependencySections) {
    const sectionValue = packageJson[dependencySection];

    if (sectionValue === undefined) {
      continue;
    }

    if (
      sectionValue === null ||
      Array.isArray(sectionValue) ||
      typeof sectionValue !== "object"
    ) {
      throw new Error(
        `package.json field "${dependencySection}" must be an object when present.`,
      );
    }

    for (const [dependencyName, versionRange] of Object.entries(sectionValue)) {
      if (typeof versionRange !== "string") {
        throw new Error(
          `package.json dependency "${dependencyName}" in "${dependencySection}" must use a string version range.`,
        );
      }

      dependencies.push({
        dependencyName,
        dependencySection,
        versionRange,
      });
    }
  }

  return dependencies;
}

function validateNoUnexpectedDependencyMetadata(dependencies) {
  const expectedFiles = new Set(
    dependencies.map((dependency) =>
      dependencyMetadataFileName(dependency.dependencyName),
    ),
  );

  const metadataDir = join("docs", "dependencies");
  const entries = readdirSync(metadataDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isFile()) {
      throw new Error(`${metadataDir}/${entry.name} must be a file.`);
    }

    if (entry.name === "README.md") {
      continue;
    }

    if (!entry.name.endsWith(".json")) {
      throw new Error(
        `${metadataDir}/${entry.name} must be a JSON metadata file or README.md.`,
      );
    }

    if (!expectedFiles.has(entry.name)) {
      throw new Error(
        `${metadataDir}/${entry.name} has no matching dependency in package.json.`,
      );
    }
  }
}

function validatePackageMetadata(packageJson) {
  if (packageJson.license !== "AGPL-3.0-or-later") {
    throw new Error(
      'package.json field "license" must be "AGPL-3.0-or-later".',
    );
  }

  if (packageJson.packageManager !== "pnpm@10.33.3") {
    throw new Error(
      'package.json field "packageManager" must be "pnpm@10.33.3".',
    );
  }
}

const packageJson = readJsonFile("package.json");
validatePackageMetadata(packageJson);

const dependencies = readDependencies(packageJson);

for (const dependency of dependencies) {
  const { metadataPath, metadata } = readDependencyMetadata(
    dependency.dependencyName,
  );
  validateMetadata(
    dependency.dependencyName,
    dependency.dependencySection,
    dependency.versionRange,
    metadataPath,
    metadata,
  );
}

validateNoUnexpectedDependencyMetadata(dependencies);

console.log(
  `dependency policy ok: ${dependencies.length} dependencies checked`,
);
