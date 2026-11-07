// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { installShortcuts } from "./shortcuts";

afterEach(() => document.body.replaceChildren());

it.each([["MacIntel", "⌘", "Option"], ["Win32", "Ctrl", "Alt"]])("shows platform-specific keys and supports closing/reopening on %s", (platform, mod, alt) => {
  const shortcuts = installShortcuts(platform);
  const dialog = document.querySelector<HTMLDialogElement>(".milko-shortcuts")!;
  // jsdom has no modal-dialog implementation; native behaviour is checked in Orca.
  const show = vi.fn(() => { dialog.open = true; });
  const close = vi.fn(() => { dialog.open = false; });
  Object.defineProperties(dialog, { showModal: { value: show }, close: { value: close } });
  const rows = [...dialog.querySelectorAll("tr")];
  expect(rows.find((row) => row.textContent?.includes("Bold"))!.textContent).toContain(`${mod} + B`);
  expect(rows.find((row) => row.textContent?.includes("Heading 1–6"))!.textContent).toContain(`${mod} + ${alt} + 1–6`);
  expect(dialog.getAttribute("aria-labelledby")).toBe("milko-shortcuts-title");
  shortcuts.open(); shortcuts.open();
  expect(show).toHaveBeenCalledOnce();
  dialog.querySelector<HTMLButtonElement>("button")!.click();
  expect(close).toHaveBeenCalledOnce();
  shortcuts.open();
  expect(show).toHaveBeenCalledTimes(2);
  shortcuts.dispose();
  expect(document.querySelector("dialog")).toBeNull();
});
