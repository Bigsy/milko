// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { copyCode } from "./copy-code";

afterEach(() => { vi.restoreAllMocks(); document.body.replaceChildren(); });
describe("copy code", () => {
  it("copies exact source through the browser clipboard", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    await copyCode("const café = '🥛';\r\n");
    expect(writeText).toHaveBeenCalledWith("const café = '🥛';\r\n");
  });
  it("falls back after permission refusal, then removes its temporary control and restores focus", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn(async () => { throw new Error("denied"); }) } });
    const button = document.body.appendChild(document.createElement("button")); button.focus();
    const copy = vi.fn(() => { expect(document.querySelector("textarea")?.value).toBe("Exact source"); return true; });
    Object.defineProperty(document, "execCommand", { configurable: true, value: copy });
    await copyCode("Exact source");
    expect(copy).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
    expect(document.activeElement).toBe(button);
  });
  it("reports a refused copy and still cleans up", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    Object.defineProperty(document, "execCommand", { configurable: true, value: () => false });
    await expect(copyCode("Source")).rejects.toThrow("Clipboard access was refused");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
