# Feature status

MilkO is an alpha editor. This record distinguishes implementation from native
coverage; it is not a stable-release certification.

| Feature | Status |
| --- | --- |
| Rich prose, code, tables, tasks and math | Implemented with source-preservation regressions |
| Mermaid | Local rendering, themes, source toggle and cancellation of obsolete previews |
| Harper | Optional local worker, suggestions, dictionary, dialects and Weirpacks |
| Find/replace and outline | Implemented, including current heading positions after edits |
| Themes | Orca plus Classic/Frame/Nord light and dark palettes; Mermaid Auto and eleven styles |
| Keyboard reference | Shortcuts button in the header, with platform-specific keys |
| Source preservation | No-op bytes, resolved reference links and unchanged table rows are guarded |
| Concurrent writes | Only separate, uniquely aligned whole-line changes merge automatically |
| Recovery | Immutable conflict snapshots and a mutable checkpoint; counted drafts with confirmed bulk dismissal, active/changed draft protection and storage-failure handling |
| Delivery confirmation | Accepted host content checked after flush; unaccepted drafts remain pending and retry when writable |
| Read-only editor behaviour | Transactions blocked; stale pickers closed and mounted code views refreshed in both directions |
| Dependency notices | Every installed version checked; distinct notices retained |
| Images and uploads | Relative/remote previews and uploads remain unsupported |
| Project-file links | Unsupported; heading and web/email links work |
| Per-file view restoration | Reliable cursor/scroll restoration remains open |

Tests use actual Crepe controls and Orca's real session implementation over a
simulated host. Native checks have covered editing, immediate saving, source
recreation, diagrams, proofing, theme persistence, clipboard copying, conflict
recovery and archive loading. A native host read-only transition and a longer
memory soak remain open. See [release checks](release-readiness.md).
