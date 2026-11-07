import { describe, expect, it } from "vitest";
import { mergeConcurrentMarkdown as merge } from "./concurrent-markdown";

describe("concurrent Markdown writes", () => {
  it("refuses an ambiguous deletion of repeated lines instead of deleting the wrong one", () => {
    const outside = "World\nHello\n";
    expect(merge("Hello\nHello\n", outside, "Hello\n"))
      .toMatchObject({ ok: false, markdown: outside });
    expect(merge("Hello\nHello\n", "Hello\n", outside).ok).toBe(false);
  });

  it("refuses repeated-line ambiguity even when the repeated lines are separated", () => {
    const base = "Hello\nMiddle\nHello\n";
    expect(merge(base, "World\nMiddle\nHello\n", "Middle\nHello\n").ok).toBe(false);
    expect(merge("a\nb\na\n", "x\nb\na\n", "b\na\nb\n").ok).toBe(false);
  });

  it("requires recovery for divergent changes to the same line without positional provenance", () => {
    expect(merge("alpha beta\n", "ALPHA beta\n", "alpha BETA\n").ok).toBe(false);
  });

  it("refuses an alignment exceeding the bounded comparison budget", () => {
    const base = Array.from({ length: 1100 }, (_, i) => `line ${i}\n`).join("");
    expect(merge(base, base.replace("line 1\n", "outside\n"), base.replace("line 900\n", "mine\n")).ok).toBe(false);
  });
  const base = "# Plan\r\n\r\nFirst __paragraph__.\r\n\r\nLast paragraph.\r\n";

  it("keeps exact outside bytes when there are no local edits", () => {
    const outside = base.replace("First", "Outside");
    expect(merge(base, outside, base)).toEqual({ ok: true, markdown: outside });
  });

  it("keeps exact local bytes when outside has not changed", () => {
    const mine = base.replace("Last", "My last");
    expect(merge(base, base, mine)).toEqual({ ok: true, markdown: mine });
  });

  it("merges separate edits without duplicating the document", () => {
    expect(merge(base, base.replace("First", "Outside"), base.replace("Last", "My last")))
      .toEqual({ ok: true, markdown: base.replace("First", "Outside").replace("Last", "My last") });
  });

  it("does not duplicate identical insertions", () => {
    expect(merge("Hello world.", "Hello new world.", "Hello new world."))
      .toEqual({ ok: true, markdown: "Hello new world." });
  });

  it("deduplicates the same edit when one side also changes another paragraph", () => {
    const outside = base.replace("First", "Same first");
    const mine = outside.replace("Last", "My last");
    expect(merge(base, outside, mine)).toEqual({ ok: true, markdown: mine });
  });

  it("refuses overlapping replacements and leaves outside intact", () => {
    const outside = base.replace("First", "Outside");
    expect(merge(base, outside, base.replace("First", "Local"))).toMatchObject({ ok: false, markdown: outside });
  });

  it("refuses different insertions at the same position", () => {
    expect(merge("A B", "A outside B", "A mine B").ok).toBe(false);
  });

  it("merges Unicode and separate deletions", () => {
    expect(merge("🙂 café\n\nDelete me.\n", "🙂 tea\n\nDelete me.\n", "🙂 café\n\n"))
      .toEqual({ ok: true, markdown: "🙂 tea\n\n" });
  });

  it("keeps both an outside block and local typing", () => {
    const mine = base.replace("Last paragraph.", "Last paragraph, still typing.");
    const outside = "Agent introduction.\r\n\r\n" + base;
    expect(merge(base, outside, mine)).toEqual({ ok: true, markdown: "Agent introduction.\r\n\r\n" + mine });
  });
});
