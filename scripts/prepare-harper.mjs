import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BINARYEN_VERSION, getBinaryen } from "./binaryen.mjs";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const FLAGS = ["-Oz", "--strip-debug", "--strip-producers"];
const MAX_WASM_BYTES = 16 * 1024 * 1024;
const signature = (module) => JSON.stringify({
  imports: WebAssembly.Module.imports(module).map((entry) => JSON.stringify(entry)).sort(),
  exports: WebAssembly.Module.exports(module).map((entry) => JSON.stringify(entry)).sort(),
});

/** Keep a regular WASM asset under Orca's limit, with the complete Harper interface. */
export function validateOptimizedWasm(source, optimized) {
  if (optimized.length > MAX_WASM_BYTES) throw new Error("Optimized Harper WASM exceeds Orca's 16 MiB asset limit.");
  if (!WebAssembly.validate(optimized)) throw new Error("Optimized Harper WASM is invalid.");
  if (signature(new WebAssembly.Module(source)) !== signature(new WebAssembly.Module(optimized))) {
    throw new Error("Optimization changed Harper's WASM imports or exports.");
  }
}

export async function prepareHarper({
  sourcePath = fileURLToPath(new URL("../node_modules/harper.js/dist/harper_wasm_bg.wasm", import.meta.url)),
  directory = fileURLToPath(new URL("../.orca/generated/", import.meta.url)),
} = {}) {
  const source = await readFile(sourcePath);
  const output = join(directory, "harper.wasm");
  const stamp = join(directory, "harper.optimized.json");
  const input = { sourceHash: sha256(source), binaryen: BINARYEN_VERSION, flags: FLAGS };
  try {
    const saved = JSON.parse(await readFile(stamp, "utf8"));
    const cached = await readFile(output);
    if (JSON.stringify(saved.input) === JSON.stringify(input) && saved.outputHash === sha256(cached)) {
      validateOptimizedWasm(source, cached);
      return { output, ...saved };
    }
  } catch { /* Missing, stale or damaged cache: regenerate verified bytes. */ }
  await mkdir(directory, { recursive: true });
  const temporary = await mkdtemp(join(directory, ".harper-"));
  try {
    const tool = await getBinaryen();
    const candidate = join(temporary, "harper.wasm");
    const snapshot = join(temporary, "source.wasm");
    await writeFile(snapshot, source);
    execFileSync(tool.executable, [snapshot, ...FLAGS, "-o", candidate], { timeout: 120_000 });
    const optimized = await readFile(candidate);
    validateOptimizedWasm(source, optimized);
    const metadata = { input, outputHash: sha256(optimized), bytes: optimized.length };
    await writeFile(join(temporary, "metadata.json"), JSON.stringify(metadata) + "\n");
    await rename(candidate, output);
    await rename(join(temporary, "metadata.json"), stamp);
    return { output, ...metadata };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
