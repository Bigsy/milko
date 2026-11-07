import { createBinaryModuleFromUrl, LocalLinter } from "harper.js";
import { HarperEngine } from "./harper";
import type { ResolvedDialect } from "./dialect";
import compressedUrl from "../../.orca/generated/harper.wasm.gz?url";

export interface ProofingRequest {
  id: number;
  type: "lint" | "dispose";
  text?: string;
  dialect?: ResolvedDialect;
  dictionary?: string[];
  weirpacks?: string[];
}

let binaryUrl: string | undefined;
const engine = (async () => {
  const response = await fetch(compressedUrl);
  if (!response.ok || !response.body) throw new Error(`Could not load Harper (${response.status}).`);
  const bytes = await new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  binaryUrl = URL.createObjectURL(new Blob([bytes], { type: "application/wasm" }));
  const binary = createBinaryModuleFromUrl(binaryUrl, "full");
  await binary.setup();
  return new HarperEngine((dialect) => new LocalLinter({ binary, dialect }));
})();
// Keep initialization failures owned until the first request asks for the result.
void engine.catch(() => {});

self.onmessage = async ({ data }: MessageEvent<ProofingRequest>) => {
  try {
    const active = await engine;
    if (data.type === "dispose") {
      await active.dispose();
      if (binaryUrl) URL.revokeObjectURL(binaryUrl);
      self.postMessage({ id: data.id, result: { corrections: [] } });
      return;
    }
    const result = await active.lint(data.text ?? "", data.dialect ?? "AMERICAN", data.dictionary ?? [], data.weirpacks ?? []);
    self.postMessage({ id: data.id, result });
  } catch (error) {
    self.postMessage({ id: data.id, result: { corrections: [], error: error instanceof Error ? error.message : String(error) } });
  }
};
