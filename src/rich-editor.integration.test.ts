// @vitest-environment jsdom
import { editorViewCtx } from "@milkdown/kit/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFERENCES } from "./preferences";
import { mountEditor, type RichEditor } from "./rich-editor";
import { undo } from "@milkdown/kit/prose/history";
import { EditorView as CodeMirrorView } from "@codemirror/view";

// Capture the actual Crepe instance; all its plugins, node views and controls remain real.
const instances = vi.hoisted(() => [] as import("@milkdown/crepe").Crepe[]);
vi.mock("@milkdown/crepe", async (original) => {
  const module = await original<typeof import("@milkdown/crepe")>();
  return { ...module, Crepe: class extends module.Crepe {
    constructor(config: ConstructorParameters<typeof module.Crepe>[0]) { super(config); instances.push(this); }
  } };
});
const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));

let editor: RichEditor | undefined;
const notice = vi.fn(); const recover = vi.fn(); const change = vi.fn();

beforeAll(() => {
  // jsdom has no viewport/layout observers. Deliver visibility, leaving the real CodeMirror
  // and Vue components to mount and handle their own events.
  vi.stubGlobal("IntersectionObserver", class {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element) { queueMicrotask(() => this.callback([{ target, isIntersecting: true } as IntersectionObserverEntry], this as unknown as IntersectionObserver)); }
    unobserve() {} disconnect() {} takeRecords() { return []; }
  });
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
beforeEach(() => {
  vi.clearAllMocks(); instances.length = 0;
  mermaid.render.mockResolvedValue({ svg: "<svg><text>Diagram</text></svg>" });
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => {}) } });
  Object.defineProperty(document, "execCommand", { configurable: true, value: vi.fn(() => true) });
});
afterEach(async () => { await editor?.destroy(); editor = undefined; document.body.replaceChildren(); });

async function open(markdown: string, readOnly = false) {
  const root = document.body.appendChild(document.createElement("main"));
  editor = await mountEditor(root, markdown, {
    readOnly, change, recover, notice,
    preferences: { ...DEFAULT_PREFERENCES, proofingEnabled: false },
    addDictionaryWord() {}, proofingStatus() {},
  });
  return { root, view: instances.at(-1)!.editor.ctx.get(editorViewCtx) };
}

async function copyButton(root: HTMLElement) {
  await vi.waitFor(() => expect(root.querySelector("button.copy-button")).not.toBeNull());
  return root.querySelector<HTMLButtonElement>("button.copy-button")!;
}

describe("production MilkO with real Crepe controls", () => {
  it.each([false, true])("refreshes mounted CodeMirror read-only state in both directions (initially %s), without document edits", async (initial) => {
    const original = "Before.\n\n```text\nProtected code\n```\n";
    const { root, view } = await open(original, initial);
    await copyButton(root);
    const content = root.querySelector<HTMLElement>(".cm-content")!;
    const cm = CodeMirrorView.findFromDOM(content)!;
    for (const readOnly of [initial, !initial, initial, false]) {
      editor!.setReadOnly(readOnly);
      expect(view.editable).toBe(!readOnly);
      expect(cm.state.readOnly).toBe(readOnly);
      expect(content.getAttribute("contenteditable")).toBe(String(!readOnly));
      expect(root.querySelector(".cm-content")).toBe(content);
      expect(editor!.getSource()).toBe(original);
    }
    expect(change).not.toHaveBeenCalled();
    cm.focus(); cm.dispatch({ changes: { from: 0, insert: "Writable " } });
    expect(editor!.getSource()).toBe(original.replace("Protected", "Writable Protected"));
  });

  it("rejects a stale language-picker choice while read-only and cannot save it with later prose typing", async () => {
    const original = "Before.\n\n```text\nexample code\n```\n";
    const { root, view } = await open(original);
    await copyButton(root);
    root.querySelector<HTMLButtonElement>(".language-button")!.click();
    await vi.waitFor(() => expect(root.querySelector(".language-list-item[data-language]")).not.toBeNull());
    const choice = [...root.querySelectorAll<HTMLElement>(".language-list-item[data-language]")].find((item) => item.dataset.language === "C")!;
    expect(choice).toBeDefined();
    const doc = view.state.doc;
    editor!.setReadOnly(true);
    choice.click(); // Retain the old DOM control, just as an already-queued UI event can.
    await Promise.resolve();
    expect(view.state.doc).toBe(doc);
    expect(root.querySelector<HTMLElement>(".language-picker")!.hidden).toBe(true);
    expect(root.querySelector<HTMLButtonElement>(".language-button")!.disabled).toBe(true);
    expect(editor!.getSource()).toBe(original);
    expect(change).not.toHaveBeenCalled();
    editor!.setReadOnly(false);
    view.dispatch(view.state.tr.insertText("X", 1));
    expect(editor!.getSource()).toBe("X" + original);
    expect(recover).not.toHaveBeenCalled();
  });

  it("blocks document-changing transactions while read-only but permits host replacements", async () => {
    const { view } = await open("Original.\n", true);
    const before = view.state.doc;
    view.dispatch(view.state.tr.insertText("Forbidden ", 1));
    expect(view.state.doc).toBe(before);
    expect(change).not.toHaveBeenCalled();
    editor!.replaceMarkdown("Outside replacement.\n");
    expect(editor!.getSource()).toBe("Outside replacement.\n");
    expect(view.state.doc.textContent).toBe("Outside replacement.");
    expect(change).not.toHaveBeenCalled();
  });
  it("changes themes in the existing editor and refreshes diagrams while preserving unsaved source, selection and undo", async () => {
    const source = "Keep __these__ bytes.\r\n\r\n```mermaid\r\nflowchart LR\r\nA --> B\r\n```\r\n";
    const { root, view } = await open(source);
    await vi.waitFor(() => expect(root.textContent).toContain("Diagram"));
    view.dispatch(view.state.tr.insertText("New ", 1));
    const sourceWithEdit = editor!.getSource();
    const selection = view.state.selection;
    const doc = view.state.doc;
    change.mockClear();
    mermaid.render.mockResolvedValue({ svg: "<svg><text>Forest diagram</text></svg>" });
    editor!.configure({ ...DEFAULT_PREFERENCES, proofingEnabled: false, appearance: "dark", editorTheme: "classic", mermaidTheme: "forest" });
    await vi.waitFor(() => expect(root.textContent).toContain("Forest diagram"));
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: "forest" }));
    expect(instances).toHaveLength(1);
    expect(view.state.doc).toBe(doc);
    expect(view.state.selection.eq(selection)).toBe(true);
    expect(editor!.getSource()).toBe(sourceWithEdit);
    expect(change).not.toHaveBeenCalled();
    expect(recover).not.toHaveBeenCalled();
    expect(undo(view.state, view.dispatch)).toBe(true);
    expect(editor!.getSource()).toBe(source);
  });
  it("repeatedly mounts and destroys real editor controls without retaining rails, bars or per-editor styles", async () => {
    let stylesAfterFirst = 0;
    for (let i = 0; i < 20; i++) {
      const source = "# Lifecycle\r\n\r\nKeep __this__ exactly.\r\n\r\n```mermaid\r\nflowchart LR\r\nA --> B\r\n```\r\n";
      const { root } = await open(source);
      await copyButton(root);
      editor!.find();
      expect(editor!.getSource()).toBe(source);
      await editor!.destroy(); editor = undefined;
      root.remove();
      expect(document.querySelector(".milko-findbar")).toBeNull();
      expect(document.querySelector(".milko-outline")).toBeNull();
      expect(document.querySelector(".milko-outline-toggle")).toBeNull();
      const styles = document.head.querySelectorAll("style").length;
      if (i === 0) stylesAfterFirst = styles;
      else expect(styles).toBe(stylesAfterFirst);
    }
  });
  it("creates both prose and CodeMirror read-only from their first mount", async () => {
    const { root, view } = await open("Read only.\n\n```text\nProtected code\n```\n", true);
    await copyButton(root);
    expect(view.editable).toBe(false);
    expect(root.querySelector(".ProseMirror")?.getAttribute("contenteditable")).toBe("false");
    expect(root.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");
    expect(change).not.toHaveBeenCalled();
    editor!.setReadOnly(false);
    expect(view.editable).toBe(true);
    view.dispatch(view.state.tr.insertText("Writable", 1, 5));
    expect(change).toHaveBeenCalled();
    editor!.setReadOnly(true);
    expect(view.editable).toBe(false);
    expect(root.querySelector(".cm-content")?.getAttribute("contenteditable")).toBe("false");
  });
  it("copies through MilkO first, exactly once, on Crepe's actual code-copy button", async () => {
    const { root } = await open("```typescript\nconst café = '🥛';\n```\n");
    (await copyButton(root)).click();
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("const café = '🥛';"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(document.execCommand).not.toHaveBeenCalled();
    expect(notice).not.toHaveBeenCalled();
  });

  it("uses the fallback after an asynchronous permission rejection on the actual button", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("Permission denied"));
    const { root } = await open("```text\nExact source\n```\n");
    (await copyButton(root)).click();
    await vi.waitFor(() => expect(document.execCommand).toHaveBeenCalledWith("copy"));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(notice).not.toHaveBeenCalled();
    expect(document.querySelector("textarea[aria-hidden]")).toBeNull();
  });

  it("reports a failed fallback from the actual copy button", async () => {
    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(new Error("Permission denied"));
    vi.mocked(document.execCommand).mockReturnValue(false);
    const { root } = await open("```text\nSource\n```\n");
    (await copyButton(root)).click();
    await vi.waitFor(() => expect(notice).toHaveBeenCalledWith(expect.stringContaining("Clipboard access was refused")));
  });

  it("edits prose around a resolved reference link without changing the original link or definition", async () => {
    const source = 'alpha [text][ref] rest.\n\n[ref]: https://example.test "Title"\n';
    const { view } = await open(source);
    expect(change).not.toHaveBeenCalled();
    view.dispatch(view.state.tr.insertText("beta", 1, 6));
    expect(editor!.getSource()).toBe(source.replace("alpha", "beta"));
    expect(recover).not.toHaveBeenCalled();
  });

  it("deletes one real table row without padding the rows left behind", async () => {
    const source = "Keep __this__.\n\n| A | B |\n| --- | --- |\n| widest | a very long cell which controls the padding of every remaining row |\n| keep one | value 1 |\n| delete me | value 2 |\n| keep two | value 3 |\n";
    const { view } = await open(source);
    let target: { from: number; to: number } | undefined;
    view.state.doc.descendants((node, pos) => {
      if (node.type.name === "table_row" && node.textContent === "delete mevalue 2") target = { from: pos, to: pos + node.nodeSize };
    });
    expect(target).toBeDefined();
    view.dispatch(view.state.tr.delete(target!.from, target!.to));
    expect(editor!.getSource()).toBe(source.replace("| delete me | value 2 |\n", ""));
    expect(recover).not.toHaveBeenCalled();
  });

  it("does not let a late diagram hide the actual TypeScript code view after a language change", async () => {
    let complete!: (value: { svg: string }) => void;
    mermaid.render.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const { root, view } = await open("```mermaid\nflowchart LR\nA --> B\n```\n");
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    view.dispatch(view.state.tr.setNodeMarkup(0, undefined, { ...view.state.doc.firstChild!.attrs, language: "typescript" }));
    await vi.waitFor(() => expect(root.querySelector(".codemirror-host")?.classList.contains("hidden")).toBe(false));
    complete({ svg: "<svg><text>STALE DIAGRAM</text></svg>" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(root.textContent).not.toContain("STALE DIAGRAM");
    expect(root.querySelector(".codemirror-host")?.classList.contains("hidden")).toBe(false);
  });
});
