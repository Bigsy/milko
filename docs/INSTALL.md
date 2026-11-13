# MilkO Markdown — 0.1.3

A rich Markdown custom editor for desktop Orca **1.4.251 or newer**.

## Directory installation

Open the [MilkO directory page](https://www.onorca.dev/plugins/Bigsy/milko) and
choose **Open in Orca** once the release has been indexed. Review the access shown
by Orca before enabling it. Directory indexing can lag a new release.

## Local installation

1. Extract the supplied `milko-0.1.3.tar.gz` into a permanent folder.
2. Inspect its manifest and notices. The plugin uses an isolated sandboxed UI,
   requests no host capabilities, and reads the Markdown files you open in it.
3. Run `orca plugin dev load /absolute/path/to/milko-0.1.3`.
4. Orca displays its review and the approval command. Review and approve the exact
   release, then open a Markdown file and select **MilkO Markdown**.

No Node, pnpm or dependency download is needed to load this extracted package.
The folder must stay in place. To remove the development registration, run
`orca plugin dev unload /absolute/path/to/milko-0.1.3`.

The `.sha256` file verifies the archive bytes supplied to you. `INTEGRITY.json`
lists each payload file's size and SHA-256. These are integrity checks, not a
publisher signature. The directory pins installation to an exact Git commit and
Orca-generated content hash.

## Use

**Options** is at the top right beside **Find**. It saves appearance, editor and
Mermaid themes, text size, writing width and Harper settings. Editor themes include
Orca, Classic, Frame and Nord, with light/dark variants. Mermaid includes Auto and
eleven built-in styles, including Neo and Redux variants. Find also opens with Cmd/Ctrl+F. The top-left
button opens the outline. Mermaid renders by default; choose **Edit source** to
edit a fence. Save through Orca with Cmd/Ctrl+S.

Harper runs in a local worker. Dictionaries and optional Weirpacks are stored in
the plugin's own browser storage; document text is not sent to a proofing service.

## Known limitations

- Relative/remote images show a placeholder; raster data URLs work. Uploads and
  project-file links are unavailable.
- Source/view recreation does not reliably restore per-file caret or scroll.
- Concurrent merging accepts only separate, uniquely aligned whole-line changes.
  Ambiguous or same-line changes preserve the local draft for manual recovery.
- Orca may show its native Reload/Overwrite banner for outside writes. Compare
  before overwriting. MilkO does not bypass that banner.
- Recovery drafts have no host file identity and may already be saved. Compare
  them with your file before applying anything. If storage fails, copy or save
  the current recovery draft before closing the frame.
- Browser clients and older Orca versions are outside this release's support.

See [CHANGELOG.md](CHANGELOG.md), [LICENSE](LICENSE) and
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
