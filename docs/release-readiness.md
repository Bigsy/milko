# Release checks

Current version: 0.1.2. Compatibility floor: desktop Orca 1.4.251.
This first public release retains the known limitations below. Publication does
not establish the native behaviours that have not yet been verified.

## Verified

- Tracked text files checked for literal NUL bytes and invalid UTF-8, including
  source outside the packaged editor. The block-key separator uses a source escape
  with identical runtime bytes; rebuilt editor text contains no literal NULs.
- Type checking, the portable test/build/package pipeline and Orca static checks.
- Actual Crepe regressions for source preservation, clipboard fallback, Mermaid
  cancellation, read-only transactions, open language pickers and mounted code views.
- Nine contracts using Orca's real session implementation over a simulated host,
  including refusal races, read-only delivery, access restoration and disposal.
- Dependency notices checked for every installed version, including differing
  notices when several versions of the same package are present.
- Full Harper WASM optimized to 15,967,589 bytes with checksum-pinned Binaryen 133.
  Fresh-process comparisons cover spelling, grammar, Unicode, dictionaries,
  dialects, valid Weirpacks and invalid-pack rejection. The real engine regressions
  load the production WASM asset rather than the stock package binary.
  Native Orca loaded the raw WASM, displayed spelling issues, applied and saved a
  correction, and imported/applied a Weirpack rule with exact expected Markdown.
  WOFF2 math fonts rendered; the temporary pack was removed and prior settings restored.
- Distributed assets contain no embedded archives, native executables, TTF/OTF
  fonts or development probes. Math fonts use WOFF2. Payload guards enforce this.
- Standalone archives checked for integrity, unsafe paths, unexpected files and
  deterministic output. Same-runtime isolated builds have reproduced byte for byte.
- Native archive loading, prose/code edits saved as exact expected Markdown,
  Mermaid, Harper, themes, source recreation, clipboard copying and recovery export.
- Version 0.1.0 loaded from its packaged folder in native Orca. Marketplace images
  were captured from the same editor assets under a separate local identity, with
  sample documents and no workspace chrome or existing recovery drafts in view.
- Replacement gallery prepared for 0.1.2 from the published 0.1.1 editor: real
  rendered notes, a Harper suggestion popup and Mermaid output, cropped into a
  consistent presentation frame. No generated UI. Display settings were restored.
- The keyboard reference was opened in native Orca; Escape closed it and restored
  focus. Platform labels and frame wiring have regression tests.
- Bulk recovery dismissal is covered by cancellation, active checkpoint,
  concurrent draft changes and storage-refusal regressions.
  The native confirmation was opened and cancelled; existing drafts stayed intact.

## Remaining native verification

- A real document with Orca's readOnly flag transitioning in both directions.
  Simulated host tests do not satisfy this gate; filesystem permissions alone did
  not establish it in the native checks.
- Longer native lifecycle and memory coverage.
- Broader native acknowledgement-race and host/version coverage.

Relative/remote images, uploads, project-file links and reliable per-file cursor
restoration remain explicit release exclusions. GitHub CI covers the portable
pipeline; native Orca checks require the desktop app and its testing kit.

## Candidate preparation

Run pnpm check:release and pnpm check:orca in their supported environments.
Package only the current staged build, excluding probes and retained development
assets. Keep generated editor assets in installation commits because Orca's Git
installer runs no build. Validate notices, the extracted archive and the exact
payload before distributing a candidate. Compression comparisons must use the
same Node and zlib runtime.
