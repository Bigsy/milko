# MilkO plan

MilkO is an independent rich Markdown editor for [Orca](https://www.onorca.dev/).
It uses Milkdown/Crepe and draws on the source-preservation work in
[MilkJ](https://github.com/Bigsy/milkj). Build and validate MilkO independently;
consider a shared editor package only after its behaviour is established.

## Working scope

- Rich Markdown, code, tables, tasks, math and Mermaid.
- Exact-source preservation and conservative concurrent edits.
- Recoverable drafts and explicit save/delivery failures.
- Optional local Harper proofing, dictionaries, dialects and Weirpacks.
- Find/replace, outline, themes and a visible keyboard reference.
- A standalone bundle using public Orca APIs and locally packaged assets.

## Next work

1. Verify a native document whose Orca readOnly flag changes in both directions,
   including unaccepted typing, an open language picker and mounted code blocks.
2. Complete longer native lifecycle/memory coverage and deterministic race coverage
   where the host allows it.
3. Establish public host APIs for relative resources, uploads and project-file links.
4. Add reliable per-file cursor and scroll restoration when document identity allows it.
5. Broaden host/version coverage before claiming stable or browser support.

## Boundaries

The editor owns rich editing, Markdown preservation and optional proofing. The
Orca integration owns document sessions, accepted writes, settings and recovery.
Do not bypass native conflict controls, relax the sandbox or infer file identity.

References: [feature status](docs/feature-audit.md),
[host capabilities](docs/orca-capabilities.md),
[release checks](docs/release-readiness.md),
[source provenance](THIRD_PARTY_NOTICES.md).
