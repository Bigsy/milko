# Release checks

Current version: 0.1.0-alpha.1. Compatibility floor: desktop Orca 1.4.251.
Publishing the source repository does not mark the plugin stable or complete the
native verification below.

## Verified

- Type checking, the portable test/build/package pipeline and Orca static checks.
- Actual Crepe regressions for source preservation, clipboard fallback, Mermaid
  cancellation, read-only transactions, open language pickers and mounted code views.
- Nine contracts using Orca's real session implementation over a simulated host,
  including refusal races, read-only delivery, access restoration and disposal.
- Dependency notices checked for every installed version, including differing
  notices when several versions of the same package are present.
- Standalone archives checked for integrity, unsafe paths, unexpected files and
  deterministic output. Same-runtime isolated builds have reproduced byte for byte.
- Native archive loading, prose/code edits saved as exact expected Markdown,
  Mermaid, Harper, themes, source recreation, clipboard copying and recovery export.
- The keyboard reference was opened in native Orca; Escape closed it and restored
  focus. Platform labels and frame wiring have regression tests.
- Bulk recovery dismissal is covered by cancellation, active checkpoint,
  concurrent draft changes and storage-refusal regressions.
  The native confirmation was opened and cancelled; existing drafts stayed intact.

## Still required before a stable release

- A real document with Orca's readOnly flag transitioning in both directions.
  Simulated host tests do not satisfy this gate; filesystem permissions alone did
  not establish it in the native checks.
- Longer native lifecycle and memory coverage.
- Broader native acknowledgement-race and host/version coverage.

Relative/remote images, uploads, project-file links and reliable per-file cursor
restoration remain explicit alpha exclusions. GitHub CI covers the portable
pipeline; native Orca checks require the desktop app and its testing kit.

## Candidate preparation

Run pnpm check:release and pnpm check:orca in their supported environments.
Package only the current staged build, excluding probes and retained development
assets. Keep generated editor assets in installation commits because Orca's Git
installer runs no build. Validate notices, the extracted archive and the exact
payload before distributing a candidate. Compression comparisons must use the
same Node and zlib runtime.
