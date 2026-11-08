import { execFileSync } from "node:child_process";
import { lstat, readFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// These intentionally binary assets are validated by Orca and the packaging checks.
const BINARY_ASSETS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".woff", ".woff2", ".wasm"]);

/** The directory checks the tagged repository, including source outside the release archive. */
export async function checkRepositoryText(project) {
  const paths = execFileSync("git", ["ls-files", "-z"], { cwd: project, encoding: "utf8" }).split("\0").filter(Boolean);
  let checked = 0;
  for (const path of paths) {
    const absolute = join(project, path);
    if (!(await lstat(absolute)).isFile()) throw new Error(`Tracked file is not a regular file: ${path}`);
    if (BINARY_ASSETS.has(extname(path).toLowerCase())) continue;
    const bytes = await readFile(absolute);
    if (bytes.includes(0)) throw new Error(`Tracked text contains a literal NUL byte: ${path}. Use a source escape instead.`);
    try { new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
    catch { throw new Error(`Tracked text is not UTF-8: ${path}`); }
    checked++;
  }
  return checked;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const project = fileURLToPath(new URL("../", import.meta.url));
  console.log(`Checked ${await checkRepositoryText(project)} tracked text files; no literal NULs or invalid UTF-8.`);
}
