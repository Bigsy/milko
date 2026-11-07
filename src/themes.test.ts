// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { applyAppearance, normalizePreferences } from "./preferences";
import { EDITOR_THEMES, MERMAID_THEMES, resolveMermaidTheme } from "./themes";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  document.getElementById("milko-editor-theme")?.remove();
});

describe("bundled Crepe themes", () => {
  it("switches every palette between its real shipped light/dark colours without remote resources or accumulating styles", () => {
    const backgrounds = new Set<string>();
    for (const [editorTheme] of EDITOR_THEMES) {
      for (const appearance of ["light", "dark"] as const) {
        applyAppearance(normalizePreferences({ editorTheme, appearance }));
        const css = document.getElementById("milko-editor-theme")!.textContent!;
        expect(css).not.toMatch(/@import|url\(/i);
        expect(css).toContain("--crepe-font-title:");
        expect(document.documentElement.dataset.milkoEditorTheme).toBe(editorTheme);
        expect(document.documentElement.dataset.milkoColorScheme).toBe(appearance);
        if (editorTheme !== "orca") backgrounds.add(css.match(/--crepe-color-background:\s*([^;]+);/)![1]);
      }
    }
    expect(backgrounds.size).toBe(6);
    expect(document.querySelectorAll("#milko-editor-theme")).toHaveLength(1);
  });

  it("follows host changes for the editor palette and Mermaid Auto, retaining explicit diagram choices", () => {
    const preferences = normalizePreferences({ editorTheme: "nord" });
    document.documentElement.classList.remove("dark");
    expect(resolveMermaidTheme("auto", applyAppearance(preferences))).toBe("default");
    const light = document.getElementById("milko-editor-theme")!.textContent;
    document.documentElement.classList.add("dark");
    expect(resolveMermaidTheme("auto", applyAppearance(preferences))).toBe("dark");
    expect(document.getElementById("milko-editor-theme")!.textContent).not.toBe(light);
    for (const [theme] of MERMAID_THEMES) {
      if (theme !== "auto") expect(resolveMermaidTheme(theme, "dark")).toBe(theme);
    }
  });
});
