# Orca integration

The current compatibility floor is desktop Orca 1.4.251. Public frame declarations
are vendored from the matching Orca source commit; provenance is recorded in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

## Documents

MilkO uses document.session, document.get and the editor.flush event. Rich edits
reach the session synchronously. Flush resolution alone does not prove delivery:
MilkO compares the latest draft with accepted host content, reports an unaccepted
draft and retries when write access returns.

Concurrent merging is conservative and line based. Same-line changes, ambiguous
repeated lines and over-budget alignments require recovery. Native disk-write
checks used Orca's conflict banner; automatic disk merging is not established.
MilkO does not bypass Compare/Reload or call internal host messages.

## Recovery and resources

The frame supplies content, version and read-only state without a stable file
path or identity. Recovery drafts are displayed for manual comparison and are
never applied automatically. The public save-as dialog can export a separate draft.

Bundled scripts, CSS, fonts, workers and compressed Harper WASM load locally.
Relative/remote images, uploads and project-file navigation need a supported host
route before implementation. Raster data URLs can render. Web/email links use the
public opener; heading fragments navigate inside the document.

## Verification limits

Automated tests cover actual session acknowledgements and refusal races over a
mock host, plus real Crepe controls. Native checks are recorded separately in
[release checks](release-readiness.md). Browser clients, native read-only
transitions and reliable per-file view state are not claimed as verified.
