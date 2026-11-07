import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, isAbsolute, join } from "node:path";

const project = fileURLToPath(new URL("../", import.meta.url));

/** Publish a complete build, keeping the previous assets available to frames during reload. */
export async function publishBuild() {
  const staging = join(project, ".orca/build");
  const destination = join(project, "editor");
  const history = join(project, ".orca/build-history.json");
  const files = await listFiles(staging);
  let previous = [];
  try {
    const saved = JSON.parse(await readFile(history, "utf8"));
    if (Array.isArray(saved)) previous = saved.filter(Array.isArray).map((entries) => entries.filter((file) =>
      typeof file === "string" && !isAbsolute(file) && !file.split(/[\\/]/).includes("..")));
  } catch { /* First build. */ }
  await mkdir(destination, { recursive: true });
  for (const file of files) {
    if (file === "index.html") continue;
    const target = join(destination, file);
    const content = await readFile(join(staging, file));
    const old = await readFile(target).catch(() => undefined);
    if (old?.equals(content)) continue;
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(staging, file), target);
  }
  // The entry switches only after every file it can import is in place.
  const entry = join(project, ".orca/editor-entry.html");
  await copyFile(join(staging, "index.html"), entry);
  await rename(entry, join(destination, "index.html"));
  const keep = new Set([...files, ...(previous[0] ?? [])]);
  for (const old of previous.flat()) {
    if (!keep.has(old)) await rm(join(destination, old), { force: true });
  }
  await writeFile(history, JSON.stringify([files, previous[0] ?? []]));
}

async function listFiles(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(root, path));
    else files.push(path);
  }
  return files;
}
