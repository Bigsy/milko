import { assert, mockEditorHost, test } from "orca/testing";
import { mergeConcurrentMarkdown } from "../../src/concurrent-markdown";
import { deliverPendingEdits, DocumentSync } from "../../src/document-sync";
import { DraftSession, DraftStore } from "../../src/recovery";

// Run with `pnpm test:orca`: Orca supplies its actual frame-shell document.session
// implementation over a controlled host, rather than a hand-written session fake.
async function open(base: string, readOnly = false) {
  const access = { readOnly };
  const host = mockEditorHost({ text: base }, access);
  const drafts = new DraftStore();
  const recovery = new DraftSession(drafts);
  const session = await host.orca.document.session<string>({
    debounceMs: 10_000,
    merge(ancestor, outside, mine) {
      const result = mergeConcurrentMarkdown(ancestor, outside, mine);
      if (!result.ok) recovery.recover(mine, result.reason);
      return result.markdown;
    },
  });
  let shown = base;
  let pending = false;
  const recovered: Array<{ markdown: string; reason: string }> = [];
  const sync = new DocumentSync(session, {
    replace(markdown) { shown = markdown; }, state(value) { pending = value; },
    recover: (markdown, reason) => { recovered.push({ markdown, reason }); recovery.recover(markdown, reason); },
  }, host.orca.document);
  const accessEvents = host.orca.document.onDidChange(() => sync.accessChanged());
  const flush = host.orca.on("editor.flush", () => sync.flush());
  return {
    host, session, sync, recovery, recovered,
    get shown() { return shown; },
    get pending() { return pending; },
    setReadOnly(value: boolean) { access.readOnly = value; host.replace(host.text); },
    change(markdown: string) { recovery.checkpoint(markdown); sync.change(markdown); },
    close() { accessEvents.dispose(); flush.dispose(); sync.dispose(); host.dispose(); },
  };
}

/**
 * Typing that reaches the session only when delivered, as MilkO's rich editor merges a burst of
 * keystrokes after they paint. `deliverFirst` registers delivery before the session, as MilkO does.
 */
async function openDeferred(base: string, deliverFirst: boolean) {
  const access = { readOnly: false };
  const host = mockEditorHost({ text: base }, access);
  let pending: string | undefined;
  let sync: DocumentSync | undefined;
  let session: Awaited<ReturnType<typeof host.orca.document.session<string>>> | undefined;
  const deliver = () => {
    if (pending === undefined) return false;
    const next = pending;
    pending = undefined;
    sync?.change(next);
    return true;
  };
  const listen = () => deliverPendingEdits(host.orca, host.orca.document, () => { deliver(); }, () => sync?.flush());
  const early = deliverFirst ? listen() : undefined;
  session = await host.orca.document.session<string>({
    debounceMs: 10_000,
    merge(ancestor, outside, mine) {
      if (deliver()) mine = session!.value;
      return mergeConcurrentMarkdown(ancestor, outside, mine).markdown;
    },
  });
  const late = deliverFirst ? undefined : listen();
  let shown = base;
  const recovered: string[] = [];
  sync = new DocumentSync(session, {
    replace(markdown) { shown = markdown; }, state() {}, recover(markdown) { recovered.push(markdown); },
  }, host.orca.document);
  const accessEvents = host.orca.document.onDidChange(() => sync!.accessChanged());
  return {
    host, session, sync, recovered,
    get shown() { return shown; },
    type(markdown: string) { pending = markdown; },
    setReadOnly(value: boolean) { access.readOnly = value; host.replace(host.text); },
    close() { accessEvents.dispose(); early?.dispose(); late?.dispose(); sync!.dispose(); host.dispose(); },
  };
}

test("undelivered typing merges with an outside change when delivered ahead of the session", async () => {
  const base = "# Plan\n\nFirst paragraph.\n\nLast paragraph.\n";
  const run = await openDeferred(base, true);
  try {
    run.type(base.replace("Last", "My last"));
    run.host.replace(base.replace("First", "Outside first"));
    await run.host.flush();
    const merged = base.replace("First", "Outside first").replace("Last", "My last");
    assert.equal(run.host.text, merged);
    assert.equal(run.shown, merged);
  } finally { run.close(); }
});

test("delivered after the session's own listener, the same typing overwrites the outside change", async () => {
  // Why MilkO delivers ahead of the session: a session without unsaved work takes the outside
  // document as clean, and a later delivery then replaces it on disk.
  const base = "# Plan\n\nFirst paragraph.\n\nLast paragraph.\n";
  const run = await openDeferred(base, false);
  try {
    run.type(base.replace("Last", "My last"));
    run.host.replace(base.replace("First", "Outside first"));
    await run.host.flush();
    assert.equal(run.host.text, base.replace("Last", "My last"));
  } finally { run.close(); }
});

test("a save sends undelivered typing as one edit", async () => {
  const run = await openDeferred("Before.\n", true);
  try {
    run.type("Typed just before saving.\n");
    await run.host.flush();
    assert.equal(run.host.text, "Typed just before saving.\n");
    assert.equal(run.host.edits.length, 1);
  } finally { run.close(); }
});

test("a read-only transition retains undelivered typing and retries it when write access returns", async () => {
  const run = await openDeferred("Before\n", true);
  try {
    run.type("Unsaved local edit\n");
    run.setReadOnly(true);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(run.session.readOnly, true);
    assert.equal(run.session.value, "Unsaved local edit\n");
    await assert.rejects(run.sync.flush(), /read only/);
    assert.ok(run.recovered.includes("Unsaved local edit\n"));
    run.setReadOnly(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(run.host.text, "Unsaved local edit\n");
  } finally { run.close(); }
});

test("real session merges an outside change while local typing is still unaccepted", async () => {
  const base = "# Plan\r\n\r\nFirst paragraph.\r\n\r\nLast paragraph.\r\n";
  const run = await open(base);
  try {
    run.change(base.replace("Last", "My last"));
    assert.equal(run.host.edits.length, 0);
    run.host.replace(base.replace("First", "Outside first"));
    await run.host.flush();
    assert.equal(run.host.text, base.replace("First", "Outside first").replace("Last", "My last"));
  } finally { run.close(); }
});

test("real stale-edit refusal preserves the ambiguous draft through replacement and further typing", async () => {
  const run = await open("Hello\nHello\n");
  try {
    run.change("Hello\n");
    run.host.conflictNext("World\nHello\n");
    await run.host.flush();
    assert.ok(run.host.edits.some((edit) => edit.refused === "conflict"));
    assert.equal(run.host.text, "World\nHello\n");
    assert.equal(run.shown, "World\nHello\n");
    assert.ok(run.recovery.visible().some((draft) => draft.markdown === "Hello\n" && draft.kind === "recovered"));
    run.change("World\nNew typing\n");
    await run.host.flush();
    assert.equal(run.host.text, "World\nNew typing\n");
    assert.ok(run.recovery.visible().some((draft) => draft.markdown === "Hello\n" && draft.kind === "recovered"));
  } finally { run.close(); }
});

test("a newer keystroke survives an older response and independent outside delivery in the same turn", async () => {
  const base = "First paragraph.\n\nLast paragraph.\n";
  const run = await open(base);
  try {
    run.change(base.replace("Last", "My last"));
    const flushing = run.sync.flush();
    run.change(base.replace("Last", "My newest last"));
    // The outside document retains the first edit that was already accepted by the host.
    run.host.replace(base.replace("First", "Outside first").replace("Last", "My last"));
    await flushing;
    await run.host.flush();
    assert.equal(run.host.text, base.replace("First", "Outside first").replace("Last", "My newest last"));
  } finally { run.close(); }
});

test("an outside overwrite racing an acknowledgement keeps the newest exact draft for recovery", async () => {
  const base = "First paragraph.\n\nLast paragraph.\n";
  const run = await open(base);
  try {
    run.change(base.replace("Last", "My last"));
    const flushing = run.sync.flush();
    const newest = base.replace("Last", "My newest last");
    run.change(newest);
    // This outside write also removes the accepted first edit: it overlaps the newer typing.
    const outside = base.replace("First", "Outside first");
    run.host.replace(outside);
    await flushing;
    await run.host.flush();
    assert.equal(run.host.text, outside);
    assert.ok(run.recovery.visible().some((draft) => draft.kind === "recovered" && draft.markdown === newest));
  } finally { run.close(); }
});

test("real read-only sessions submit no edits, including when saved", async () => {
  const run = await open("Read-only content.\n", true);
  try {
    assert.equal(run.session.readOnly, true);
    run.sync.change("Forbidden");
    await run.host.flush();
    assert.equal(run.host.text, "Read-only content.\n");
    assert.equal(run.host.edits.length, 0);
  } finally { run.close(); }
});

test("a real read-only transition retains and reports the unaccepted edit, then retries without new typing", async () => {
  const run = await open("Before\n");
  try {
    run.change("Unsaved local edit\n");
    run.setReadOnly(true);
    await Promise.resolve(); await Promise.resolve();
    assert.equal(run.session.readOnly, true);
    await assert.rejects(run.sync.flush(), /read only/);
    assert.equal(run.host.edits.length, 0);
    assert.equal(run.host.text, "Before\n");
    assert.equal(run.session.value, "Unsaved local edit\n");
    assert.equal(run.pending, true);
    assert.ok(run.recovery.visible().some((draft) => draft.kind === "recovered" && draft.markdown === "Unsaved local edit\n"));
    run.setReadOnly(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(run.session.readOnly, false);
    assert.equal(run.host.text, "Unsaved local edit\n");
    assert.equal(run.pending, false);
  } finally { run.close(); }
});

test("closing during a real read-only transition preserves an explicitly unconfirmed recovery snapshot", async () => {
  const run = await open("Before\n");
  run.change("Keep the newest draft\r\n");
  run.setReadOnly(true);
  await Promise.resolve(); await Promise.resolve();
  await assert.rejects(run.sync.flush(), /read only/);
  run.sync.dispose();
  assert.equal(run.host.text, "Before\n");
  assert.ok(run.recovered.some((draft) => draft.markdown === "Keep the newest draft\r\n" && draft.reason.includes("before its latest edits were confirmed")));
  assert.ok(run.recovery.visible().some((draft) => draft.markdown === "Keep the newest draft\r\n" && draft.kind === "recovered"));
  run.close();
});

test("immediate disposal retains unaccepted work and stops the session from submitting it later", async () => {
  const run = await open("Before.\n");
  run.change("Newest typing before close.\r\n");
  run.sync.dispose();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(run.host.text, "Before.\n");
  assert.equal(run.host.edits.length, 0);
  assert.ok(run.recovery.visible().some((draft) => draft.markdown === "Newest typing before close.\r\n"));
  run.close();
});

test("repeated real session startup/disposal leaves no delayed edits", async () => {
  for (let i = 0; i < 20; i++) {
    const run = await open(`Frame ${i}\n`);
    run.session.change(`Pending ${i}\n`);
    run.close();
    await Promise.resolve();
    assert.equal(run.host.edits.length, 0);
  }
});
