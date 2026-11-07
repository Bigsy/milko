import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WorkerHarperEngine } from "./worker-engine";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: Array<{ id: number; dictionary?: string[] }> = [];
  terminate = vi.fn();
  constructor() { FakeWorker.instances.push(this); }
  postMessage(value: { id: number; dictionary?: string[] }) { this.messages.push(value); }
}
beforeEach(() => { FakeWorker.instances = []; vi.stubGlobal("Worker", FakeWorker); vi.useFakeTimers(); });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("Harper worker lifecycle", () => {
  it("passes a snapshot to the worker and returns its corrections", async () => {
    const engine = new WorkerHarperEngine(); const words = ["MilkO"];
    const result = engine.lint("wierd", "BRITISH", words); words.push("Later");
    const worker = FakeWorker.instances[0];
    expect(worker.messages[0].dictionary).toEqual(["MilkO"]);
    worker.onmessage?.({ data: { id: worker.messages[0].id, result: { corrections: [] } } } as MessageEvent);
    expect(await result).toEqual({ corrections: [] });
    await engine.dispose(); expect(worker.terminate).toHaveBeenCalledOnce();
  });
  it("turns startup crashes into observable errors for every waiting check", async () => {
    const engine = new WorkerHarperEngine();
    const first = engine.lint("One", "BRITISH", []); const second = engine.lint("Two", "BRITISH", []);
    const worker = FakeWorker.instances[0];
    worker.onerror?.({ preventDefault: vi.fn() } as unknown as ErrorEvent);
    expect((await first).error).toContain("could not start");
    expect((await second).error).toContain("could not start");
    expect(worker.terminate).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
    await engine.dispose();
  });
  it("times out a stalled startup instead of remaining on Checking forever", async () => {
    const engine = new WorkerHarperEngine(); const result = engine.lint("One", "BRITISH", []);
    await vi.advanceTimersByTimeAsync(15000);
    expect((await result).error).toContain("timed out");
    expect(FakeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    await engine.dispose();
  });
  it("disposes during startup, clears timers and ignores late replies", async () => {
    const engine = new WorkerHarperEngine(); const result = engine.lint("One", "BRITISH", []);
    const worker = FakeWorker.instances[0]; await engine.dispose();
    expect((await result).error).toContain("disposed");
    worker.onmessage?.({ data: { id: 1, result: { corrections: [] } } } as MessageEvent);
    expect(vi.getTimerCount()).toBe(0);
    expect((await engine.lint("Later", "BRITISH", [])).error).toContain("disposed");
    expect(FakeWorker.instances).toHaveLength(1);
  });
  it("handles a refused worker constructor without throwing into the editor", async () => {
    vi.stubGlobal("Worker", class { constructor() { throw new Error("not permitted"); } });
    const engine = new WorkerHarperEngine();
    expect((await engine.lint("One", "BRITISH", [])).error).toContain("not permitted");
    await engine.dispose();
  });
});
