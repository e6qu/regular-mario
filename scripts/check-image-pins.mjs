// Fail when a pinned container image is behind what Docker Hub serves for it.
//
// Every image this repository pulls is a copy of a Docker Hub image, pinned by
// tag and digest: public.ecr.aws/docker/library/<name> for official images and
// mirror.gcr.io/<repository> for the rest, because Docker Hub limits anonymous
// pulls. A digest that never moves rots, so each pin is compared with Docker Hub:
//
//   ok     the pin is the digest Docker Hub serves for its tag, and the mirror
//          serves that digest too
//   HELD   Docker Hub has something newer (a new digest for the tag, or a newer
//          release with the same variant and major version), but it is less
//          than 24 hours old
//   DRIFT  Docker Hub has had something newer for at least 24 hours, or the
//          mirror serves a different digest for the tag than the pin: fails
//
// ECR Public allows one unauthenticated request per second, so requests to it
// are spaced 1.1 seconds apart. Each image costs two Docker Hub requests and one
// or two mirror requests.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

const quarantineMilliseconds = 24 * 60 * 60 * 1000;
const ecrSpacingMilliseconds = 1100;
const pinPattern =
  /(public\.ecr\.aws\/docker\/library|mirror\.gcr\.io)\/([a-z0-9._/-]+):([\w.-]+)@(sha256:[0-9a-f]{64})/g;
const versionPattern = /^(v?)(\d+(?:\.\d+)*)(-[\w.-]+)?$/;
const indexTypes = [
  "application/vnd.oci.image.index.v1+json",
  "application/vnd.docker.distribution.manifest.list.v2+json",
  "application/vnd.oci.image.manifest.v1+json",
  "application/vnd.docker.distribution.manifest.v2+json",
].join(", ");

/** Every pin in the given files, keyed by its full reference. */
export function findPins(files) {
  const found = new Map();
  for (const { path, text } of files) {
    for (const [ref, registry, repository, tag, digest] of text.matchAll(
      pinPattern,
    )) {
      const hubRepository =
        registry === "mirror.gcr.io" && repository.includes("/")
          ? repository
          : `library/${repository}`;
      const pin = found.get(ref) ?? {
        registry,
        repository,
        hubRepository,
        tag,
        digest,
        paths: new Set(),
      };
      pin.paths.add(path);
      found.set(ref, pin);
    }
  }
  return found;
}

/** Newer releases of the same major version and variant as `tag`, newest
 * first. Tags that are not versions (`latest`, `alpine`) have none. */
export function newerTags(tag, candidates) {
  const match = versionPattern.exec(tag);
  if (!match) return [];
  const [, prefix, numbers, suffix = ""] = match;
  const pinned = numbers.split(".").map(Number);
  const newer = [];
  for (const candidate of candidates) {
    const other = versionPattern.exec(candidate.name);
    if (!other || other[1] !== prefix || (other[3] ?? "") !== suffix) continue;
    const version = other[2].split(".").map(Number);
    if (
      version.length === pinned.length &&
      version[0] === pinned[0] &&
      compareVersions(version, pinned) > 0
    ) {
      newer.push({ ...candidate, version });
    }
  }
  return newer
    .sort((a, b) => compareVersions(b.version, a.version))
    .map(({ name, pushedAt }) => ({ name, pushedAt }));
}

function compareVersions(a, b) {
  for (let index = 0; index < a.length; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** Classify one pin. Times are milliseconds since the epoch. */
export function verdict({ pinned, hub, hubPushedAt, mirror, newer, now }) {
  const problems = [];
  const held = [];
  if (hub !== pinned) {
    const since = new Date(hubPushedAt).toISOString();
    if (now - hubPushedAt >= quarantineMilliseconds) {
      problems.push(`Docker Hub has served ${hub} for the tag since ${since}`);
    } else {
      held.push(`Docker Hub moved the tag to ${hub} at ${since}`);
    }
  } else if (mirror !== pinned) {
    problems.push(
      `the mirror serves ${mirror} for the tag, not the pinned digest`,
    );
  }
  const eligible = newer.find(
    (release) => now - release.pushedAt >= quarantineMilliseconds,
  );
  if (eligible) {
    problems.push(
      `newer release ${eligible.name} has been on Docker Hub since ${new Date(eligible.pushedAt).toISOString()}`,
    );
  } else if (newer.length > 0) {
    held.push(
      `newer release ${newer[0].name} is inside the 24-hour quarantine`,
    );
  }
  if (problems.length > 0) return { state: "DRIFT", notes: problems };
  if (held.length > 0) return { state: "HELD", notes: held };
  return { state: "ok", notes: [] };
}

async function request(url, { headers = {}, method = "GET" } = {}) {
  const response = await globalThis.fetch(url, {
    method,
    headers: { "user-agent": "regular-mario-image-pins", ...headers },
    signal: globalThis.AbortSignal.timeout(20_000),
  });
  if (!response.ok)
    throw new Error(`${method} ${url}: HTTP ${response.status}`);
  return response;
}

let lastEcrRequest = 0;
async function ecrRequest(url, options) {
  const wait = lastEcrRequest + ecrSpacingMilliseconds - Date.now();
  if (wait > 0) await sleep(wait);
  try {
    return await request(url, options);
  } finally {
    lastEcrRequest = Date.now();
  }
}

async function mirrorDigest({ registry, repository, tag }) {
  const headers = { accept: indexTypes };
  let response;
  if (registry === "mirror.gcr.io") {
    response = await request(
      `https://mirror.gcr.io/v2/${repository}/manifests/${tag}`,
      { headers, method: "HEAD" },
    );
  } else {
    const scope = encodeURIComponent(
      `repository:docker/library/${repository}:pull`,
    );
    const token = await ecrRequest(
      `https://public.ecr.aws/token/?scope=${scope}&service=public.ecr.aws`,
    );
    headers.authorization = `Bearer ${(await token.json()).token}`;
    response = await ecrRequest(
      `https://public.ecr.aws/v2/docker/library/${repository}/manifests/${tag}`,
      { headers, method: "HEAD" },
    );
  }
  const digest = response.headers.get("docker-content-digest");
  if (!digest) throw new Error(`${registry} returned no digest for ${tag}`);
  return digest;
}

async function hubTag({ hubRepository, tag }) {
  const response = await request(
    `https://hub.docker.com/v2/repositories/${hubRepository}/tags/${encodeURIComponent(tag)}`,
  );
  const body = await response.json();
  const pushedAt = Date.parse(body.tag_last_pushed ?? "");
  if (typeof body.digest !== "string" || Number.isNaN(pushedAt)) {
    throw new Error("Docker Hub returned no digest or push time");
  }
  return { digest: body.digest, pushedAt };
}

async function hubCandidates({ hubRepository, tag }) {
  const match = versionPattern.exec(tag);
  if (!match) return [];
  const name = encodeURIComponent(`${match[1]}${match[2].split(".")[0]}.`);
  const response = await request(
    `https://hub.docker.com/v2/repositories/${hubRepository}/tags?page_size=100&ordering=last_updated&name=${name}`,
  );
  return (await response.json()).results
    .map((row) => ({
      name: row.name,
      pushedAt: Date.parse(row.tag_last_pushed ?? ""),
    }))
    .filter((row) => !Number.isNaN(row.pushedAt));
}

function trackedFiles() {
  const listed = execFileSync(
    "git",
    [
      "grep",
      "-lE",
      "(public\\.ecr\\.aws/docker/library|mirror\\.gcr\\.io)/[a-z0-9._/-]+:[A-Za-z0-9_.-]+@sha256:",
      "--",
      ":!*.md",
    ],
    { encoding: "utf8" },
  );
  return listed
    .split("\n")
    .filter(Boolean)
    .map((path) => ({ path, text: readFileSync(path, "utf8") }));
}

async function main() {
  const now = Date.now();
  const pins = findPins(trackedFiles());
  if (pins.size === 0) {
    console.error(
      "No pinned images found; the check is not looking at anything.",
    );
    process.exitCode = 1;
    return;
  }
  let failed = 0;
  for (const [ref, pin] of [...pins.entries()].sort()) {
    const label = `${ref.replace(/@.*/, "")} (${[...pin.paths].sort().join(", ")})`;
    try {
      const hub = await hubTag(pin);
      const mirror = await mirrorDigest(pin);
      const newer = newerTags(pin.tag, await hubCandidates(pin));
      const { state, notes } = verdict({
        pinned: pin.digest,
        hub: hub.digest,
        hubPushedAt: hub.pushedAt,
        mirror,
        newer,
        now,
      });
      console.log(
        `${state.padEnd(6)} ${label}${notes.map((note) => `\n         ${note}`).join("")}`,
      );
      if (state === "DRIFT") failed += 1;
    } catch (error) {
      console.error(`ERROR  ${label}: could not be checked: ${error.message}`);
      failed += 1;
    }
  }
  if (failed > 0) {
    console.error(
      `${failed} image pin(s) are behind Docker Hub or could not be checked. Bump each one to the digest Docker Hub serves once the mirror serves the same digest.`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`All ${pins.size} pinned images are current or held.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
