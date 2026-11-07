import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { createBinaryModuleFromUrl, Dialect, LocalLinter, packWeirpackFiles } from "harper.js";

// One binary per fresh process: Harper's WASM glue caches its first initialized module.
const binary = createBinaryModuleFromUrl(pathToFileURL(process.argv[2]).href, "full");
const linter = new LocalLinter({ binary, dialect: Dialect.American });
const results = [];
async function lint(text) {
  const issues = await linter.lint(text, { language: "plaintext" });
  try {
    return issues.map((issue) => {
      const suggestions = issue.suggestions();
      try { return { lint: JSON.parse(issue.to_json()), suggestions: suggestions.map((suggestion) => suggestion.get_replacement_text()) }; }
      finally { suggestions.forEach((suggestion) => suggestion.free()); }
    });
  }
  finally { issues.forEach((issue) => issue.free()); }
}
try {
  for (const text of ["This is wierd.", "A apple is on the table.", "Café and 日本語: This is wierd.", "The color looks great.", "Proofly improves text."]) {
    results.push(await lint(text));
  }
  assert.ok(results[0].some((issue) => issue.suggestions.includes("weird")));
  await linter.importWords(["Proofly"]);
  results.push(await lint("Proofly improves text."));
  await linter.clearWords();
  results.push(await lint("Proofly improves text."));
  await linter.setDialect(Dialect.British);
  results.push(await lint("The color looks great."));
  await linter.setDialect(Dialect.American);
  const pack = packWeirpackFiles(new Map([
    ["manifest.json", JSON.stringify({ author: "MilkO", version: "1.0.0", description: "Packaging parity", license: "MIT" })],
    ["dictionary.dict", "1\nProofly\n"],
    ["annotations.json", JSON.stringify({ affixes: {}, properties: {} })],
    ["Brand.weir", 'expr main (G Suite)\nlet message "Use the updated brand."\nlet description "Use Google Workspace."\nlet kind "Style"\nlet becomes "Google Workspace"\nlet strategy "Exact"\ntest "Use G Suite today." "Use Google Workspace today."\n'],
  ]));
  results.push(await linter.loadWeirpackFromBytes(pack));
  const branded = await lint("Use G Suite with Proofly today.");
  assert.ok(branded.some((issue) => issue.suggestions.includes("Google Workspace")));
  results.push(branded);
  let rejected = false;
  try { await linter.loadWeirpackFromBytes(new Uint8Array([0, 1, 2])); }
  catch { rejected = true; }
  assert.equal(rejected, true);
  results.push({ invalidPackRejected: true });
} finally { await linter.dispose(); }
process.stdout.write(JSON.stringify(results));
