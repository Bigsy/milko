import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";

/** Orca caps directly checked WASM assets at 16 MiB. Ship compressed, verified local bytes. */
export function prepareHarper() {
  const source = readFileSync(fileURLToPath(new URL("../node_modules/harper.js/dist/harper_wasm_bg.wasm", import.meta.url)));
  const directory = fileURLToPath(new URL("../.orca/generated/", import.meta.url));
  const output = directory + "/harper.wasm.gz";
  const stamp = directory + "/harper.build.json";
  const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
  const input = { sourceHash: sha256(source), level: 9, node: process.version, zlib: process.versions.zlib };
  try {
    const saved = JSON.parse(readFileSync(stamp, "utf8"));
    if (existsSync(output) && Object.entries(input).every(([key, value]) => saved[key] === value) &&
        saved.outputHash === sha256(readFileSync(output))) return;
  } catch { /* New runtime, missing or damaged cache: regenerate exact local bytes. */ }
  mkdirSync(directory, { recursive: true });
  const compressed = gzipSync(source, { level: input.level });
  writeFileSync(output, compressed);
  writeFileSync(stamp, JSON.stringify({ ...input, outputHash: sha256(compressed) }) + "\n");
}
