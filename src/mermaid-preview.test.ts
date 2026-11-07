// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMermaidPreview } from "./mermaid-preview";
import { MERMAID_THEMES, type ResolvedMermaidTheme } from "./themes";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));
beforeEach(() => { vi.clearAllMocks(); document.body.replaceChildren(); });

describe("Mermaid previews", () => {
  it("passes every available explicit theme to Mermaid with the corresponding dark mode", async () => {
    mermaid.render.mockResolvedValue({ svg: "<svg/>" });
    let selected: ResolvedMermaidTheme = "default";
    const renderer = createMermaidPreview(() => selected);
    const block = renderer.createBlock();
    const apply = vi.fn();
    for (const [theme] of MERMAID_THEMES) {
      if (theme === "auto") continue;
      selected = theme;
      const calls = apply.mock.calls.length;
      block.render("mermaid", "flowchart LR\nA --> B", apply);
      await vi.waitFor(() => expect(apply).toHaveBeenCalledTimes(calls + 1));
      expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme, darkMode: theme.includes("dark") }));
    }
    renderer.dispose();
  });

  it("refreshes existing diagrams and ignores a late render from the previous theme", async () => {
    let complete!: (value: { svg: string }) => void;
    mermaid.render.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }))
      .mockResolvedValue({ svg: "<svg>NEW THEME</svg>" });
    let theme: ResolvedMermaidTheme = "default";
    const renderer = createMermaidPreview(() => theme);
    const apply = vi.fn();
    renderer.createBlock().render("mermaid", "flowchart LR\nA --> B", apply);
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    theme = "forest"; renderer.refresh();
    complete({ svg: "<svg>OLD THEME</svg>" });
    await vi.waitFor(() => expect(apply).toHaveBeenCalledOnce());
    expect(apply).toHaveBeenCalledWith(expect.stringContaining("NEW THEME"));
    expect(mermaid.initialize).toHaveBeenLastCalledWith(expect.objectContaining({ theme: "forest" }));
    renderer.dispose();
  });

  it("does not resurrect invalidated, removed or non-Mermaid previews on a theme refresh", async () => {
    mermaid.render.mockResolvedValue({ svg: "<svg/>" });
    const renderer = createMermaidPreview(() => "forest");
    const apply = vi.fn();
    for (const end of ["invalidate", "dispose", "ordinary"] as const) {
      const block = renderer.createBlock();
      block.render("mermaid", "OLD", apply);
      if (end === "ordinary") block.render("typescript", "const x = 1", apply);
      else block[end]();
    }
    renderer.refresh();
    await Promise.resolve(); await Promise.resolve();
    expect(mermaid.render).not.toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
    renderer.dispose();
  });
  it("renders diagrams asynchronously with strict configuration and the selected theme", async () => {
    mermaid.render.mockResolvedValue({ svg: "<svg><text>Diagram</text></svg>" });
    const apply = vi.fn();
    const renderer = createMermaidPreview(() => "dark");
    expect(renderer.createBlock().render("mermaid", "flowchart LR\nA --> B", apply)).toBeUndefined();
    await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(expect.stringContaining("<svg>")));
    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: "strict", theme: "dark", startOnLoad: false }));
    renderer.dispose();
  });
  it("leaves ordinary code blocks to CodeMirror", () => {
    const renderer = createMermaidPreview(() => "default");
    expect(renderer.createBlock().render("typescript", "const x = 1", vi.fn())).toBeNull();
    expect(mermaid.render).not.toHaveBeenCalled();
    renderer.dispose();
  });
  it("shows parse failures as inert text, cleans temporary DOM and still renders the next diagram", async () => {
    mermaid.render.mockImplementationOnce((id: string) => {
      const stray = document.createElement("div"); stray.id = `d${id}`; document.body.append(stray);
      throw new Error("<img src=x onerror=alert(1)>");
    }).mockResolvedValueOnce({ svg: "<svg>Second diagram</svg>" });
    const renderer = createMermaidPreview(() => "default");
    const bad = vi.fn(); const good = vi.fn();
    renderer.createBlock().render("mermaid", "invalid", bad);
    renderer.createBlock().render("mmd", "flowchart LR\nA --> B", good);
    await vi.waitFor(() => expect(good).toHaveBeenCalled());
    const error = bad.mock.calls[0][0] as HTMLElement;
    expect(error.textContent).toContain("<img");
    expect(error.querySelector("img")).toBeNull();
    expect(document.querySelector('[id^="dmilko-diagram-"]')).toBeNull();
    renderer.dispose();
  });
  it("does not update a destroyed editor when an asynchronous render finishes", async () => {
    let complete!: (value: { svg: string }) => void;
    mermaid.render.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const renderer = createMermaidPreview(() => "default");
    const apply = vi.fn(); renderer.createBlock().render("mermaid", "flowchart LR\nA --> B", apply);
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    renderer.dispose(); complete({ svg: "<svg/>" });
    await Promise.resolve(); await Promise.resolve();
    expect(apply).not.toHaveBeenCalled();
  });

  it.each(["typescript", "mermaid"])("ignores an old render after the block changes to %s, even with a new callback", async (language) => {
    let complete!: (value: { svg: string }) => void;
    mermaid.render.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }))
      .mockResolvedValue({ svg: "<svg>NEW</svg>" });
    const renderer = createMermaidPreview(() => "default");
    const block = renderer.createBlock();
    const old = vi.fn();
    block.render("mermaid", "OLD", old);
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    const next = vi.fn();
    block.render(language, "NEW", next);
    complete({ svg: "<svg>OLD</svg>" });
    await vi.waitFor(() => language === "mermaid" ? expect(next).toHaveBeenCalled() : expect(old).not.toHaveBeenCalled());
    await Promise.resolve(); await Promise.resolve();
    expect(old).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it("invalidates a removed block without suppressing another block's preview", async () => {
    let complete!: (value: { svg: string }) => void;
    mermaid.render.mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }))
      .mockResolvedValue({ svg: "<svg>Other</svg>" });
    const renderer = createMermaidPreview(() => "default");
    const first = renderer.createBlock(); const second = renderer.createBlock();
    const old = vi.fn(); const other = vi.fn();
    first.render("mermaid", "OLD", old);
    await vi.waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    second.render("mermaid", "Other", other);
    first.dispose(); complete({ svg: "<svg>OLD</svg>" });
    await vi.waitFor(() => expect(other).toHaveBeenCalled());
    expect(old).not.toHaveBeenCalled();
    renderer.dispose();
  });
});
