// Development probe: loaded manually from DevTools, never by the editor.
self.onmessage = async () => {
  try {
    const response = await fetch(new URL("./empty.wasm", import.meta.url));
    if (!response.ok) throw new Error(`WASM asset: ${response.status}`);
    await WebAssembly.instantiate(await response.arrayBuffer());
    self.postMessage({ worker: true, wasm: true, protocol: self.location.protocol });
  } catch (error) {
    self.postMessage({ worker: true, wasm: false, error: String(error) });
  }
};
