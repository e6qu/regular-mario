import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { defineConfig, type Connect } from "vite";

// Commit SHA + build time baked into the bundle so the deployed site can stamp
// its footer. On GitHub Pages the deploy job exposes GITHUB_SHA; locally we read
// git directly. The timestamp is when this build ran, which on the Pages deploy
// job is effectively the deployment time; the footer formats it in the viewer's
// own timezone.
function resolveBuildCommitSha(): string {
  const actionsSha = process.env["GITHUB_SHA"];
  if (actionsSha !== undefined && actionsSha.trim().length > 0) {
    return actionsSha.trim();
  }
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

const buildCommitSha = resolveBuildCommitSha();
const buildTimestamp = new Date().toISOString();

const userLevelCacheRoutePrefix = "/__user-level-cache/";
const userLevelCacheRoot = resolve(".cache/user-levels");
const contentTypeByExtension = new Map([
  [".json", "application/json"],
  [".txt", "text/plain"],
  [".png", "image/png"],
  [".webp", "image/webp"],
  [".wav", "audio/wav"],
  [".mp3", "audio/mpeg"],
  [".ogg", "audio/ogg"],
]);

function makeUserLevelCacheMiddleware(): Connect.NextHandleFunction {
  return (request, response, next) => {
    const requestUrl = request.url;

    if (requestUrl === undefined) {
      next();
      return;
    }

    const parsedUrl = new URL(requestUrl, "http://127.0.0.1");

    if (!parsedUrl.pathname.startsWith(userLevelCacheRoutePrefix)) {
      next();
      return;
    }

    const relativePath = decodeURIComponent(
      parsedUrl.pathname.slice(userLevelCacheRoutePrefix.length),
    );
    const resolvedPath = resolve(userLevelCacheRoot, relativePath);

    if (
      resolvedPath !== userLevelCacheRoot &&
      !resolvedPath.startsWith(`${userLevelCacheRoot}${sep}`)
    ) {
      response.statusCode = 403;
      response.end("Forbidden user-level cache path.");
      return;
    }

    void readFile(resolvedPath)
      .then((bytes) => {
        response.setHeader(
          "content-type",
          contentTypeByExtension.get(extname(resolvedPath)) ??
            "application/octet-stream",
        );
        response.end(bytes);
      })
      .catch(() => {
        response.statusCode = 404;
        response.end("User-level cache file not found.");
      });
  };
}

export default defineConfig({
  // Relative base so the built site works under any path, including a GitHub
  // Pages project subpath (https://<user>.github.io/<repo>/) with no repo name
  // baked in. Runtime content fetches use page-relative URLs for the same reason.
  base: "./",
  define: {
    __BUILD_SHA__: JSON.stringify(buildCommitSha),
    __BUILD_TIME__: JSON.stringify(buildTimestamp),
  },
  plugins: [
    {
      name: "regular-mario-user-level-cache",
      configureServer(server) {
        server.middlewares.use(makeUserLevelCacheMiddleware());
      },
      configurePreviewServer(server) {
        server.middlewares.use(makeUserLevelCacheMiddleware());
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: 5177,
    strictPort: true,
  },
  preview: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
  },
  build: {
    // Phaser is bundled as one large vendor chunk (~1.4 MB); the app entry is
    // split out so gameplay code stays small and independently cacheable.
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes("node_modules/phaser")) {
            return "phaser";
          }
          return undefined;
        },
      },
    },
  },
});
