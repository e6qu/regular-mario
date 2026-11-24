// Builds the talk library (src/lib) into lib-dist/, a package ready for `npm pack`:
//   talk.js          mountTalk() and the talk format; imports Phaser (a peer dependency)
//   talk-script.js   the talk format alone, for Node or pages that never mount a talk
//   talk-skin.json   the castaway's sprites as one pack (no levels, no sounds)
//   types/           TypeScript declarations
// Run after `pnpm run build:release-content`, which composes the skin.
//   node scripts/build-talk-library.mjs [version]   (default: the v* tag in GITHUB_REF_NAME)
import { execFileSync } from "node:child_process";
import { copyFileSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "vite";

const root = resolve(import.meta.dirname, "..");
const out = resolve(root, "lib-dist");
const skinDir = resolve(
  root,
  "public/game-content/content-set-bundles/castaway-parody__official-smb",
);
const tag = process.env["GITHUB_REF_NAME"] ?? "";
const version =
  process.argv[2] ??
  (/^v\d+\.\d+\.\d+$/.test(tag) ? tag.slice(1) : "0.0.0-dev");
const rootPackage = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
);
const phaser = rootPackage.dependencies.phaser;

rmSync(out, { recursive: true, force: true });
await build({
  configFile: false,
  root,
  logLevel: "warn",
  // public/ holds the game site's content, not the library's
  publicDir: false,
  build: {
    outDir: out,
    emptyOutDir: false,
    sourcemap: true,
    // consumers minify their own bundle
    minify: false,
    lib: {
      entry: {
        talk: resolve(root, "src/lib/talk.ts"),
        "talk-script": resolve(root, "src/lib/talk-script.ts"),
      },
      formats: ["es"],
    },
    rollupOptions: { external: ["phaser"] },
  },
});

// Vite rewrites the skin's `new URL("./talk-skin.json", import.meta.url)` (unresolved
// while building the library) into a form other bundlers don't recognise; restore
// the standard one, so the consumer's bundler copies talk-skin.json.
const talkModule = resolve(out, "talk.js");
const rewritten = 'new URL("./talk-skin.json", "" + import.meta.url)';
const talkSource = readFileSync(talkModule, "utf8");
if (!talkSource.includes(rewritten)) {
  throw new Error(
    `talk.js no longer contains ${rewritten}; check the skin URL`,
  );
}
writeFileSync(
  talkModule,
  talkSource.replace(rewritten, 'new URL("./talk-skin.json", import.meta.url)'),
);

// The skin: the composed castaway-parody content set, minus its levels and any
// file the remaining manifest does not name.
const manifest = JSON.parse(
  readFileSync(resolve(skinDir, "remote-manifest.json"), "utf8"),
);
const blob = JSON.parse(
  readFileSync(resolve(skinDir, "bundle-blob.json"), "utf8"),
);
const skinManifest = { ...manifest, levels: [] };
const named = new Set();
JSON.stringify(skinManifest, (key, value) => {
  if (value && typeof value === "object" && value.kind === "url") {
    named.add(value.url);
  }
  return value;
});
const files = Object.fromEntries(
  Object.entries(blob.files).filter(([name]) => named.has(name)),
);
const missing = [...named].filter((name) => !(name in files));
if (missing.length > 0) {
  throw new Error(`The skin pack lacks ${missing.join(", ")}`);
}
writeFileSync(
  resolve(out, "talk-skin.json"),
  JSON.stringify({ manifest: skinManifest, files }),
);

execFileSync(
  resolve(root, "node_modules/.bin/tsc"),
  ["-p", resolve(root, "tsconfig.lib.json")],
  { stdio: "inherit" },
);

const types = (entry) => `./types/lib/${entry}.d.ts`;
writeFileSync(
  resolve(out, "package.json"),
  `${JSON.stringify(
    {
      name: "regular-mario",
      version,
      description:
        "Regular Mario's talk mode: play a presentation as an original platformer level, one room per slide.",
      license: rootPackage.license,
      repository: {
        type: "git",
        url: "git+https://github.com/e6qu/regular-mario.git",
      },
      type: "module",
      exports: {
        ".": { types: types("talk"), import: "./talk.js" },
        "./talk-script": {
          types: types("talk-script"),
          import: "./talk-script.js",
        },
        "./talk-skin.json": "./talk-skin.json",
      },
      sideEffects: false,
      peerDependencies: { phaser },
    },
    null,
    2,
  )}\n`,
);
copyFileSync(resolve(root, "LICENSE"), resolve(out, "LICENSE"));
copyFileSync(resolve(root, "docs/talk-library.md"), resolve(out, "README.md"));
console.log(
  `lib-dist: regular-mario@${version}, skin ${String(Object.keys(files).length)} files`,
);
