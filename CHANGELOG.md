# Changelog

## 0.1.2 — 2026-11-08

- Clarify that Markdown is edited directly in a rendered view, with local Harper
  spelling and grammar checks, in the marketplace description and README introduction.
  Editor behaviour and bundled editor assets are unchanged.
- Replace the marketplace cover and gallery with consistently framed real captures
  of rendered editing, Harper suggestions, and Mermaid diagrams with code.

## 0.1.1 — 2026-11-08

- Escape the internal block-key NUL separator in source so the directory does not
  classify the TypeScript file as binary. Runtime keys and Markdown behaviour are unchanged.
- Check tracked source and generated editor text for literal NULs and invalid UTF-8
  during release validation, including files outside the downloadable archive.
- Download build tools through GitHub's official release-asset API and retry
  transient failures with fresh requests. Retain the pinned checksum and fail
  immediately if the downloaded bytes do not match.

## 0.1.0 — 2026-11-07

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
- Marketplace cover and screenshots captured from Orca, included in the verified package.

This is the first public release. Relative/remote images,
uploads, project-file navigation and reliable per-file caret restoration remain
unsupported. Desktop validation and remaining gates are recorded in the source
repository's docs/release-readiness.md.
