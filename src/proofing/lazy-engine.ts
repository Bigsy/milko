import type { HarperEngine } from "./harper";
import type { WorkerHarperEngine } from "./worker-engine";

/** Keep Harper's runtime, worker and WASM unloaded until the first enabled check. */
export class LazyHarperEngine {
  private engine: Promise<WorkerHarperEngine> | undefined;
  private disposed = false;

  async lint(...args: Parameters<HarperEngine["lint"]>): ReturnType<HarperEngine["lint"]> {
    if (this.disposed) return { corrections: [], error: "Proofing has been disposed" };
    try {
      const engine = await (this.engine ??= import("./worker-engine").then(({ WorkerHarperEngine }) => new WorkerHarperEngine()));
      if (this.disposed) return { corrections: [], error: "Proofing has been disposed" };
      return engine.lint(...args);
    } catch (error) {
      return { corrections: [], error: `Could not load Harper: ${String(error)}` };
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const engine = await this.engine?.catch(() => undefined);
    await engine?.dispose();
  }
}
