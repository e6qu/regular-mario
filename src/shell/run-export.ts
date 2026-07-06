import type { LevelSpecInput } from "../engine/domain/level-spec";
import type { SimulationInputCommand } from "../engine/simulation/input-command";
import type { PlayerVitalityState } from "../engine/simulation/player-vitality";
import type { BrowserGameBootstrap } from "./browser-level-selection";
import type { RunRecorder } from "./run-recorder";
import type { RunTimelineThumbnail } from "./run-timeline-overlay";
import { buildStoreOnlyZip, type ZipEntry } from "./store-only-zip";

export const runExportVersion = 1;

// A fully self-contained, replayable description of a run: the level data plus
// the per-frame input log. Because the simulation is deterministic, feeding the
// same level + inputs back through stepSimulation reproduces the run exactly
// (see scripts/replay-run.mjs), which is why no screenshots are needed to
// recover it in headless mode.
export type RunExport = {
  readonly version: number;
  readonly level: LevelSpecInput;
  readonly initialPlayerVitality: PlayerVitalityState;
  readonly frameCount: number;
  readonly inputs: readonly SimulationInputCommand[];
};

export function buildRunExport(
  recorder: RunRecorder,
  bootstrap: BrowserGameBootstrap,
): RunExport {
  const log = recorder.toReplayLog();

  return {
    version: runExportVersion,
    level: bootstrap.levelInput,
    initialPlayerVitality: bootstrap.initialPlayerVitality,
    frameCount: log.frameCount,
    inputs: log.inputs,
  };
}

export function serializeRunExport(runExport: RunExport): Uint8Array {
  // No pretty-printing: the payload's `inputs` array holds one command per
  // simulated frame (tens of thousands for a full level) and is machine-read by
  // scripts/replay-run.mjs, so indentation only inflates size and CPU.
  return new TextEncoder().encode(JSON.stringify(runExport));
}

// Decode a `data:image/png;base64,...` URL to raw bytes.
function decodeDataUrlBytes(dataUrl: string): Uint8Array {
  const commaIndex = dataUrl.indexOf(",");
  const base64 = commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

const runZipReadme =
  "This archive contains a recorded run.\n\n" +
  "- run.json: the level plus the per-frame input log. The simulation is\n" +
  "  deterministic, so replaying these inputs reproduces the run exactly.\n" +
  "  Reproduce/inspect it headlessly with: node scripts/replay-run.mjs run.json\n" +
  "- thumbnails/: low-resolution snapshots captured periodically during play.\n";

function paddedFrame(frame: number): string {
  return String(frame).padStart(6, "0");
}

export function buildRunZip(
  runExport: RunExport,
  thumbnails: readonly RunTimelineThumbnail[],
): Uint8Array {
  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { path: "run.json", data: serializeRunExport(runExport) },
    { path: "README.txt", data: encoder.encode(runZipReadme) },
  ];

  for (const thumbnail of thumbnails) {
    entries.push({
      path: `thumbnails/frame-${paddedFrame(thumbnail.frame)}.png`,
      data: decodeDataUrlBytes(thumbnail.imageDataUrl),
    });
  }

  return buildStoreOnlyZip(entries);
}

// Trigger a browser download of raw bytes.
export function downloadBytes(
  fileName: string,
  bytes: Uint8Array,
  mimeType: string,
): void {
  const blob = new Blob([bytes as BlobPart], { type: mimeType });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName;
  // Append before clicking and defer cleanup: revoking synchronously (or with a
  // detached anchor) can cancel a large download in some browsers.
  anchor.style.display = "none";
  document.body.append(anchor);
  anchor.click();
  setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
    anchor.remove();
  }, 0);
}
