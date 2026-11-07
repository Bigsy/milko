import classic from "@milkdown/crepe/theme/classic.css?raw";
import classicDark from "@milkdown/crepe/theme/classic-dark.css?raw";
import frame from "@milkdown/crepe/theme/frame.css?raw";
import frameDark from "@milkdown/crepe/theme/frame-dark.css?raw";
import nord from "@milkdown/crepe/theme/nord.css?raw";
import nordDark from "@milkdown/crepe/theme/nord-dark.css?raw";

export const EDITOR_THEMES = [
  ["orca", "Orca"], ["classic", "Classic"], ["frame", "Frame"], ["nord", "Nord"],
] as const;
export type EditorTheme = typeof EDITOR_THEMES[number][0];

export const MERMAID_THEMES = [
  ["auto", "Auto (follow appearance)"], ["default", "Default"], ["dark", "Dark"],
  ["forest", "Forest"], ["neutral", "Neutral"], ["base", "Base"],
  ["neo", "Neo"], ["neo-dark", "Neo Dark"], ["redux", "Redux"], ["redux-dark", "Redux Dark"],
  ["redux-color", "Redux Colour"], ["redux-dark-color", "Redux Dark Colour"],
] as const;
export type MermaidTheme = typeof MERMAID_THEMES[number][0];
export type ResolvedMermaidTheme = Exclude<MermaidTheme, "auto">;

const palettes = {
  orca: { light: frame, dark: frameDark },
  classic: { light: classic, dark: classicDark },
  frame: { light: frame, dark: frameDark },
  nord: { light: nord, dark: nordDark },
};

/** Use Crepe's shipped palettes directly. They contain no remote imports or fonts. */
export function applyEditorTheme(theme: EditorTheme, appearance: "light" | "dark"): void {
  const root = document.documentElement;
  root.dataset.milkoEditorTheme = theme;
  root.dataset.milkoColorScheme = appearance;
  let style = document.getElementById("milko-editor-theme");
  if (!style) {
    style = document.createElement("style");
    style.id = "milko-editor-theme";
    document.head.append(style);
  }
  const css = palettes[theme][appearance];
  if (style.textContent !== css) style.textContent = css;
}

export function resolveMermaidTheme(theme: MermaidTheme, appearance: "light" | "dark"): ResolvedMermaidTheme {
  return theme === "auto" ? (appearance === "dark" ? "dark" : "default") : theme;
}
