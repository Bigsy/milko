import { describe, expect, it } from "vitest";
import { uniqueSequenceMatches } from "./unique-sequence";

describe("unambiguous alignment", () => {
  it("agrees with all optimal alignments of small repeated-token sequences", () => {
    const sequences: string[][] = [[]];
    for (let length = 1; length <= 4; length++) {
      for (let bits = 0; bits < 2 ** length; bits++) {
        sequences.push(Array.from({ length }, (_, i) => (bits >> i) & 1 ? "a" : "b"));
      }
    }
    function alignments(a: string[], b: string[], i = 0, j = 0): Array<Array<[number, number]>> {
      if (i === a.length || j === b.length) return [[]];
      const options = [...alignments(a, b, i + 1, j), ...alignments(a, b, i, j + 1)];
      if (a[i] === b[j]) options.push(...alignments(a, b, i + 1, j + 1).map((rest) => [[i, j] as [number, number], ...rest]));
      const longest = Math.max(...options.map((pairs) => pairs.length));
      return options.filter((pairs) => pairs.length === longest);
    }
    for (const a of sequences) for (const b of sequences) {
      const variants = new Set(alignments(a, b).map((pairs) => JSON.stringify(pairs)));
      expect(uniqueSequenceMatches(a, b), `${a} → ${b}`)
        .toEqual(variants.size === 1 ? JSON.parse([...variants][0]) : undefined);
    }
  });
});
