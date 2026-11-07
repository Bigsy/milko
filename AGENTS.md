# MilkO contributor notes

- Read PLAN.md before implementation. MilkO is an independent Markdown editor for
  Orca; shared-library extraction is a possible later project.
- Source lives in src/. editor/ is generated and must not be edited by hand.
  Orca Git installs run no build, so commits intended for installation must include
  exactly the current generated editor assets, excluding development probes.
- Keep host persistence and concurrency separate from rich-editor behaviour.
  Use public Orca APIs and retain the sandboxed UI permission boundary.
- Never serialize preferences, dictionaries or recovery metadata into Markdown.
  Options and Shortcuts are separate controls in the editor header.
- Preserve no-op Markdown exactly. Test narrow edits, outside writes, ambiguous
  merges, stale acknowledgements, save flushing, read-only transitions and cleanup.
- A resolved session flush is not delivery confirmation. Compare accepted content
  through orca.document.get(); keep failures pending and recoverable, and retry
  when write access returns.
- Read-only mode must block document-changing transactions, close existing
  language pickers and update mounted CodeMirror views in both directions.
- Keep recovery snapshots separate from mutable checkpoints. Prefer the newest
  in-memory checkpoint when storage fails. Drafts have no reliable file identity;
  never restore them automatically.
- Retain the actual-Crepe integration tests: onCopy is a success notification,
  preview callbacks have no stable block identity, and node views own cancellation.
- Themes use locally bundled Crepe palettes. Mermaid updates must preserve source,
  selection and undo, and ignore obsolete asynchronous renders.
- Harper is optional and lazy. Keep workers, fonts, scripts and optimized WASM
  local, surface failures and dispose workers when disabled or destroyed.
- The build uses checksum-pinned native Binaryen 133, cached under .orca/tools/.
  Ship the complete optimized WASM below 16 MiB, without an embedded archive.
  Preserve its imports/exports and test the actual asset in fresh processes;
  Harper's glue caches its first loaded binary. Keep build tools out of Git.
- Keep source and licence attribution for adapted modules. Collect notices for
  every installed package version, deduplicating only identical text. Reviewed
  upstream fallbacks are pinned by version and digest in licenses/overrides.json.
- Checks: pnpm typecheck, pnpm test, pnpm check:release. pnpm check:orca additionally
  requires the installed Orca CLI/testing kit. Native checks remain a separate gate.
- Use the pinned official declarations in types/vendor/ until Orca's declaration
  generator supplies the required resources. Do not invent or patch host APIs.
- Keep local files, credentials, probe output and recovery data out of Git. Public
  documentation must not contain machine-specific paths or private session notes.
- Keep the release checklist honest: static checks and simulated host changes do
  not establish native behaviour. See docs/release-readiness.md.
