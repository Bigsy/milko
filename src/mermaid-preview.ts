import type { ResolvedMermaidTheme } from "./themes";

type Preview = (value: null | string | HTMLElement) => void;

/** Lazy, local rendering through Crepe's sanitized preview panel. No document transactions. */
export function createMermaidPreview(theme: () => ResolvedMermaidTheme) {
  let disposed = false;
  let sequence = 0;
  let queue: Promise<unknown> = Promise.resolve();
  const prefix = `milko-diagram-${crypto.randomUUID()}`;
  const blocks = new Set<{ refresh(): void }>();

  function createBlock() {
    let revision = 0;
    let removed = false;
    let latest: { language: string; source: string; apply: Preview } | undefined;
    const block = {
      render(language: string, source: string, apply: Preview): undefined | null | HTMLElement {
        const current = ++revision;
        const active = () => !disposed && !removed && current === revision;
        latest = undefined;
        if (!/^(mermaid|mmd)$/i.test(language)) return null;
        latest = { language, source, apply };
        if (!source.trim()) {
          const hint = document.createElement("p");
          hint.textContent = "Choose Edit source to add a Mermaid diagram.";
          return hint;
        }
        const id = `${prefix}-${++sequence}`;
        queue = queue.then(async () => {
          if (!active()) return;
          try {
            const { default: mermaid } = await import("mermaid");
            if (!active()) return;
            const selected = theme();
            mermaid.initialize({
              startOnLoad: false,
              securityLevel: "strict",
              suppressErrorRendering: true,
              theme: selected,
              darkMode: selected.includes("dark"),
              fontFamily: "system-ui, sans-serif",
              flowchart: { htmlLabels: false },
            });
            const { svg } = await mermaid.render(id, source.trim());
            if (active()) {
              const container = document.createElement("div");
              container.className = "milko-mermaid-preview";
              // Explicit light themes remain readable inside a dark editor, and vice versa.
              container.style.backgroundColor = mermaid.mermaidAPI?.getConfig().themeVariables?.background ?? "";
              container.innerHTML = svg; // Crepe sanitizes the resulting preview HTML.
              apply(container.outerHTML);
            }
          } catch (error) {
            if (!active()) return;
            const message = document.createElement("div");
            message.className = "milko-mermaid-error";
            message.setAttribute("role", "alert");
            message.textContent = "Could not render this diagram. Choose Edit source to fix the source.\n" +
              (error instanceof Error ? error.message : String(error));
            apply(message);
          } finally {
            document.getElementById(`d${id}`)?.remove();
          }
        });
        // Undefined tells Crepe the preview will arrive asynchronously.
        return undefined;
      },
      refresh() {
        if (!disposed && !removed && latest?.source.trim()) {
          const { language, source, apply } = latest;
          block.render(language, source, apply);
        }
      },
      invalidate() { revision++; latest = undefined; },
      dispose() { removed = true; revision++; latest = undefined; blocks.delete(block); },
    };
    blocks.add(block);
    return block;
  }
  return {
    createBlock,
    refresh() { for (const block of blocks) block.refresh(); },
    dispose() { disposed = true; blocks.clear(); },
  };
}
