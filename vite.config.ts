import { defineConfig } from "vite";
import { publishBuild } from "./scripts/publish-build.mjs";
import { prepareHarper } from "./scripts/prepare-harper.mjs";

await prepareHarper();

export default defineConfig({
  root: "src",
  base: "./",
  css: {
    postcss: {
      plugins: [{
        postcssPlugin: "katex-woff2-only",
        Declaration(declaration: { prop: string; value: string }) {
          if (declaration.prop !== "src" || !declaration.value.includes("KaTeX_") || !declaration.value.includes("woff2")) return;
          // Chromium 120 supports WOFF2; omit unused native-font fallbacks.
          declaration.value = declaration.value.replace(/,\s*url\([^)]*\)\s*format\(["'](?:woff|truetype)["']\)/g, "");
        },
      }],
    },
  },
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
