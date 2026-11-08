import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { checkRepositoryText } from "./check-repository-text.mjs";

test("repository checks include source and complete bundles, while local ignored notes stay private", async () => {
  const project = await mkdtemp(join(tmpdir(), "milko-text-check-"));
  const git = (...args) => execFileSync("git", args, { cwd: project, stdio: "pipe" });
  try {
    git("init", "--quiet");
    await mkdir(join(project, "src"));
    await mkdir(join(project, "editor"));
    await writeFile(join(project, ".gitignore"), "AGENTS.md\nPLAN.md\n");
    await writeFile(join(project, "PLAN.md"), Buffer.from([0]));
    await writeFile(join(project, "src/blocks.ts"), Buffer.from('const key = "type' + String.fromCharCode(0) + 'content";'));
    await writeFile(join(project, "editor/app.js"), "export const ready = true;\n");
    await writeFile(join(project, "image.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0]));
    git("add", ".");
    await assert.rejects(checkRepositoryText(project), /literal NUL byte: src\/blocks\.ts/);
    await writeFile(join(project, "src/blocks.ts"), 'const key = "type\\0content"; // café\n');
    assert.equal(await checkRepositoryText(project), 3);
    await writeFile(join(project, "editor/app.js"), " ".repeat(16_000) + String.fromCharCode(0));
    await assert.rejects(checkRepositoryText(project), /literal NUL byte: editor\/app\.js/);
    await writeFile(join(project, "editor/app.js"), Buffer.from([0xff]));
    await assert.rejects(checkRepositoryText(project), /not UTF-8: editor\/app\.js/);
  } finally { await rm(project, { recursive: true, force: true }); }
});

test("an escaped separator retains the original runtime key bytes", () => {
  const original = '`paragraph' + String.fromCharCode(0) + '${"content"}`';
  const escaped = '`paragraph\\0${"content"}`';
  assert.equal(runInNewContext(escaped), runInNewContext(original));
});
