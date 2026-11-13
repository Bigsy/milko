import type { EditorDocumentApi, EditorSession, OrcaFrameApi } from "orca/frame";

/**
 * Hands Orca the editor's undelivered edits before Orca acts on its draft. The editor merges a
 * burst of keystrokes after it paints rather than on every keystroke, so the session can lag the
 * screen; `deliver` must pass every pending edit to the session synchronously.
 *
 * Call this before creating the session. Orca's frame runs listeners in the order they were added,
 * so these run ahead of the session's own: a save sends the newest keystroke, and an outside or
 * access change finds the session already holding it. Delivered any later, an outside change the
 * session took as clean would be overwritten by the late edit.
 */
export function deliverPendingEdits(
  orca: Pick<OrcaFrameApi, "on">,
  document: Pick<EditorDocumentApi, "onDidChange">,
  deliver: () => void,
  flush: () => Promise<void> | undefined,
): { dispose(): void } {
  const documents = document.onDidChange(() => deliver());
  const saves = orca.on("editor.flush", () => {
    deliver();
    return flush();
  });
  return { dispose() { documents.dispose(); saves.dispose(); } };
}

interface Callbacks {
  replace(markdown: string): void;
  state(pending: boolean): void;
  recover(markdown: string, reason: string): void;
}

/** Orca owns revisions and save boundaries; this wrapper observes failures and owns its UI timer. */
export class DocumentSync {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private accepted = 0;
  private disposed = false;
  private readOnly: boolean;
  private unconfirmed = false;
  private readonly replacement;

  constructor(
    private readonly session: EditorSession<string>, private readonly callbacks: Callbacks,
    private readonly document: Pick<EditorDocumentApi, "get">,
  ) {
    this.readOnly = session.readOnly;
    this.replacement = session.onReplace((markdown) => {
      if (this.disposed) return;
      callbacks.replace(markdown);
      // Orca may have started a merge delivery itself. Observe its outcome as well as user edits.
      clearTimeout(this.timer);
      this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 0);
    });
  }

  accessChanged(): void {
    if (this.disposed || this.readOnly === this.session.readOnly) return;
    this.readOnly = this.session.readOnly;
    if (this.generation === this.accepted && !this.unconfirmed) return;
    // A read-only flush can resolve without delivery. Report that immediately, and retry
    // the retained session draft when write access returns, even without another keystroke.
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 0);
  }

  change(markdown: string): void {
    if (this.disposed || this.session.readOnly || markdown === this.session.value) return;
    this.session.change(markdown);
    this.generation += 1;
    this.callbacks.state(true);
    clearTimeout(this.timer);
    // Run before the session's 300ms fallback, so failures have an observable owner.
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 250);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.disposed) return;
    const generation = this.generation;
    try {
      await this.session.flush();
      if (this.disposed) return;
      if (this.generation !== generation) { this.callbacks.state(this.unconfirmed || this.accepted !== this.generation); return; }
      const value = this.session.value;
      const accepted = await this.document.get();
      if (this.disposed) return;
      // New typing or an outside replacement during confirmation has its own scheduled flush.
      if (this.generation !== generation || this.session.value !== value) { this.callbacks.state(this.unconfirmed || this.accepted !== this.generation); return; }
      if (accepted.content.kind !== "text" || accepted.content.text !== value) {
        this.unconfirmed = true;
        this.callbacks.state(true);
        throw new Error(this.session.readOnly
          ? "Orca has not accepted the latest edits because the document became read only. The draft was kept; delivery will retry when write access returns."
          : "Orca has not confirmed the latest edits. The draft was kept for recovery.");
      }
      this.accepted = Math.max(this.accepted, generation);
      this.unconfirmed = false;
      this.callbacks.state(this.accepted !== this.generation);
    } catch (error) {
      if (!this.disposed) {
        this.unconfirmed = true;
        this.callbacks.state(true);
        this.callbacks.recover(this.session.value, error instanceof Error ? error.message : "Orca refused the edit.");
      }
      throw error;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    // Unload cannot wait for promises. Preserve any change whose delivery is still uncertain.
    if (this.unconfirmed || this.generation !== this.accepted) {
      this.callbacks.recover(this.session.value, "The editor closed before its latest edits were confirmed.");
    }
    this.disposed = true;
    clearTimeout(this.timer);
    this.replacement.dispose();
    this.session.dispose();
  }
}
