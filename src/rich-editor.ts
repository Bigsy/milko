import { Crepe, CrepeFeature } from "@milkdown/crepe";
import { setCodeMirrorTheme } from "@milkdown/crepe/feature/code-mirror";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorState as CodeMirrorState } from "@codemirror/state";
import { EditorView as CodeMirrorView } from "@codemirror/view";
import { editorViewCtx, parserCtx, remarkCtx, serializerCtx } from "@milkdown/kit/core";
import { uploadConfig } from "@milkdown/kit/plugin/upload";
import { EditorState, Plugin, TextSelection } from "@milkdown/kit/prose/state";
import { $prose } from "@milkdown/kit/utils";
import { SourceBlockIndex } from "./markdown/block-index";
import { parseObservingBlocks, splitMarkdownBlocks, splitTopLevelBlocks } from "./markdown/markdown-blocks";
import { mergeSourcePreservingEdit } from "./markdown/source-preserving-sync";
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
  replaceMarkdown(markdown: string): void;
  setReadOnly(readOnly: boolean): void;
  getSource(): string;
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

export async function mountEditor(root: HTMLElement, initial: string, options: Options): Promise<RichEditor> {
  let source = initial;
  let canonicalSource: string | undefined;
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
        // Transaction-synchronous: even an immediate Cmd+S sees the most recent keystroke.
        const canonical = crepe.editor.ctx.get(serializerCtx)(view.state.doc);
        const result = mergeSourcePreservingEdit(source, canonical, canonicalize, canonicalSource,
          (markdown) => splitMarkdownBlocks(crepe.editor.ctx.get(remarkCtx), markdown), blockIndex);
        if (result.ok) {
          source = result.markdown;
          canonicalSource = canonical;
          options.change(source);
        } else {
          options.recover(canonical, result.reason + " The rich-text draft was kept; use Source for this edit.");
          // Dispatching from inside a view update is unsafe. Restore before the next user input.
          queueMicrotask(() => { if (!disposed) replaceMarkdown(source); });
        }
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
  return {
    replaceMarkdown,
    setReadOnly(value) { readOnly = value; crepe.setReadonly(value); codeBlocks.refreshReadOnly(); findbar.setReadonly(value); configure(preferences); },
    getSource: () => source,
    configure,
    find: () => findbar.open(),
    navigate: (href) => { const view = getView(); return view ? navigateToHeadingAnchor(view, href) : false; },
    async destroy() {
      if (disposed) return;
      disposed = true; diagrams.dispose(); findbar.dispose(); outline.dispose();
      await crepe.destroy();
      await proofing.dispose();
    },
  };
}
