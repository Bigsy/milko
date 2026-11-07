import { codeBlockView, type CodeMirrorBlock } from "@milkdown/kit/component/code-block";
import type { Editor } from "@milkdown/kit/core";
import { codeBlockSchema } from "@milkdown/kit/preset/commonmark";
import { $view } from "@milkdown/kit/utils";
import { copyCode } from "./copy-code";
import type { createMermaidPreview } from "./mermaid-preview";

/** Adapt the public Crepe node view without forking its CodeMirror or Vue implementation. */
export function installCodeBlockIntegration(
  editor: Editor, diagrams: ReturnType<typeof createMermaidPreview>, notice: (message: string) => void,
) {
  const blocks = new Set<CodeMirrorBlock>();
  // Register after Crepe's view. $view waits for SchemaReady, when the node id is known,
  // and replaces only this node view while retaining Crepe's other registered views.
  editor.use($view(codeBlockSchema.node, () => {
    // $view's exported .view is shared across editors; retain this editor's constructor.
    const createNodeView = codeBlockView.view;
    return (...args) => {
      const block = createNodeView(...args) as CodeMirrorBlock;
      blocks.add(block);
      const preview = diagrams.createBlock();
      block.config = { ...block.config, renderPreview: preview.render };
      const events = new AbortController();
      // Crepe's onCopy is a success notification, not a clipboard override. Intercept the
      // actual control before its handler, so an asynchronous refusal reaches our fallback.
      block.dom.addEventListener("click", (event) => {
        if (!(event.target instanceof Element) || !event.target.closest("button.copy-button")) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        void copyCode(block.node.textContent).catch((error) => notice(String(error)));
      }, { capture: true, signal: events.signal });
      const update = block.update.bind(block);
      block.update = (node) => {
        if (node.textContent !== block.node.textContent || node.attrs.language !== block.node.attrs.language) preview.invalidate();
        return update(node);
      };
      const destroy = block.destroy.bind(block);
      block.destroy = () => { blocks.delete(block); events.abort(); preview.dispose(); destroy(); };
      return block;
    };
  }));
  return {
    refreshReadOnly() {
      for (const block of blocks) {
        const readOnly = !block.view.editable;
        if (readOnly) block.dom.click(); // Crepe closes an open language picker on an outside click.
        const trigger = block.dom.querySelector<HTMLButtonElement>(".language-button");
        if (trigger) trigger.disabled = readOnly;
        const picker = block.dom.querySelector<HTMLElement>(".language-picker");
        if (picker) { picker.inert = readOnly; picker.hidden = readOnly; }
        // Crepe refreshes its CodeMirror read-only compartment in update(), which ProseMirror
        // need not call when only editability changed. This also handles unmounted placeholders.
        block.update(block.node);
      }
    },
  };
}
