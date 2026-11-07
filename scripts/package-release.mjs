import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";

const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const safePath = (path) => typeof path === "string" && path !== "" && !path.includes("\\") &&
  !path.startsWith("/") && !path.split("/").some((part) => part === ".." || part === "." || part === "");

async function filesUnder(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const path = posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(root, path));
    else if (entry.isFile()) files.push(path);
    else throw new Error(`Release files must be regular files, not links: ${path}`);
  }
  return files.sort();
}

/** Small deterministic USTAR writer: regular files only, no executable modes or links. */
export function tarGzip(files) {
  const chunks = [];
  for (const { path, bytes } of files) {
    if (!safePath(path) || Buffer.byteLength(path) > 100) throw new Error(`Unsupported archive path: ${path}`);
    const header = Buffer.alloc(512);
    header.write(path, 0, "utf8");
    const octal = (value, start, length) => header.write(value.toString(8).padStart(length - 1, "0") + "\0", start, length, "ascii");
    octal(0o644, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
    octal(bytes.length, 124, 12); octal(0, 136, 12);
    header.fill(32, 148, 156); header.write("0", 156);
    header.write("ustar\0", 257); header.write("00", 263);
    const sum = header.reduce((a, b) => a + b, 0);
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
    chunks.push(header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}

export async function packageRelease(project, output) {
  const manifest = JSON.parse(await readFile(join(project, "orca-plugin.json"), "utf8"));
  const pkg = JSON.parse(await readFile(join(project, "package.json"), "utf8"));
  if (manifest.version !== pkg.version) throw new Error("Manifest/package versions differ");
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?$/.test(pkg.version) || !/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) throw new Error("Unsafe release name");
  const name = `${manifest.id}-${pkg.version}`;
  const tree = join(output, name);
  await mkdir(output, { recursive: true });
  await rm(tree, { recursive: true, force: true });
  await mkdir(tree);
  const copy = async (source, path) => {
    await mkdir(dirname(join(tree, path)), { recursive: true });
    await copyFile(source, join(tree, path));
  };
  await copy(join(project, "orca-plugin.json"), "orca-plugin.json");
  await copy(join(project, "README.md"), "README.md");
  for (const file of ["LICENSE", "CHANGELOG.md", "THIRD_PARTY_NOTICES.md"]) await copy(join(project, file), file);
  for (const file of await filesUnder(join(project, "licenses"))) await copy(join(project, "licenses", file), `licenses/${file}`);
  // Use the current staging build, not editor/ with its retained development history.
  for (const file of await filesUnder(join(project, ".orca/build"))) {
    if (!file.startsWith("probes/")) await copy(join(project, ".orca/build", file), `editor/${file}`);
  }
  for (const editor of manifest.contributes?.customEditors ?? []) {
    if (!safePath(editor.entry)) throw new Error("Unsafe editor entry");
    await readFile(join(tree, editor.entry));
  }
  const paths = await filesUnder(tree);
  const files = [];
  let total = 0;
  for (const path of paths) {
    const bytes = await readFile(join(tree, path));
    if (bytes.length > 16 * 1024 * 1024) throw new Error(`Oversized release asset: ${path}`);
    total += bytes.length;
    files.push({ path, size: bytes.length, sha256: digest(bytes) });
  }
  if (files.length + 1 > 1000 || total > 50 * 1024 * 1024) throw new Error("Release exceeds package limits");
  await writeFile(join(tree, "INTEGRITY.json"), JSON.stringify({ format: 1, id: manifest.id, version: pkg.version, minimumOrca: manifest.engines.orca, files }, null, 2) + "\n");
  await verifyRelease(tree);
  const archive = join(output, `${name}.tar.gz`);
  const payload = [];
  for (const path of await filesUnder(tree)) payload.push({ path: `${name}/${path}`, bytes: await readFile(join(tree, path)) });
  const bytes = tarGzip(payload);
  await writeFile(archive, bytes);
  await writeFile(`${archive}.sha256`, `${digest(bytes)}  ${name}.tar.gz\n`);
  return { tree, archive, files: files.length + 1, bytes: total };
}

export async function verifyRelease(tree) {
  const integrity = JSON.parse(await readFile(join(tree, "INTEGRITY.json"), "utf8"));
  const manifest = JSON.parse(await readFile(join(tree, "orca-plugin.json"), "utf8"));
  if (integrity.format !== 1 || integrity.id !== manifest.id || integrity.version !== manifest.version || integrity.minimumOrca !== manifest.engines.orca) throw new Error("Release metadata mismatch");
  const expected = new Set(["INTEGRITY.json"]);
  for (const file of integrity.files) {
    if (!safePath(file.path) || expected.has(file.path)) throw new Error("Unsafe or duplicated integrity path");
    expected.add(file.path);
    const bytes = await readFile(join(tree, file.path));
    if (file.size !== bytes.length || file.sha256 !== digest(bytes)) throw new Error(`Release integrity mismatch: ${file.path}`);
  }
  const actual = await filesUnder(tree);
  if (actual.length !== expected.size || actual.some((file) => !expected.has(file))) throw new Error("Unexpected release files");
  return { version: manifest.version, files: actual.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const project = fileURLToPath(new URL("../", import.meta.url));
  const output = join(project, ".orca/releases");
  if (process.argv[2] === "--verify") {
    const manifest = JSON.parse(await readFile(join(project, "orca-plugin.json"), "utf8"));
    console.log(await verifyRelease(join(output, `${manifest.id}-${manifest.version}`)));
  } else console.log(await packageRelease(project, output));
}
