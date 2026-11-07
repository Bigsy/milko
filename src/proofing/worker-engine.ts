import type { ResolvedDialect } from "./dialect";
import type { HarperEngineResult } from "./types";
import type { ProofingRequest } from "./worker";

/** Own the worker lifecycle so startup failures cannot leave an unresolved Harper RPC. */
export class WorkerHarperEngine {
  private worker: Worker | undefined;
  private sequence = 0;
  private disposed = false;
  private pending = new Map<number, { resolve(result: HarperEngineResult): void; timer: ReturnType<typeof setTimeout> }>();

  lint(text: string, dialect: ResolvedDialect, dictionary: readonly string[], weirpacks: readonly string[] = []): Promise<HarperEngineResult> {
    return this.request({ type: "lint", text, dialect, dictionary: [...dictionary], weirpacks: [...weirpacks] });
  }

  private request(input: Omit<ProofingRequest, "id">): Promise<HarperEngineResult> {
    if (this.disposed) return Promise.resolve({ corrections: [], error: "Proofing has been disposed" });
    if (!this.worker) {
      try {
        this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      } catch (error) {
        return Promise.resolve({ corrections: [], error: `Harper worker could not start: ${String(error)}` });
      }
      this.worker.onmessage = ({ data }: MessageEvent<{ id: number; result: HarperEngineResult }>) => {
        const entry = this.pending.get(data.id);
        if (!entry) return;
        clearTimeout(entry.timer); this.pending.delete(data.id);
        entry.resolve(data.result);
      };
      this.worker.onerror = (event) => {
        event.preventDefault();
        this.fail("Harper worker could not start. Reopen the document to retry.");
      };
      this.worker.onmessageerror = () => this.fail("Harper returned an unreadable result.");
    }
    return new Promise((resolve) => {
      const id = ++this.sequence;
      const timer = setTimeout(() => this.fail("Harper timed out. Reopen the document to retry."), 15000);
      this.pending.set(id, { resolve, timer });
      try { this.worker!.postMessage({ ...input, id }); }
      catch (error) { this.fail(`Harper could not receive the document: ${String(error)}`); }
    });
  }

  private fail(message: string): void {
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer); entry.resolve({ corrections: [], error: message });
    }
    this.pending.clear();
    this.worker?.terminate(); this.worker = undefined;
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    // Termination also releases worker-owned WASM memory and object URLs, including during startup.
    this.disposed = true;
    this.fail("Proofing has been disposed");
  }
}
