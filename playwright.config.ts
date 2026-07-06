import { defineConfig } from "@playwright/test";

const previewPort = process.env["PLAYWRIGHT_PORT"] ?? "4173";
const previewUrl = `http://127.0.0.1:${previewPort}`;

export default defineConfig({
  testDir: "tests/browser",
  fullyParallel: false,
  // One retry absorbs transient browser-timing hiccups (canvas readback,
  // animation frames) so they surface as "flaky", not a hard failure; a genuine
  // regression still fails on the retry.
  retries: 1,
  use: {
    baseURL: previewUrl,
  },
  webServer: {
    command: `env -u NO_COLOR pnpm exec vite preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
    url: previewUrl,
    reuseExistingServer: false,
    stdout: "pipe",
    stderr: "pipe",
  },
});
