import { normalizeDictionary } from "./proofing/dictionary";
import type { ProofingDialect } from "./proofing/types";
import { applyEditorTheme, EDITOR_THEMES, MERMAID_THEMES, type EditorTheme, type MermaidTheme } from "./themes";

export interface Preferences {
  appearance: "auto" | "light" | "dark";
  editorTheme: EditorTheme;
  mermaidTheme: MermaidTheme;
  fontSize: number;
  wide: boolean;
  proofingEnabled: boolean;
  dialect: ProofingDialect;
  dictionary: string[];
  weirpacks: Array<{ name: string; data: string }>;
}

export const DEFAULT_PREFERENCES: Preferences = {
  appearance: "auto", editorTheme: "orca", mermaidTheme: "auto", fontSize: 16, wide: false,
  proofingEnabled: true, dialect: "AUTO", dictionary: [], weirpacks: [],
};
const DIALECTS = ["AUTO", "AMERICAN", "BRITISH", "AUSTRALIAN", "CANADIAN", "INDIAN"];
const KEY = "milko.preferences.v1";

export function normalizePreferences(input: unknown): Preferences {
  const p = input && typeof input === "object" ? input as Partial<Preferences> : {};
  return {
    appearance: p.appearance === "dark" || p.appearance === "light" ? p.appearance : "auto",
    editorTheme: EDITOR_THEMES.some(([value]) => value === p.editorTheme) ? p.editorTheme! : "orca",
    mermaidTheme: MERMAID_THEMES.some(([value]) => value === p.mermaidTheme) ? p.mermaidTheme! : "auto",
    fontSize: typeof p.fontSize === "number" && Number.isFinite(p.fontSize) ? Math.max(12, Math.min(24, Math.round(p.fontSize))) : 16,
    wide: p.wide === true,
    proofingEnabled: p.proofingEnabled !== false,
    dialect: DIALECTS.includes(p.dialect ?? "") ? p.dialect! : "AUTO",
    dictionary: normalizeDictionary(p.dictionary),
    weirpacks: Array.isArray(p.weirpacks) ? p.weirpacks.filter((pack) => pack && typeof pack.name === "string" && typeof pack.data === "string") : [],
  };
}

export function readPreferences(storage?: Pick<Storage, "getItem">): Preferences {
  try { return normalizePreferences(JSON.parse(storage?.getItem(KEY) ?? "null")); }
  catch { return normalizePreferences(null); }
}

export function savePreferences(value: Preferences, storage?: Pick<Storage, "setItem">): void {
  if (!storage) throw new Error("Preference storage is unavailable. These changes last for this tab only.");
  storage.setItem(KEY, JSON.stringify(value));
}

export function applyAppearance(preferences: Preferences): "light" | "dark" {
  const root = document.documentElement;
  root.dataset.milkoAppearance = preferences.appearance;
  root.style.setProperty("--milko-font-size", `${preferences.fontSize}px`);
  root.style.setProperty("--milko-editor-width", preferences.wide ? "1200px" : "960px");
  const theme = preferences.appearance === "auto" ? (root.classList.contains("dark") ? "dark" : "light") : preferences.appearance;
  root.style.colorScheme = theme;
  applyEditorTheme(preferences.editorTheme, theme);
  return theme;
}
