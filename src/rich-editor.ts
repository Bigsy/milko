import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { setCodeMirrorTheme } from "@milkdown/crepe/feature/code-mirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState as CodeMirrorState } from "@codemirror/state";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { editorViewCtx, parserCtx, remarkCtx, serializerCtx } from "@milkdown/kit/core";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import { EditorState, Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import { SourceBlockIndex } from "./markdown/block-index";
import { parseObservingBlocks, splitMarkdownBlocks, splitTopLevelBlocks } from "./markdown/markdown-blocks";
import { mergeSourcePreservingEdit, type SourceMergeResult } from "./markdown/source-preserving-sync";
import { createMermaidPreview } from "./mermaid-preview";
import { search } from "prosemirror-search";
import { installFindBar } from "./findbar";
import { installOutline } from "./outline";
import { navigateToHeadingAnchor } from "./heading-anchors";
import { ProofingController } from "./proofing/plugin";
import type { ProofingStatus } from "./proofing/types";
import { applyAppearance, type Preferences } from "./preferences";
import { installCodeBlockIntegration } from "./code-block";
import { createHtmlPreviewPlugin } from "./html-preview";
import { resolveMermaidTheme } from "./themes";

export interface RichEditor {
  /** Shows an outside document; rich-text edits not yet merged are superseded by it. */
  replaceMarkdown(markdown: string): void;
  setReadOnly(readOnly: boolean): void;
  /** The Markdown source of the current document, merging any pending rich-text edits first. */
  getSource(): string;
  /**
   * Merges pending rich-text edits now and reports them through `change` (or `recover`). Returns
   * whether there were any. Edits are otherwise merged once the keystroke has painted, or once a
   * held key is released, so the host must flush before anything reads or replaces its draft.
   */
  flush(): boolean;
  configure(preferences: Preferences): void;
  find(): void;
  navigate(href: string): boolean;
  destroy(): Promise<void>;
}

interface Options {
  readOnly: boolean;
  change(markdown: string): void;
  recover(markdown: string, reason: string): void;
  notice(message: string): void;
  preferences: Preferences;
  addDictionaryWord(word: string): void;
  proofingStatus(status: ProofingStatus): void;
}

/**
 * While a key auto-repeats (usually a held Backspace), pending edits merge at least this often.
 * Each merge reparses the document, so merging every repeat outpaces the key on larger documents.
 */
const MAX_HELD_MERGE_DELAY_MS = 1000;
/** Animation frames stop in a hidden frame; this bounds how long a merge waits for one. */
const FRAME_FALLBACK_MS = 100;

export async function mountEditor(root: HTMLElement, initial: string, options: Options): Promise<RichEditor> {
  let source = initial;
  let canonicalSource: string | undefined;
  /** Each document an edit produced since the last merge, oldest first. */
  let pendingDocs: ProseMirrorNode[] = [];
  let pendingSince = 0;
  let keyHeld = false;
  let mergeFrame: number | undefined;
  let mergeTimer: ReturnType<typeof setTimeout> | undefined;
  const events = new AbortController();
  let applying = true;
  let readOnly = options.readOnly;
  let disposed = false;
  let ready = false;
  let preferences = options.preferences;
  const proofing = new ProofingController({
    onUserEdit: () => {}, // Every document transaction is already tracked below.
    onAddDictionaryWord: options.addDictionaryWord,
    onStatus: options.proofingStatus,
    onError: (message) => options.notice(`Harper could not check this document: ${message}. Editing still works; disable proofing or remove an invalid Weirpack in Options.`),
  });
  proofing.configure(preferences.proofingEnabled, preferences.dialect, readOnly, preferences.dictionary, preferences.weirpacks.map((pack) => pack.data));
  let appearance = applyAppearance(preferences);
  let diagramTheme = resolveMermaidTheme(preferences.mermaidTheme, appearance);
  const diagrams = createMermaidPreview(() => diagramTheme);
  const blockedImage = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="280" height="70"><rect width="280" height="70" rx="6" fill="#e5e7eb"/><text x="140" y="40" text-anchor="middle" font-family="system-ui" font-size="14" fill="#374151">Image preview unavailable</text></svg>',
  );
  const crepe = new Crepe({
    root,
    defaultValue: initial,
    featureConfigs: {
      [CrepeFeature.Placeholder]: { text: "Write Markdown…", mode: "block" },
      [CrepeFeature.CodeMirror]: {
        theme: appearance === "dark" ? oneDark : [],
        extensions: [CodeMirrorView.editable.compute([CodeMirrorState.readOnly], (state) => !state.facet(CodeMirrorState.readOnly))],
        previewOnlyByDefault: true,
        previewToggleText: (previewOnly) => previewOnly ? "Edit source" : "Hide source",
      },
      [CrepeFeature.ImageBlock]: {
        proxyDomURL: (url) => /^data:image\/(?:png|jpeg|gif|webp|avif);/i.test(url) ? url : blockedImage,
        onUpload: async () => {
          options.notice("Image uploads are not available in Orca yet.");
          return "";
        },
      },
    },
  });
  // The initial view and lazy node views must start read-only, before the first paint.
  crepe.setReadonly(readOnly);
  const codeBlocks = installCodeBlockIntegration(crepe.editor, diagrams, options.notice);
  const getView = () => ready && !disposed ? crepe.editor.ctx.get(editorViewCtx) : undefined;
  const findbar = installFindBar({ getView, onUserEdit: () => {} });
  const outline = installOutline({ getView });
  findbar.setReadonly(readOnly);
  function configure(next: Preferences) {
    preferences = next;
    const nextAppearance = applyAppearance(next);
    if (ready && nextAppearance !== appearance) crepe.editor.action(setCodeMirrorTheme(nextAppearance === "dark" ? oneDark : []));
    appearance = nextAppearance;
    const nextDiagramTheme = resolveMermaidTheme(next.mermaidTheme, appearance);
    if (nextDiagramTheme !== diagramTheme) {
      diagramTheme = nextDiagramTheme;
      diagrams.refresh();
    }
    proofing.configure(next.proofingEnabled, next.dialect, readOnly, next.dictionary, next.weirpacks.map((pack) => pack.data));
  }
  const canonicalize = (markdown: string) => crepe.editor.action((ctx) => ctx.get(serializerCtx)(ctx.get(parserCtx)(markdown)));
  const blockIndex = new SourceBlockIndex({
    splitTopLevel: (markdown) => splitTopLevelBlocks(crepe.editor.ctx.get(remarkCtx), markdown),
    canonicalizeObserving: (markdown, knownKey) => crepe.editor.action((ctx) => {
      const { result, blocks } = parseObservingBlocks(ctx.get(remarkCtx), markdown, ctx.get(parserCtx), knownKey);
      return { canonical: ctx.get(serializerCtx)(result), blocks };
    }),
  });

  function replaceMarkdown(markdown: string): void {
    if (disposed) return;
    // The outside document supersedes edits not merged yet. Hosts flush before they decide to
    // replace, so normally there are none.
    cancelScheduledMerge();
    pendingDocs = [];
    applying = true;
    try {
      const view = crepe.editor.ctx.get(editorViewCtx);
      const parsed = crepe.editor.ctx.get(parserCtx)(markdown);
      source = markdown;
      canonicalSource = undefined;
      if (parsed.eq(view.state.doc)) return;
      const anchor = Math.min(view.state.selection.anchor, parsed.content.size);
      // Clear old undo history: undo must never bring back a superseded outside document.
      view.updateState(EditorState.create({
        schema: view.state.schema,
        doc: parsed,
        plugins: view.state.plugins,
        selection: TextSelection.near(parsed.resolve(anchor)),
      }));
    } finally {
      applying = false;
      findbar.syncToView();
      outline.refresh();
    }
  }

  function cancelScheduledMerge(): void {
    if (mergeFrame !== undefined) cancelAnimationFrame(mergeFrame);
    clearTimeout(mergeTimer);
    mergeFrame = mergeTimer = undefined;
  }

  function scheduleMerge(): void {
    cancelScheduledMerge();
    if (disposed || !pendingDocs.length) return;
    if (keyHeld) {
      // Merge once the key is released, and at least every MAX_HELD_MERGE_DELAY_MS while it is held.
      mergeTimer = setTimeout(flush, Math.max(0, pendingSince + MAX_HELD_MERGE_DELAY_MS - Date.now()));
      return;
    }
    // Let the keystroke paint first. Edits that arrive before then join the same merge.
    const hasFrames = typeof requestAnimationFrame === "function";
    if (hasFrames) {
      mergeFrame = requestAnimationFrame(() => {
        mergeFrame = undefined;
        clearTimeout(mergeTimer);
        mergeTimer = setTimeout(flush, 0);
      });
    }
    mergeTimer = setTimeout(flush, hasFrames ? FRAME_FALLBACK_MS : 0);
  }

  /** Merges one document state into the source; on success, the next merge starts from it. */
  function mergeInto(doc: ProseMirrorNode): { canonical: string; result: SourceMergeResult } {
    const canonical = crepe.editor.ctx.get(serializerCtx)(doc);
    const result = mergeSourcePreservingEdit(source, canonical, canonicalize, canonicalSource,
      (markdown) => splitMarkdownBlocks(crepe.editor.ctx.get(remarkCtx), markdown), blockIndex);
    if (result.ok) {
      source = result.markdown;
      canonicalSource = canonical;
    }
    return { canonical, result };
  }

  function flush(): boolean {
    cancelScheduledMerge();
    const docs = pendingDocs;
    pendingDocs = [];
    if (disposed || !docs.length) return false;
    const latest = mergeInto(docs[docs.length - 1]);
    const whole = latest.result;
    if (whole.ok) {
      options.change(source);
      return true;
    }
    // The edits failed as a whole. Merging each keystroke would have kept every edit before the
    // first failing one and reverted from there; keep such a prefix. Bisection finds one in a few
    // merges, however many keystrokes a held key produced, and each kept state passed every check.
    let failure: { reason: string } = whole;
    let merged = -1;
    let failed = docs.length - 1;
    while (failed - merged > 1) {
      const middle = (merged + failed) >> 1;
      const attempt = mergeInto(docs[middle]).result;
      if (attempt.ok) {
        merged = middle;
      } else {
        failed = middle;
        failure = attempt;
      }
    }
    if (merged >= 0) options.change(source);
    options.recover(latest.canonical, failure.reason + " The rich-text draft was kept; use Source for this edit.");
    // A flush can run inside a view update or a host callback, where replacing the editor state is
    // unsafe. Restore before the next user input.
    queueMicrotask(() => { if (!disposed) replaceMarkdown(source); });
    return true;
  }

  crepe.editor.config((ctx) => {
    // The default uploader stores a temporary blob URL in Markdown. A refused upload adds no node.
    ctx.update(uploadConfig.key, (previous) => ({
      ...previous,
      uploader: async () => {
        options.notice("Image uploads are not available in Orca yet.");
        return [];
      },
    }));
  });
  crepe.editor.use($prose(() => search()));
  crepe.editor.use($prose(() => proofing.createPlugin()));
  crepe.editor.use($prose(() => createHtmlPreviewPlugin({
    resolveImageUrl: (url) => /^data:image\/(?:png|jpeg|gif|webp|avif);/i.test(url) ? url : blockedImage,
  })));
  crepe.editor.use($prose(() => new Plugin({
    filterTransaction: (transaction) => !transaction.docChanged || !readOnly || applying,
    view: () => ({
      update(view, previous) {
        findbar.refresh();
        outline.refresh();
        if (disposed || applying || readOnly || view.state.doc.eq(previous.doc)) return;
        // A merge reparses the whole document, which a held Backspace outpaces on larger files. Merge
        // after the keystroke paints, once per burst; flush() delivers early to anything that reads
        // or replaces the draft, so a save or an outside change still sees the newest keystroke.
        if (!pendingDocs.length) pendingSince = Date.now();
        pendingDocs.push(view.state.doc);
        scheduleMerge();
      },
    }),
  })));
  try {
    await crepe.create();
  } catch (error) {
    diagrams.dispose();
    findbar.dispose(); outline.dispose();
    await proofing.dispose();
    await crepe.destroy().catch(() => {});
    throw error;
  }
  crepe.setReadonly(readOnly);
  ready = true;
  applying = false;
  codeBlocks.refreshReadOnly();
  outline.refresh();
  root.addEventListener("keydown", (event) => {
    // An auto-repeating key holds its merge until release; any new key press ends the repeat.
    if (event.repeat !== keyHeld) {
      keyHeld = event.repeat;
      scheduleMerge();
    }
    // A shortcut may act on the document outside the editor: saving, closing, switching views.
    if (!event.repeat && (event.metaKey || event.ctrlKey)) flush();
  }, { capture: true, signal: events.signal });
  window.addEventListener("keyup", () => {
    if (!keyHeld) return;
    keyHeld = false;
    scheduleMerge();
  }, { capture: true, signal: events.signal });
  // Focus leaving the frame precedes anything else in Orca acting on it.
  window.addEventListener("blur", () => { keyHeld = false; flush(); }, { signal: events.signal });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  }, { signal: events.signal });
  return {
    replaceMarkdown,
    setReadOnly(value) {
      flush(); // Edits made while writable are delivered as such.
      readOnly = value; crepe.setReadonly(value); codeBlocks.refreshReadOnly(); findbar.setReadonly(value); configure(preferences);
    },
    getSource: () => { flush(); return source; },
    flush,
    configure,
    find: () => findbar.open(),
    navigate: (href) => { const view = getView(); return view ? navigateToHeadingAnchor(view, href) : false; },
    async destroy() {
      if (disposed) return;
      disposed = true; events.abort(); cancelScheduledMerge(); pendingDocs = [];
      diagrams.dispose(); findbar.dispose(); outline.dispose();
      await crepe.destroy();
      await proofing.dispose();
    },
  };
}
