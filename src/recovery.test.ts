// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { DraftSession, DraftStore } from "./recovery";

beforeEach(() => localStorage.clear());

describe("recoverable drafts", () => {
  it("does not dismiss the current in-memory checkpoint when storage is unavailable", () => {
    const store = new DraftStore();
    const session = new DraftSession(store);
    session.checkpoint("Newest unsaved bytes");
    const current = session.visible()[0];
    expect(session.canDismiss(current.id)).toBe(false);
    expect(session.dismiss(current)).toBe(false);
    expect(session.visible()[0].markdown).toBe("Newest unsaved bytes");
  });

  it("rejects dismissal of a checkpoint changed since confirmation was opened", () => {
    const store = new DraftStore(localStorage);
    store.checkpoint("another-frame", "First");
    const previous = store.list()[0];
    store.checkpoint("another-frame", "Latest");
    expect(store.remove(previous.id, previous)).toBe(false);
    expect(store.list()[0].markdown).toBe("Latest");
  });

  it("reports a failed deletion and retains the copy when storage refuses removal", () => {
    const store = new DraftStore({
      get length() { return localStorage.length; },
      key: (i) => localStorage.key(i), getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem() { throw new Error("Storage unavailable"); },
    });
    const draft = store.add("Keep this recovery", "Conflict");
    expect(store.remove(draft.id, draft)).toBe(false);
    expect(store.list()).toEqual([draft]);
  });

  it("does not delete a stored draft whose current content cannot be checked", () => {
    let denyReads = false;
    const store = new DraftStore({
      get length() { return localStorage.length; }, key: (i) => localStorage.key(i),
      getItem(key) { if (denyReads) throw new Error("Read denied"); return localStorage.getItem(key); },
      setItem: (key, value) => localStorage.setItem(key, value), removeItem: (key) => localStorage.removeItem(key),
    });
    const draft = store.add("Keep until checked", "Conflict");
    denyReads = true;
    expect(store.remove(draft.id, draft)).toBe(false);
    expect(localStorage.getItem("milko.recovery." + draft.id)).not.toBeNull();
  });
  it("retains a recovered snapshot when typing continues after an in-frame conflict", () => {
    const store = new DraftStore(localStorage);
    const session = new DraftSession(store);
    session.checkpoint("Local draft before conflict");
    const checkpoint = store.list()[0];
    session.recover("Local draft before conflict", "Conflict");
    session.checkpoint("New typing in the outside document");
    // Even the old mutable checkpoint cannot overwrite the immutable recovery snapshot.
    store.checkpoint(checkpoint.id, "Later checkpoint");
    expect(session.visible()).toContainEqual(expect.objectContaining({
      markdown: "Local draft before conflict", kind: "recovered",
    }));
    expect(new DraftStore(localStorage).list()).toContainEqual(expect.objectContaining({
      markdown: "Local draft before conflict", kind: "recovered",
    }));
  });

  it("exposes the newest in-memory checkpoint after an update exceeds storage quota", () => {
    let full = false;
    const store = new DraftStore({
      get length() { return localStorage.length; },
      key: (i) => localStorage.key(i), getItem: (key) => localStorage.getItem(key),
      removeItem: (key) => localStorage.removeItem(key),
      setItem(key, value) { if (full) throw new Error("Quota exceeded"); localStorage.setItem(key, value); },
    });
    const session = new DraftSession(store);
    session.checkpoint("FIRST");
    expect(session.visible()).toEqual([]);
    full = true;
    session.checkpoint("LATEST");
    expect(store.persistent).toBe(false);
    expect(store.list().map((draft) => draft.markdown)).toEqual(["LATEST"]);
    expect(session.visible().map((draft) => draft.markdown)).toEqual(["LATEST"]);
  });
  it("survives closing and reopening a frame without applying to an unidentified document", () => {
    const draft = new DraftStore(localStorage).add("# My unsaved work\n", "Overlapping write");
    const reopened = new DraftStore(localStorage);
    expect(reopened.list()).toEqual([draft]);
    reopened.remove(draft.id);
    expect(new DraftStore(localStorage).list()).toEqual([]);
  });

  it("deduplicates the same draft across repeated refusals", () => {
    const store = new DraftStore(localStorage);
    store.add("My draft", "First refusal");
    store.add("My draft", "Second refusal");
    expect(store.list()).toHaveLength(1);
  });

  it("keeps drafts in memory if persistent storage fails", () => {
    const store = new DraftStore({
      length: 0, key: () => null, getItem: () => null, removeItem: () => {},
      setItem() { throw new Error("Quota exceeded"); },
    });
    store.add("Do not lose this", "Save failed");
    expect(store.list()[0].markdown).toBe("Do not lose this");
  });

  it("ignores corrupt and unrelated entries", () => {
    localStorage.setItem("unrelated", "private");
    localStorage.setItem("milko.recovery.bad", "broken JSON");
    localStorage.setItem("milko.recovery.wrong", JSON.stringify({ id: "wrong", markdown: 9 }));
    const store = new DraftStore(localStorage);
    store.add("Valid draft", "Conflict");
    expect(store.list()).toHaveLength(1);
  });

  it("observes dismissal from another open frame", () => {
    const first = new DraftStore(localStorage);
    const second = new DraftStore(localStorage);
    const draft = first.add("Shared recovery draft", "Conflict");
    expect(second.list()).toHaveLength(1);
    first.remove(draft.id);
    expect(second.list()).toEqual([]);
  });

  it("keeps one current checkpoint through abrupt frame recreation", () => {
    const frame = new DraftStore(localStorage);
    frame.checkpoint("this-session", "First keystroke");
    frame.checkpoint("this-session", "Latest exact Markdown\r\n");
    const reopened = new DraftStore(localStorage);
    expect(reopened.list()).toHaveLength(1);
    expect(reopened.list()[0].markdown).toBe("Latest exact Markdown\r\n");
  });
});
