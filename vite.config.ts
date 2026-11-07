import { defineConfig } from "vite";
import { publishBuild } from "./scripts/publish-build.mjs";
import { prepareHarper } from "./scripts/prepare-harper.mjs";

prepareHarper();

export default defineConfig({
  root: "src",
  base: "./",
  plugins: [{
    name: "csp-safe-lodash-root",
    transform(_code, id) {
      // Lodash's legacy global lookup contains Function('return this'). Our Chromium target
      // supports globalThis; omit that fallback so Orca's static CSP checks also stay clean.
      if (id.endsWith("/lodash-es/_root.js")) return { code: "export default globalThis;", map: null };
    },
  }, {
    name: "publish-complete-editor",
    apply: "build",
    closeBundle: publishBuild,
  }],
  build: {
    outDir: "../.orca/build",
    emptyOutDir: true,
    target: "chrome120",
    assetsInlineLimit: 0,
  },
  test: {
    include: ["**/*.test.ts"],
    // Exercise the shipped palettes used as runtime CSS strings, rather than Vitest's empty CSS stubs.
    css: { include: [/\/theme\/(crepe|frame|nord)(-dark)?\/style\.css/] },
  },
});
