// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { applyAppearance, normalizePreferences, readPreferences, savePreferences } from "./preferences";

beforeEach(() => localStorage.clear());

describe("MilkO preferences", () => {
  it("persists proofing, dialect, dictionary, Weirpacks and appearance across sessions", () => {
    const p = normalizePreferences({ appearance: "light", editorTheme: "nord", mermaidTheme: "redux-dark-color", fontSize: 19, wide: true, proofingEnabled: false,
      dialect: "BRITISH", dictionary: ["MilkO"], weirpacks: [{ name: "Writing", data: "YWJj" }] });
    savePreferences(p, localStorage);
    expect(readPreferences(localStorage)).toEqual(p);
  });
  it("falls back safely for malformed stored data", () => {
    localStorage.setItem("milko.preferences.v1", "broken");
    expect(readPreferences(localStorage).appearance).toBe("auto");
    expect(readPreferences(localStorage).proofingEnabled).toBe(true);
  });
  it("bounds typography and validates dictionary entries and configuration types", () => {
    expect(normalizePreferences({ fontSize: 999, dialect: "UNKNOWN", dictionary: ["MilkO", "MilkO", 42, "two words"] }))
      .toMatchObject({ fontSize: 24, dialect: "AUTO", dictionary: ["MilkO"] });
    expect(normalizePreferences({ fontSize: -10 }).fontSize).toBe(12);
  });
  it("keeps the existing Orca appearance when upgrading old preferences or rejecting unknown themes", () => {
    expect(normalizePreferences({ appearance: "dark", fontSize: 18 }))
      .toMatchObject({ appearance: "dark", editorTheme: "orca", mermaidTheme: "auto", fontSize: 18 });
    expect(normalizePreferences({ editorTheme: "unknown", mermaidTheme: "unknown" }))
      .toMatchObject({ editorTheme: "orca", mermaidTheme: "auto" });
  });
  it("reports storage failure instead of claiming preferences were saved", () => {
    expect(() => savePreferences(normalizePreferences(null))).toThrow("storage is unavailable");
    expect(() => savePreferences(normalizePreferences(null), { setItem() { throw new Error("quota"); } })).toThrow("quota");
  });
  it("applies an explicit appearance independently of Orca's theme", () => {
    document.documentElement.classList.add("dark");
    expect(applyAppearance(normalizePreferences({ appearance: "light", fontSize: 18, wide: true }))).toBe("light");
    expect(document.documentElement.dataset.milkoAppearance).toBe("light");
    expect(document.documentElement.style.getPropertyValue("--milko-font-size")).toBe("18px");
    expect(applyAppearance(normalizePreferences({ appearance: "auto" }))).toBe("dark");
  });
});
