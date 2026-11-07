export interface RecoveryDraft {
  id: string;
  created: string;
  markdown: string;
  reason: string;
  kind?: "checkpoint" | "recovered";
}

const PREFIX = "milko.recovery.";

/** Separate drafts, because Orca intentionally supplies no file identity to its frames. */
export class DraftStore {
  private memory = new Map<string, RecoveryDraft>();
  persistent: boolean;

  constructor(private readonly storage?: Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">) {
    this.persistent = storage !== undefined;
  }

  list(): RecoveryDraft[] {
    const all = new Map<string, RecoveryDraft>();
    try {
      for (let i = 0; i < (this.storage?.length ?? 0); i++) {
        const key = this.storage!.key(i);
        if (!key?.startsWith(PREFIX)) continue;
        try {
          const draft: unknown = JSON.parse(this.storage!.getItem(key) ?? "null");
          if (isDraft(draft) && key === PREFIX + draft.id) all.set(draft.id, draft);
        } catch { /* One damaged entry must not hide the others. */ }
      }
    } catch { /* Storage may be unavailable; in-memory drafts still work. */ }
    // A failed write leaves an older value on disk. The current frame owns the newer bytes.
    for (const [id, draft] of this.memory) all.set(id, draft);
    return [...all.values()].sort((a, b) => b.created.localeCompare(a.created));
  }

  add(markdown: string, reason: string): RecoveryDraft {
    // A mutable editing checkpoint must never become the sole copy of a recovered snapshot.
    const existing = this.list().find((draft) => draft.kind !== "checkpoint" && draft.markdown === markdown);
    if (existing) return existing;
    const draft: RecoveryDraft = { id: crypto.randomUUID(), created: new Date().toISOString(), markdown, reason, kind: "recovered" };
    this.write(draft);
    return draft;
  }

  checkpoint(id: string, markdown: string): void {
    this.write({
      id,
      markdown,
      created: new Date().toISOString(),
      reason: "Editing checkpoint from another session. It may already have been saved.",
      kind: "checkpoint",
    });
  }

  private write(draft: RecoveryDraft): void {
    this.memory.set(draft.id, draft);
    try {
      if (this.storage) {
        this.storage.setItem(PREFIX + draft.id, JSON.stringify(draft));
        this.memory.delete(draft.id);
      }
    } catch { this.persistent = false; /* Keep in memory. */ }
  }

  remove(id: string, expected?: RecoveryDraft): boolean {
    try {
      let current = this.memory.get(id);
      if (!current && this.storage) {
        const raw = this.storage.getItem(PREFIX + id);
        if (raw !== null) {
          const stored: unknown = JSON.parse(raw);
          if (!isDraft(stored) || stored.id !== id) return false;
          current = stored;
        }
      }
      // Another frame may update a checkpoint while a bulk confirmation is open.
      if (expected && current && (current.created !== expected.created || current.markdown !== expected.markdown || current.reason !== expected.reason || current.kind !== expected.kind)) return false;
      this.storage?.removeItem(PREFIX + id);
      this.memory.delete(id);
      return true;
    } catch { this.persistent = false; return false; }
  }
}

/** Owns the mutable checkpoint of this frame; recovery seals that editing context. */
export class DraftSession {
  private checkpointId?: string;

  constructor(private readonly store: DraftStore) {}

  checkpoint(markdown: string): void {
    this.checkpointId ??= crypto.randomUUID();
    this.store.checkpoint(this.checkpointId, markdown);
  }

  recover(markdown: string, reason: string): void {
    this.store.add(markdown, reason);
    this.checkpointId = undefined;
  }

  visible(): RecoveryDraft[] {
    // When storage fails, expose the exact current bytes for copying before closing the frame.
    return this.store.list().filter((draft) => !this.store.persistent || draft.id !== this.checkpointId);
  }

  canDismiss(id: string): boolean { return id !== this.checkpointId; }

  dismiss(draft: RecoveryDraft): boolean {
    return this.canDismiss(draft.id) && this.store.remove(draft.id, draft);
  }
}

function isDraft(value: unknown): value is RecoveryDraft {
  return typeof value === "object" && value !== null &&
    ["id", "created", "markdown", "reason"].every((key) => typeof Reflect.get(value, key) === "string");
}
