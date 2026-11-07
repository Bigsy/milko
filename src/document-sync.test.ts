import type { EditorSession } from "orca/frame";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocumentSync } from "./document-sync";

function setup(readOnly = false) {
  let value = "Original";
  let accepted = value;
  let replace: (markdown: string) => void = () => {};
  const unsubscribe = vi.fn();
  const session: EditorSession<string> = {
    get value() { return value; },
    readOnly,
    change: vi.fn((next) => { value = next; }),
    flush: vi.fn(async () => { if (!session.readOnly) accepted = value; }),
    onReplace: vi.fn((callback) => { replace = callback; return { dispose: unsubscribe }; }),
    dispose: vi.fn(),
  };
  const callbacks = { replace: vi.fn(), state: vi.fn(), recover: vi.fn() };
  const document = { get: vi.fn(async () => ({ version: 0, readOnly: session.readOnly, content: { kind: "text" as const, text: accepted } })) };
  const sync = new DocumentSync(session, callbacks, document);
  return { sync, session, document, callbacks, replace: (next: string) => replace(next), unsubscribe };
}

afterEach(() => vi.useRealTimers());

describe("Orca session integration", () => {
  it("does not serialize or submit initial content", () => {
    const { sync, session } = setup();
    expect(session.change).not.toHaveBeenCalled();
    expect(session.flush).not.toHaveBeenCalled();
    sync.dispose();
  });

  it("ignores changes in read-only documents", async () => {
    const { sync, session, callbacks } = setup(true);
    sync.change("Forbidden");
    await sync.flush();
    expect(session.change).not.toHaveBeenCalled();
    expect(callbacks.recover).not.toHaveBeenCalled();
    sync.dispose();
  });

  it("hands a keystroke to the session immediately, before the debounce or an immediate save", async () => {
    vi.useFakeTimers();
    const { sync, session } = setup();
    sync.change("Typed just now");
    expect(session.value).toBe("Typed just now");
    await sync.flush();
    expect(session.flush).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(400);
    expect(session.flush).toHaveBeenCalledOnce();
    sync.dispose();
  });

  it("coalesces typing and sends the newest draft", async () => {
    vi.useFakeTimers();
    const { sync, session } = setup();
    sync.change("One");
    await vi.advanceTimersByTimeAsync(100);
    sync.change("Two");
    await vi.advanceTimersByTimeAsync(250);
    expect(session.flush).toHaveBeenCalledOnce();
    expect(session.value).toBe("Two");
    sync.dispose();
  });

  it("preserves a refused draft and propagates a failed save", async () => {
    const { sync, session, callbacks } = setup();
    vi.mocked(session.flush).mockRejectedValueOnce(new Error("Stale edit rejected"));
    sync.change("Recover this");
    await expect(sync.flush()).rejects.toThrow("Stale edit rejected");
    expect(callbacks.recover).toHaveBeenCalledWith("Recover this", "Stale edit rejected");
    sync.dispose();
  });

  it("does not treat outside replacements as local changes", () => {
    const { sync, session, callbacks, replace } = setup();
    replace("Agent changed this");
    expect(callbacks.replace).toHaveBeenCalledWith("Agent changed this");
    expect(session.change).not.toHaveBeenCalled();
    sync.dispose();
  });

  it("captures a draft on close and cancels timers and subscriptions", async () => {
    vi.useFakeTimers();
    const { sync, session, callbacks, replace, unsubscribe } = setup();
    sync.change("Pending at close");
    sync.dispose();
    await vi.advanceTimersByTimeAsync(500);
    replace("Late outside event");
    expect(callbacks.recover).toHaveBeenCalledWith("Pending at close", expect.any(String));
    expect(session.flush).not.toHaveBeenCalled();
    expect(callbacks.replace).not.toHaveBeenCalled();
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(session.dispose).toHaveBeenCalledOnce();
  });

  it("keeps an edit pending when an older flush completes during newer typing", async () => {
    const { sync, session, callbacks } = setup();
    let accept!: () => void;
    vi.mocked(session.flush).mockReturnValueOnce(new Promise<void>((resolve) => { accept = resolve; }));
    sync.change("First");
    const flushing = sync.flush();
    sync.change("Second");
    accept();
    await flushing;
    expect(callbacks.state).toHaveBeenLastCalledWith(true);
    sync.dispose();
    expect(callbacks.recover).toHaveBeenCalledWith("Second", expect.any(String));
  });

  it("keeps an undelivered read-only edit pending, reports recovery and retries when writable", async () => {
    vi.useFakeTimers();
    const { sync, session, callbacks } = setup();
    sync.change("Newest draft");
    Object.defineProperty(session, "readOnly", { configurable: true, value: true });
    sync.accessChanged();
    await expect(sync.flush()).rejects.toThrow("read only");
    expect(callbacks.state).toHaveBeenLastCalledWith(true);
    expect(callbacks.recover).toHaveBeenCalledWith("Newest draft", expect.stringContaining("read only"));
    Object.defineProperty(session, "readOnly", { configurable: true, value: false });
    sync.accessChanged();
    await vi.advanceTimersByTimeAsync(0);
    expect(callbacks.state).toHaveBeenLastCalledWith(false);
    callbacks.recover.mockClear(); sync.dispose();
    expect(callbacks.recover).not.toHaveBeenCalled();
  });

  it("does not mistake a resolved no-op flush for acceptance, even when writable", async () => {
    const { sync, session, callbacks } = setup();
    vi.mocked(session.flush).mockResolvedValue(undefined);
    sync.change("Unconfirmed");
    await expect(sync.flush()).rejects.toThrow("not confirmed");
    expect(callbacks.state).toHaveBeenLastCalledWith(true);
    callbacks.recover.mockClear(); sync.dispose();
    expect(callbacks.recover).toHaveBeenCalledWith("Unconfirmed", expect.stringContaining("before its latest edits were confirmed"));
  });

  it("does not regress the delivered status when an older confirmation arrives after a newer flush", async () => {
    const { sync, document, callbacks } = setup();
    let confirm!: (value: Awaited<ReturnType<typeof document.get>>) => void;
    document.get.mockReturnValueOnce(new Promise((resolve) => { confirm = resolve; }));
    sync.change("First");
    const first = sync.flush();
    await vi.waitFor(() => expect(document.get).toHaveBeenCalledOnce());
    sync.change("Second");
    await sync.flush();
    expect(callbacks.state).toHaveBeenLastCalledWith(false);
    confirm({ version: 0, readOnly: false, content: { kind: "text", text: "First" } });
    await first;
    expect(callbacks.state).toHaveBeenLastCalledWith(false);
    sync.dispose();
    expect(callbacks.recover).not.toHaveBeenCalled();
  });
});
