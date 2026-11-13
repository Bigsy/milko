// @vitest-environment jsdom
import type { EditorSession } from "orca/frame";
import type { ProofingStatus } from "./proofing/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rich = vi.hoisted(() => ({
  source: "", pending: undefined as string | undefined,
  callbacks: undefined as undefined | { change(markdown: string): void; notice(message: string): void; proofingStatus(value: ProofingStatus): void },
}));
vi.mock("./rich-editor", () => ({
  mountEditor: vi.fn(async (_root, source, options) => {
    rich.source = source; rich.callbacks = options;
    // As in the real editor, rich-text edits stay pending until flushed or read.
    const flush = () => {
      if (rich.pending === undefined) return false;
      rich.source = rich.pending; rich.pending = undefined;
      options.change(rich.source);
      return true;
    };
    return {
      getSource: () => { flush(); return rich.source; },
      flush,
      replaceMarkdown: (markdown: string) => { rich.pending = undefined; rich.source = markdown; },
      configure() {}, find() {}, navigate() {}, setReadOnly() {}, async destroy() {},
    };
  }),
}));

let merge: (base: string, outside: string, mine: string) => string;
let replace: (markdown: string) => void;
let session: EditorSession<string>;
let sessionValue: string;
let acceptedValue: string;
let sessionReadOnly: boolean;
let documentListeners: Array<() => void>;
let saveListeners: Array<() => unknown>;
/** How many document and save listeners existed when MilkO created its session. */
let beforeSession: { documents: number; saves: number };
function documentChanged() { documentListeners.forEach((listener) => listener()); }
function save() { return Promise.all(saveListeners.map((listener) => listener())); }

beforeEach(async () => {
  vi.resetModules(); localStorage.clear(); rich.callbacks = undefined; rich.pending = undefined;
  document.body.innerHTML = '<span id="status"></span><span id="proofing-status"></span><div id="notice" hidden></div><div id="recovery" hidden></div><main id="app"></main><button id="options"></button><button id="find"></button><button id="shortcuts"></button>';
  sessionValue = "Hello\nHello\n";
  acceptedValue = sessionValue;
  sessionReadOnly = false;
  session = {
    get value() { return sessionValue; }, get readOnly() { return sessionReadOnly; },
    change: vi.fn((markdown) => { sessionValue = markdown; }), flush: vi.fn(async () => { if (!sessionReadOnly) acceptedValue = sessionValue; }),
    onReplace: (callback) => { replace = callback; return { dispose() {} }; }, dispose() {},
  };
  documentListeners = []; saveListeners = [];
  const listen = <T>(list: T[], listener: T) => {
    list.push(listener);
    return { dispose() { list.splice(list.indexOf(listener), 1); } };
  };
  Object.defineProperty(window, "orca", { configurable: true, value: {
    document: {
      get: async () => ({ version: 0, readOnly: sessionReadOnly, content: { kind: "text", text: acceptedValue } }),
      session: async (options: { merge: typeof merge }) => {
        merge = options.merge;
        beforeSession = { documents: documentListeners.length, saves: saveListeners.length };
        return session;
      },
      onDidChange: (callback: () => void) => listen(documentListeners, callback),
    },
    on: (event: string, callback: () => unknown) => event === "editor.flush" ? listen(saveListeners, callback) : { dispose() {} },
  } });
  await import("./main");
  await vi.waitFor(() => expect(rich.callbacks).toBeDefined());
});
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  vi.restoreAllMocks(); document.body.replaceChildren();
});
function type(markdown: string) { rich.source = markdown; rich.callbacks!.change(markdown); }
function visibleDrafts() {
  expect(document.querySelector<HTMLElement>("#recovery")!.hidden).toBe(false);
  return [...document.querySelectorAll<HTMLTextAreaElement>("#recovery textarea")].map((input) => input.value);
}
function dismissalDialog() {
  const dialog = document.querySelector<HTMLDialogElement>(".milko-dismiss-drafts")!;
  Object.defineProperties(dialog, {
    showModal: { value: () => { dialog.open = true; } },
    close: { value: () => { dialog.open = false; dialog.dispatchEvent(new Event("close")); } },
  });
  return dialog;
}
function addTwoDrafts() {
  merge("Base\n", "Outside\n", "First recovered draft\n");
  merge("Base\n", "Outside\n", "Second recovered draft\n");
}

describe("recovery wired through the Orca frame", () => {
  it("confirms bulk dismissal, supports cancellation and preserves the current checkpoint and document", () => {
    addTwoDrafts();
    type("Current editing checkpoint");
    const dialog = dismissalDialog();
    const open = () => document.querySelector<HTMLButtonElement>("[data-dismiss-all]")!.click();
    open();
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain("2 saved drafts");
    expect(visibleDrafts()).toHaveLength(2);
    dialog.querySelector<HTMLButtonElement>("[data-cancel-dismiss]")!.click();
    expect(visibleDrafts()).toHaveLength(2);
    open();
    session.change = vi.fn();
    dialog.querySelector<HTMLButtonElement>("[data-confirm-dismiss]")!.click();
    expect(document.querySelector<HTMLElement>("#recovery")!.hidden).toBe(true);
    expect(session.value).toBe("Current editing checkpoint");
    expect(rich.source).toBe("Current editing checkpoint");
    expect(session.change).not.toHaveBeenCalled();
    const saved = Object.keys(localStorage).filter((key) => key.startsWith("milko.recovery."))
      .map((key) => JSON.parse(localStorage.getItem(key)!));
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ kind: "checkpoint", markdown: "Current editing checkpoint" });
  });

  it("keeps drafts added or changed in another frame while bulk confirmation is open", () => {
    addTwoDrafts();
    const dialog = dismissalDialog();
    document.querySelector<HTMLButtonElement>("[data-dismiss-all]")!.click();
    const key = Object.keys(localStorage).find((key) => key.startsWith("milko.recovery."))!;
    const changed = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...changed, markdown: "Newer draft in another frame" }));
    localStorage.setItem("milko.recovery.new", JSON.stringify({ id: "new", created: new Date().toISOString(), markdown: "New draft", reason: "Conflict", kind: "recovered" }));
    dialog.querySelector<HTMLButtonElement>("[data-confirm-dismiss]")!.click();
    expect(visibleDrafts().sort()).toEqual(["New draft", "Newer draft in another frame"]);
    expect(document.querySelector("#notice")!.textContent).toContain("Those drafts were kept");
  });
  it("opens the shortcuts reference from its header button and removes it on unload", () => {
    const dialog = document.querySelector<HTMLDialogElement>(".milko-shortcuts")!;
    const show = vi.fn(() => { dialog.open = true; });
    Object.defineProperty(dialog, "showModal", { value: show });
    document.querySelector<HTMLButtonElement>("#shortcuts")!.click();
    expect(show).toHaveBeenCalledOnce();
    expect(dialog.textContent).toContain("Find and replace");
    expect(session.change).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("pagehide"));
    expect(document.querySelector(".milko-shortcuts")).toBeNull();
  });
  it("reports an unaccepted read-only draft and automatically retries after write access returns", async () => {
    type("LATEST");
    sessionReadOnly = true; documentChanged();
    await vi.waitFor(() => expect(visibleDrafts()).toContain("LATEST"));
    expect(document.querySelector("#notice")!.textContent).toContain("read only");
    expect(document.querySelector("#status")!.textContent).toBe("Read only · edits unconfirmed");
    expect(acceptedValue).not.toBe("LATEST");
    sessionReadOnly = false; documentChanged();
    await vi.waitFor(() => expect(acceptedValue).toBe("LATEST"));
    expect(document.querySelector("#status")!.textContent).toBe("Ready");
    expect(document.querySelector<HTMLElement>("#notice")!.hidden).toBe(true);
    expect(visibleDrafts()).toContain("LATEST");
  });
  it("clears resolved proofing diagnostics without hiding unrelated recovery warnings", () => {
    const banner = document.querySelector<HTMLElement>("#notice")!;
    rich.callbacks!.notice("Harper could not check this document: invalid pack");
    rich.callbacks!.proofingStatus("error");
    expect(banner.hidden).toBe(false);
    rich.callbacks!.proofingStatus("idle");
    expect(banner.hidden).toBe(true);
    rich.callbacks!.notice("Keep this recovered draft before closing.");
    rich.callbacks!.proofingStatus("idle");
    expect(banner.hidden).toBe(false);
  });

  it("updates status when a read-only document becomes writable again", () => {
    sessionReadOnly = true; documentChanged();
    expect(document.querySelector("#status")!.textContent).toBe("Read only");
    sessionReadOnly = false; documentChanged();
    expect(document.querySelector("#status")!.textContent).toBe("Ready");
  });
  it("refuses an ambiguous merge, exposes the local snapshot, and keeps it after typing in the replacement", () => {
    type("Hello\n");
    const outside = "World\nHello\n";
    const result = merge("Hello\nHello\n", outside, rich.source);
    expect(result).toBe(outside);
    sessionValue = result; replace(result);
    expect(visibleDrafts()).toContain("Hello\n");
    type("World\nNew typing in the replacement\n");
    // Re-render through another real recovery event, and inspect persisted snapshots too.
    merge("World\nHello\n", "Agent\nHello\n", rich.source);
    expect(visibleDrafts()).toContain("Hello\n");
    const persisted = Object.keys(localStorage).filter((key) => key.startsWith("milko.recovery."))
      .map((key) => JSON.parse(localStorage.getItem(key)!).markdown);
    expect(persisted).toContain("Hello\n");
  });

  it("shows a copyable LATEST checkpoint when updating the stored FIRST checkpoint fails", () => {
    type("FIRST");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage full"); });
    type("LATEST");
    expect(visibleDrafts()).toEqual(["LATEST"]);
    expect(document.querySelector("#notice")!.textContent).toContain("Copy or save");
  });

  describe("rich-text edits still pending in the editor", () => {
    it("reach the session before Orca's own save and document listeners run", () => {
      // Orca's frame runs listeners in the order they were added; the session adds its own when created.
      expect(beforeSession).toEqual({ documents: 1, saves: 1 });
      rich.pending = "Typed just before an outside change\n";
      documentListeners[0]();
      expect(session.change).toHaveBeenLastCalledWith("Typed just before an outside change\n");
    });

    it("are sent by a save", async () => {
      type("Saved\n");
      rich.pending = "Saved, then typed\n";
      await save();
      expect(session.change).toHaveBeenLastCalledWith("Saved, then typed\n");
      expect(acceptedValue).toBe("Saved, then typed\n");
    });

    it("join Orca's merge with an outside change, even when its draft predates them", () => {
      type("One\nTwo\nThree\n");
      rich.pending = "One\nTwo\nThree, mine\n";
      expect(merge("One\nTwo\nThree\n", "One, outside\nTwo\nThree\n", "One\nTwo\nThree\n"))
        .toBe("One, outside\nTwo\nThree, mine\n");
    });

    it("are kept as a draft, never sent, when Orca replaces the document without them", () => {
      type("Delivered\n");
      rich.pending = "Typed but not delivered\n";
      const sent = vi.mocked(session.change).mock.calls.length;
      sessionValue = "Outside\n"; replace("Outside\n");
      expect(vi.mocked(session.change).mock.calls).toHaveLength(sent);
      expect(rich.source).toBe("Outside\n");
      expect(visibleDrafts()).toContain("Typed but not delivered\n");
    });

    it("reach the session and its recovery before the frame closes", () => {
      rich.pending = "Last words\n";
      window.dispatchEvent(new Event("pagehide"));
      expect(session.change).toHaveBeenLastCalledWith("Last words\n");
      const saved = Object.keys(localStorage).filter((key) => key.startsWith("milko.recovery."))
        .map((key) => JSON.parse(localStorage.getItem(key)!));
      expect(saved).toContainEqual(expect.objectContaining({ kind: "recovered", markdown: "Last words\n" }));
    });
  });
});
