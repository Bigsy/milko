import { mkdir, writeFile } from "node:fs/promises";
import { packWeirpackFiles } from "harper.js";

const root = new URL("../.orca/release-checks/", import.meta.url);
await mkdir(root, { recursive: true });
const pack = packWeirpackFiles(new Map([
  ["manifest.json", JSON.stringify({ author: "MilkO", version: "1.0.0", description: "Disposable release verification fixture", license: "MIT" })],
  ["dictionary.dict", "1\nProofly\n"],
  ["annotations.json", JSON.stringify({ affixes: {}, properties: {} })],
  ["Brand.weir", '\nexpr main (G Suite)\nlet message "Use the updated brand."\nlet description "The product is now called Google Workspace."\nlet kind "Style"\nlet becomes "Google Workspace"\nlet strategy "Exact"\ntest "Use G Suite today." "Use Google Workspace today."\n'],
]));
await writeFile(new URL("milko-release-smoke.weirpack", root), pack);
await writeFile(new URL("invalid-release-smoke.weirpack", root), "Not a valid Weirpack. Disposable test data.\n");
await writeFile(new URL("proofing.md", root), "# Release proofing check\n\nUse G Suite with Proofly today.\n\nThis is wierd.\n");
await writeFile(new URL("lifecycle.md", root), '# Lifecycle check\r\n\r\nKeep __this__ exactly.\r\n\r\nalpha [text][ref] rest.\r\n\r\n[ref]: https://example.test "Title"\r\n\r\n```mermaid\r\nflowchart LR\r\nA --> B\r\n```\r\n');
await writeFile(new URL("race.md", root), "# Release conflict check\n\nLocal paragraph.\n\nAgent paragraph.\n");
await writeFile(new URL("close.md", root), "# Immediate close check\n\nSave this sentence.\n");
console.log(`Wrote disposable release fixtures to ${root.pathname}`);
