import { uniqueSequenceMatches } from "./unique-sequence";

interface Change {
  start: number;
  end: number;
  text: string;
}

export type ConcurrentMerge =
  | { ok: true; markdown: string }
  | { ok: false; markdown: string; reason: string };

/**
 * Without positional edit provenance, merge only separate, uniquely aligned whole-line changes.
 * Changes on the same line, ambiguous repeated lines and over-budget alignments require recovery.
 */
export function mergeConcurrentMarkdown(base: string, outside: string, mine: string): ConcurrentMerge {
  if (mine === base || mine === outside) return { ok: true, markdown: outside };
  if (outside === base) return { ok: true, markdown: mine };

  const remote = changes(base, outside);
  const local = changes(base, mine);
  if (!remote || !local) {
    return {
      ok: false, markdown: outside,
      reason: "MilkO could not locate concurrent edits unambiguously. Your draft has been kept for recovery.",
    };
  }
  const combined = [...remote];
  for (const edit of local) {
    if (remote.some((other) => identical(edit, other))) continue;
    if (remote.some((other) => overlaps(edit, other))) {
      return {
        ok: false,
        markdown: outside,
        reason: "Outside changes overlap your edits. Your draft has been kept for recovery.",
      };
    }
    combined.push(edit);
  }
  combined.sort((a, b) => a.start - b.start);
  let result = "";
  let cursor = 0;
  for (const edit of combined) {
    result += base.slice(cursor, edit.start) + edit.text;
    cursor = edit.end;
  }
  return { ok: true, markdown: result + base.slice(cursor) };
}

function changes(base: string, next: string): Change[] | undefined {
  const lines = (text: string) => text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const before = lines(base);
  const after = lines(next);
  const pairs = uniqueSequenceMatches(before, after);
  if (!pairs) return undefined;
  const result: Change[] = [];
  let i = 0;
  let j = 0;
  let cursor = 0;
  for (const [oldMatch, newMatch] of [...pairs, [before.length, after.length]]) {
    if (oldMatch !== i || newMatch !== j) {
      const end = cursor + before.slice(i, oldMatch).join("").length;
      result.push({ start: cursor, end, text: after.slice(j, newMatch).join("") });
      cursor = end;
    }
    cursor += before[oldMatch]?.length ?? 0;
    i = oldMatch + 1;
    j = newMatch + 1;
  }
  return result;
}

function identical(a: Change, b: Change): boolean {
  return a.start === b.start && a.end === b.end && a.text === b.text;
}

function overlaps(a: Change, b: Change): boolean {
  // Insertions at the same boundary have no unambiguous ordering. Be conservative there.
  if (a.start === a.end) return a.start >= b.start && a.start <= b.end;
  if (b.start === b.end) return b.start >= a.start && b.start <= a.end;
  return a.start < b.end && b.start < a.end;
}
