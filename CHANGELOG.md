# Changelog

## 0.1.0-alpha.1 — release candidate

First independent MilkO Markdown editor for desktop Orca 1.4.251 or newer.

- Rich Markdown, Mermaid previews, math, tables, tasks, code, find/replace and outline.
- A keyboard shortcuts reference beside Options, with keys for each platform.
- Optional local Harper proofing, dictionaries, dialects and Weirpack imports.
- Saved appearance and proofing options, with Crepe Classic/Frame/Nord palettes
  and all eleven Mermaid 12.3.0 themes plus Auto. Live theme changes retain source,
  selection and undo history; pending diagrams cannot restore an obsolete theme.
- Exact-source preservation with guarded reference-link and table-row edits.
- Conservative concurrent merging and separate recovery snapshots.
- Counted recovery drafts and confirmed bulk dismissal, preserving the active
  checkpoint and any drafts changed while the confirmation is open.
- Confirm delivery against Orca's accepted content; preserve/report undelivered
  drafts during read-only transitions and retry when write access returns.
- Enforce read-only transactions, close stale language pickers and update mounted
  CodeMirror views in both directions without waiting for a document edit.
- Collect dependency notices per installed version, retaining distinct copyright
  notices and rejecting missing notices in any version.
- Local assets, optimized uncompressed Harper WASM, dependency notices and reproducible packaging.
- Checksum-pinned Binaryen build tooling, full Harper parity checks, WOFF2-only math
  fonts and payload checks rejecting embedded archives and native executables.

This is an alpha candidate, not a published release. Relative/remote images,
uploads, project-file navigation and reliable per-file caret restoration remain
unsupported. Desktop validation and remaining gates are recorded in the source
repository's docs/release-readiness.md.
