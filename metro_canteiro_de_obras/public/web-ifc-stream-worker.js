// /public/web-ifc-stream-worker.js
importScripts("https://cdn.jsdelivr.net/npm/web-ifc@0.0.39/web-ifc.min.js");

let api;
let fileChunks = [];

self.onmessage = async ({ data }) => {
  const { action, chunk } = data;

  if (action === "init") {
    const wasm = await fetch("/web-ifc.wasm").then(r => r.arrayBuffer());
    api = await WebIFC.initWebIFC({
      wasmBinary: wasm,
      COORDINATE_TO_ORIGIN: true,
      USE_FAST_BOOLS: true
    });

    fileChunks = [];
    self.postMessage({ action: "ready" });
    return;
  }

  if (action === "chunk") {
    fileChunks.push(chunk);
    return;
  }

  if (action === "finish") {
    const fullLen = fileChunks.reduce((a, b) => a + b.length, 0);
    const full = new Uint8Array(fullLen);

    let offset = 0;
    for (const c of fileChunks) {
      full.set(c, offset);
      offset += c.length;
    }

    fileChunks = []; // reset

    const modelID = api.OpenModel(full);
    const total = api.GetLineCount(modelID);
    const step = 5000;

    for (let i = 0; i < total; i += step) {
      api.GetLine(modelID, i, step);
      self.postMessage({
        action: "progress",
        progress: Math.min((i / total) * 100, 100)
      });
    }

    self.postMessage(
      {
        action: "done",
        file: full.buffer,
        modelID
      },
      [full.buffer]
    );
  }
};
