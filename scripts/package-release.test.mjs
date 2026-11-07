import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { packageRelease, verifyRelease, tarGzip } from "./package-release.mjs";

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "milko-release-test-"));
  const project = join(root, "source"); const output = join(root, "output");
  const manifest = { id: "milko", version: "0.1.0-alpha.1", engines: { orca: ">=1.4.251" }, contributes: { customEditors: [{ entry: "editor/index.html" }] } };
  const files = { "orca-plugin.json": JSON.stringify(manifest), "package.json": JSON.stringify({ version: manifest.version }), "README.md": "A human-readable product introduction", "docs/INSTALL.md": "Install notes", "LICENSE": "Author license", "CHANGELOG.md": "Changes", "THIRD_PARTY_NOTICES.md": "Notices", "licenses/example.txt": "Dependency license", ".orca/build/index.html": '<script src="./assets/app.js"></script>', ".orca/build/assets/app.js": "console.log('exact artifact')", ".orca/build/probes/dev.js": "DO NOT SHIP", "editor/stale.js": "STALE", ".env": "DO NOT SHIP" };
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(project, path, ".."), { recursive: true });
    await writeFile(join(project, path), content);
  }
  try { await run(project, output, manifest); } finally { await rm(root, { recursive: true, force: true }); }
}

test("release archives reproduce exactly, extract with standard tar, and exclude development/private files", () => fixture(async (project, output) => {
  const first = await packageRelease(project, output);
  const bytes = await readFile(first.archive);
  const second = await packageRelease(project, output);
  assert.deepEqual(await readFile(second.archive), bytes);
  const listing = execFileSync("tar", ["-tzf", second.archive], { encoding: "utf8" });
  assert.match(listing, /editor\/assets\/app\.js/);
  assert.doesNotMatch(listing, /stale|dev\.js|\.env|node_modules/);
  const extracted = join(output, "extracted"); await mkdir(extracted);
  execFileSync("tar", ["-xzf", second.archive, "-C", extracted]);
  await verifyRelease(join(extracted, "milko-0.1.0-alpha.1"));
  assert.equal(await readFile(join(extracted, "milko-0.1.0-alpha.1/README.md"), "utf8"), "A human-readable product introduction");
}));

test("package verification rejects tampering and unexpected files", () => fixture(async (project, output) => {
  const result = await packageRelease(project, output);
  await writeFile(join(result.tree, "editor/assets/app.js"), "tampered");
  await assert.rejects(verifyRelease(result.tree), /integrity mismatch/);
  await packageRelease(project, output);
  await writeFile(join(result.tree, "extra.txt"), "unexpected");
  await assert.rejects(verifyRelease(result.tree), /Unexpected release files/);
}));

test("release payloads reject embedded archives, native fonts and disguised native executables", () => fixture(async (project, output) => {
  for (const [name, bytes] of [
    ["old.wasm.gz", Buffer.from([0x1f, 0x8b])],
    ["font.ttf", Buffer.from("font")],
    ["disguised.js", Buffer.from([0x7f, 0x45, 0x4c, 0x46])],
  ]) {
    const path = join(project, ".orca/build/assets", name);
    await writeFile(path, bytes);
    await assert.rejects(packageRelease(project, output), /Unsupported distributed/);
    await rm(path);
  }
}));

test("packaging rejects version mismatches, unsafe archive names and asset symlinks", () => fixture(async (project, output) => {
  await writeFile(join(project, "package.json"), JSON.stringify({ version: "1.0.0" }));
  await assert.rejects(packageRelease(project, output), /versions differ/);
  assert.throws(() => tarGzip([{ path: "../escape", bytes: Buffer.from("x") }]), /Unsupported archive path/);
  await writeFile(join(project, "package.json"), JSON.stringify({ version: "0.1.0-alpha.1" }));
  await symlink(join(project, ".env"), join(project, ".orca/build/assets/link.js"));
  await assert.rejects(packageRelease(project, output), /not links/);
}));
