/// <reference types="vite/client" />

// Injected by Vite `define` (see vite.config.ts): the deployed commit SHA and
// the build/deploy time as an ISO-8601 UTC string.
declare const __BUILD_SHA__: string;
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  // Set by `build:release` to serve composed content as static relative-path
  // files (public/game-content) instead of via the dev-server cache middleware.
  readonly VITE_STATIC_CONTENT?: string;
}
