// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { installOptions } from "./options";
import { normalizePreferences, readPreferences, savePreferences } from "./preferences";
import { EDITOR_THEMES, MERMAID_THEMES } from "./themes";

afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

it("offers and persists all shipped themes through the actual Options controls", () => {
  const notice = vi.fn();
  const options = installOptions(normalizePreferences(null), (next) => savePreferences(next, localStorage), notice);
  for (const [key, choices] of [["editorTheme", EDITOR_THEMES], ["mermaidTheme", MERMAID_THEMES]] as const) {
    const select = document.querySelector<HTMLSelectElement>(`[data-key=${key}]`)!;
    expect([...select.options].map((option) => option.value)).toEqual(choices.map(([value]) => value));
    for (const [value] of choices) {
      select.value = value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
      expect(readPreferences(localStorage)[key]).toBe(value);
    }
  }
  options.dispose();
  const restored = installOptions(readPreferences(localStorage), vi.fn(), notice);
  expect(document.querySelector<HTMLSelectElement>('[data-key=editorTheme]')!.value).toBe("nord");
  expect(document.querySelector<HTMLSelectElement>('[data-key=mermaidTheme]')!.value).toBe("redux-dark-color");
  restored.dispose();
  expect(document.querySelector("dialog")).toBeNull();
  expect(notice).not.toHaveBeenCalled();
});

it("persists line spacing through its Options control and restores it when reopened", () => {
  const options = installOptions(normalizePreferences(null), (next) => savePreferences(next, localStorage), vi.fn());
  const input = document.querySelector<HTMLInputElement>('[data-key=lineHeight]')!;
  expect(input.value).toBe("1.5");
  input.value = "2.1";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  expect(readPreferences(localStorage).lineHeight).toBe(2.1);
  expect(readPreferences(localStorage).fontSize).toBe(16);
  input.value = "";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  expect(readPreferences(localStorage).lineHeight).toBe(1.5);
  input.value = "2.1";
  input.dispatchEvent(new Event("change", { bubbles: true }));
  options.dispose();
  const restored = installOptions(readPreferences(localStorage), vi.fn(), vi.fn());
  expect(document.querySelector<HTMLInputElement>('[data-key=lineHeight]')!.value).toBe("2.1");
  restored.dispose();
});
