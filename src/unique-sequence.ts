/**
 * An exact LCS alignment, only when every optimal alignment matches the same positions.
 * Delete/insert ordering inside a replacement is immaterial; alternate equal-token matches
 * are not. Bound the matrix and refuse large comparisons rather than guessing on a timeout.
 */
export function uniqueSequenceMatches(
  before: readonly string[], after: readonly string[],
): Array<[number, number]> | undefined {
  if (before.length === after.length && before.every((value, i) => value === after[i])) {
    return before.map((_, i) => [i, i]);
  }
  const width = after.length + 1;
  const cells = (before.length + 1) * width;
  if (cells > 1_000_000) return undefined;
  const lengths = new Uint32Array(cells);
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i * width + j] = before[i] === after[j]
        ? 1 + lengths[(i + 1) * width + j + 1]
        : Math.max(lengths[(i + 1) * width + j], lengths[i * width + j + 1]);
    }
  }

  const reachable = new Uint8Array(cells);
  reachable[0] = 1;
  const matched = new Int32Array(before.length).fill(-1);
  const deleted = new Uint8Array(before.length);
  for (let i = 0; i <= before.length; i++) {
    for (let j = 0; j <= after.length; j++) {
      const at = i * width + j;
      if (!reachable[at]) continue;
      const best = lengths[at];
      if (i < before.length && j < after.length && before[i] === after[j] &&
          1 + lengths[at + width + 1] === best) {
        if (deleted[i] || (matched[i] >= 0 && matched[i] !== j)) return undefined;
        matched[i] = j;
        reachable[at + width + 1] = 1;
      }
      if (i < before.length && lengths[at + width] === best) {
        if (matched[i] >= 0) return undefined;
        deleted[i] = 1;
        reachable[at + width] = 1;
      }
      if (j < after.length && lengths[at + 1] === best) reachable[at + 1] = 1;
    }
  }
  return [...matched].flatMap((j, i): Array<[number, number]> => j < 0 ? [] : [[i, j]]);
}
