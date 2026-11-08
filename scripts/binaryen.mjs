import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

export const BINARYEN_VERSION = "133";
const builds = {
  "darwin-arm64": ["arm64-macos", "ad66da82ac13f163e424b1643f16c6dfcccc98b5966296b43e52d3cab04f84a8", 580039733],
  "darwin-x64": ["x86_64-macos", "13a9b90be775c6389ce3d1f879cb8627bea56708ba8c122983941d53a8199b95", 580039734],
  "linux-x64": ["x86_64-linux", "2dc9c7813f5375db93d96ead4b78222fcc3e2677bbb832297af4797782a37489", 580050094],
  "linux-arm64": ["aarch64-linux", "89c07ea56faf38d0fbecf36ca8ec0721756716185f265b568e133d427f299bf8", 580038503],
  "win32-x64": ["x86_64-windows", "17a2cbeac6b5693c5fbafab3838d3c65fd9c1eb38b05f5baec6c657e8c84995b", 580050907],
  "win32-arm64": ["arm64-windows", "492a8e1847a0be1554bb9a7f384227981d60bc013aedc02d8ba1372c3943178c", 580043231],
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** Retry transient transport failures, always checking the pinned bytes before use. */
export async function downloadVerifiedArchive(url, expectedHash, { request = fetch, wait = delay } = {}) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const target = new URL(url);
    // Ask for a fresh redirect after a gateway error instead of reusing an expired/cached one.
    if (attempt) target.searchParams.set("milko_retry", `${Date.now()}-${attempt}`);
    let response;
    let bytes;
    try {
      response = await request(target.href, {
        headers: { Accept: "application/octet-stream" },
        signal: AbortSignal.timeout(120_000), cache: "no-store",
      });
      if (response.ok) bytes = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      if (attempt === 2) throw error;
      await wait(1000 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      if (sha256(bytes) !== expectedHash) throw new Error("Binaryen archive checksum mismatch.");
      return bytes;
    }
    await response.body?.cancel();
    if (attempt === 2 || ![429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error(`Could not download Binaryen: HTTP ${response.status}.`);
    }
    console.warn(`Binaryen download returned HTTP ${response.status}; retrying verified download…`);
    await wait(1000 * 2 ** attempt);
  }
}

/** Build tool only: verified official release, cached outside the distributed plugin. */
export async function getBinaryen() {
  const build = builds[`${process.platform}-${process.arch}`];
  if (!build) throw new Error(`No pinned Binaryen build for ${process.platform}-${process.arch}.`);
  const [platform, archiveHash, assetId] = build;
  const tools = fileURLToPath(new URL("../.orca/tools/", import.meta.url));
  const directory = join(tools, `binaryen-${BINARYEN_VERSION}-${platform}`);
  const relativeExecutable = join(`binaryen-version_${BINARYEN_VERSION}`, "bin", process.platform === "win32" ? "wasm-opt.exe" : "wasm-opt");
  const executable = join(directory, relativeExecutable);
  try {
    const saved = JSON.parse(await readFile(join(directory, "verified.json"), "utf8"));
    if (saved.archiveHash === archiveHash && saved.executableHash === sha256(await readFile(executable))) {
      return { executable, version: BINARYEN_VERSION, archiveHash };
    }
  } catch { /* Missing or changed tool: fetch and verify the pinned archive again. */ }
  await mkdir(tools, { recursive: true });
  const temporary = await mkdtemp(join(tools, ".binaryen-"));
  try {
    const name = `binaryen-version_${BINARYEN_VERSION}-${platform}.tar.gz`;
    const url = `https://api.github.com/repos/WebAssembly/binaryen/releases/assets/${assetId}`;
    console.log(`Preparing verified Binaryen ${BINARYEN_VERSION} (${platform})…`);
    const archive = await downloadVerifiedArchive(url, archiveHash);
    const archivePath = join(temporary, name);
    await writeFile(archivePath, archive);
    execFileSync("tar", ["-xzf", archivePath, "-C", temporary], { timeout: 30_000 });
    const tool = join(temporary, relativeExecutable);
    const version = execFileSync(tool, ["--version"], { encoding: "utf8", timeout: 10_000 });
    if (!version.includes(`wasm-opt version ${BINARYEN_VERSION} `)) throw new Error("Unexpected Binaryen executable version.");
    await writeFile(join(temporary, "verified.json"), JSON.stringify({ archiveHash, executableHash: sha256(await readFile(tool)) }) + "\n");
    await rm(archivePath);
    await rm(directory, { recursive: true, force: true });
    await rename(temporary, directory);
    return { executable, version: BINARYEN_VERSION, archiveHash };
  } finally { await rm(temporary, { recursive: true, force: true }); }
}
