import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { prepareHarper, validateOptimizedWasm } from "./prepare-harper.mjs";

// An actual WASM export returning 42; the second module has the same ABI but returns 43.
const answer = Buffer.from("0061736d010000000105016000017f03020100070a0106616e7377657200000a06010400412a0b", "hex");
const changed = Buffer.from(answer); changed[changed.length - 2] = 43;

test("optimization retains executable behaviour, repairs a changed cache and follows changed source", async () => {
  const root = await mkdtemp(join(tmpdir(), "milko-wasm-test-"));
  try {
    const sourcePath = join(root, "input.wasm");
    await writeFile(sourcePath, answer);
    const options = { sourcePath, directory: join(root, "generated") };
    const first = await prepareHarper(options);
    assert.equal(new WebAssembly.Instance(new WebAssembly.Module(await readFile(first.output))).exports.answer(), 42);
    await writeFile(first.output, changed); // Valid WASM with the wrong content must not be reused.
    const repaired = await prepareHarper(options);
    assert.equal(repaired.outputHash, first.outputHash);
    assert.equal(new WebAssembly.Instance(new WebAssembly.Module(await readFile(repaired.output))).exports.answer(), 42);
    await writeFile(sourcePath, changed);
    const next = await prepareHarper(options);
    assert.notEqual(next.input.sourceHash, first.input.sourceHash);
    assert.equal(new WebAssembly.Instance(new WebAssembly.Module(await readFile(next.output))).exports.answer(), 43);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("invalid, oversized or ABI-changing optimizer output cannot be packaged as Harper", () => {
  assert.throws(() => validateOptimizedWasm(answer, Buffer.from("bad")), /invalid/);
  assert.throws(() => validateOptimizedWasm(answer, Buffer.alloc(16 * 1024 * 1024 + 1)), /16 MiB/);
  const empty = Buffer.from("0061736d01000000", "hex");
  assert.throws(() => validateOptimizedWasm(answer, empty), /imports or exports/);
});

test("the shipped Harper asset matches stock output in independent fresh processes", async () => {
  const prepared = await prepareHarper();
  const fixture = fileURLToPath(new URL("../tests/fixtures/harper-packaging.mjs", import.meta.url));
  const stock = fileURLToPath(new URL("../node_modules/harper.js/dist/harper_wasm_bg.wasm", import.meta.url));
  const run = (path) => JSON.parse(execFileSync(process.execPath, [fixture, path], { encoding: "utf8", timeout: 30_000 }));
  assert.deepEqual(run(prepared.output), run(stock));
  assert.ok(prepared.bytes < 16 * 1024 * 1024);
});
