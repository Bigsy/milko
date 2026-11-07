import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { collectNotices } from "./collect-licenses.mjs";

test("missing notices are flagged even when the package declares MIT", async () => {
  const root = await mkdtemp(join(tmpdir(), "milko-notices-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "example", version: "1.0.0" }));
    const result = await collectNotices([{ name: "example", versions: ["1.0.0"], license: "MIT", paths: [root] }], {}, root);
    assert.deepEqual(result.missing, ["example@1.0.0"]);
    assert.match(result.output, /MISSING NOTICE/);
  } finally { await rm(root, { recursive: true }); }
});

test("an upstream fallback is version-specific and checked against its pinned digest", async () => {
  const root = await mkdtemp(join(tmpdir(), "milko-notices-"));
  try {
    await writeFile(join(root, "package.json"), JSON.stringify({ name: "example", version: "1.0.0" }));
    const content = "Copyright Example\nPermission notice\n";
    await writeFile(join(root, "upstream.txt"), content);
    const entry = { name: "example", versions: ["1.0.0"], license: "MIT", paths: [root] };
    const overrides = { "example@1.0.0": { file: "upstream.txt", source: "https://example.test/pinned/license", sha256: createHash("sha256").update(content).digest("hex") } };
    const result = await collectNotices([entry], overrides, root);
    assert.deepEqual(result.missing, []);
    assert.ok(result.output.includes(content));
    assert.deepEqual((await collectNotices([{ ...entry, versions: ["2.0.0"] }], overrides, root)).missing, ["example@2.0.0"]);
    await writeFile(join(root, "upstream.txt"), "Wrong notice");
    await assert.rejects(collectNotices([entry], overrides, root), /checksum mismatch/);
  } finally { await rm(root, { recursive: true }); }
});

async function twoVersions(run) {
  const root = await mkdtemp(join(tmpdir(), "milko-notices-versions-"));
  try {
    const paths = [join(root, "v2"), join(root, "v1")]; // Deliberately not the versions' order.
    for (let i = 0; i < paths.length; i++) {
      await mkdir(paths[i]);
      await writeFile(join(paths[i], "package.json"), JSON.stringify({ name: "example", version: i === 0 ? "2.0.0" : "1.0.0" }));
    }
    await run({ root, paths, entry: { name: "example", versions: ["1.0.0", "2.0.0"], license: "MIT", paths } });
  } finally { await rm(root, { recursive: true }); }
}

test("distinct version notices are collected using each installed manifest, including additional NOTICE files", async () => {
  await twoVersions(async ({ root, paths, entry }) => {
    await writeFile(join(paths[1], "LICENSE"), "Copyright First\nPermission notice\n");
    await writeFile(join(paths[0], "LICENSE"), "Copyright Second\nPermission notice\n");
    await writeFile(join(paths[0], "NOTICE"), "Additional attribution\n");
    const result = await collectNotices([entry], {}, root);
    assert.deepEqual(result.missing, []);
    assert.match(result.output, /Versions: 1.0.0\nLICENSE\nCopyright First/);
    assert.match(result.output, /Versions: 2.0.0\nLICENSE\nCopyright Second/);
    assert.match(result.output, /NOTICE\nAdditional attribution/);
  });
});

test("a notice in one version cannot hide a missing notice in another", async () => {
  await twoVersions(async ({ root, paths, entry }) => {
    await writeFile(join(paths[1], "LICENSE"), "Copyright First\nPermission notice\n");
    const result = await collectNotices([entry], {}, root);
    assert.deepEqual(result.missing, ["example@2.0.0"]);
    assert.match(result.output, /MISSING NOTICE: example@2.0.0/);
  });
});

test("only byte-identical notices are deduplicated, with all versions retained", async () => {
  await twoVersions(async ({ root, paths, entry }) => {
    const content = "Copyright Shared\nPermission notice\n";
    await writeFile(join(paths[0], "LICENSE"), content);
    await writeFile(join(paths[1], "COPYING"), content);
    const result = await collectNotices([entry], {}, root);
    assert.deepEqual(result.missing, []);
    assert.equal(result.output.split(content).length - 1, 1);
    assert.match(result.output, /Versions: 1.0.0, 2.0.0\nCOPYING, LICENSE/);
  });
});
