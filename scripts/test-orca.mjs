import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

// Orca's test loader deliberately confines imports to the chosen plugin root. Stage the exact
// production modules with the host-contract tests, separate from our Vitest/browser suite.
const project = fileURLToPath(new URL("../", import.meta.url));
await mkdir(join(project, ".orca"), { recursive: true });
const staging = await mkdtemp(join(project, ".orca/host-contracts-"));
try {
  for (const file of ["src/concurrent-markdown.ts", "src/unique-sequence.ts", "src/document-sync.ts", "src/recovery.ts", "tests/orca/document-session.test.ts"]) {
    await mkdir(dirname(join(staging, file)), { recursive: true });
    await copyFile(join(project, file), join(staging, file));
  }
  const result = spawnSync("orca", ["plugin", "test", staging], { stdio: "inherit" });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally { await rm(staging, { recursive: true, force: true }); }
