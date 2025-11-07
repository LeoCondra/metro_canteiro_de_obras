importScripts("https://cdn.jsdelivr.net/npm/web-ifc@0.0.39/web-ifc.min.js");

let api = null;
let wasmPath = "/";

// ✅ Notifica o React que o worker carregou
self.postMessage({ action: "worker-init" });

self.onmessage = async (event) => {
  const { action, args, buffer } = event.data;

  try {
    switch (action) {

      // ✅ Inicializa a engine IFC
      case "init": {
        wasmPath = args?.wasmPath || "/";
        if (!api) api = await initAPI(wasmPath);
        self.postMessage({ action: "worker-ready" });
        break;
      }

      // ✅ Processa IFC (alias: process / load-file)
      case "process":
      case "load-file": {
        if (!buffer) {
          self.postMessage({
            action: "error",
            error: "Nenhum buffer recebido no worker"
          });
          return;
        }
        await parseIFC(buffer);
        break;
      }

      default:
        console.warn("⚠️ worker: ação desconhecida", action);
    }
  } catch (err) {
    self.postMessage({ action: "error", error: err.message });
  }
};

async function initAPI(path) {
  const wasmURL = path.endsWith("/") ? path + "web-ifc.wasm" : path + "/web-ifc.wasm";

  const wasmBinary = await (await fetch(wasmURL)).arrayBuffer();

  return await WebIFC.initWebIFC({
    wasmBinary,
    COORDINATE_TO_ORIGIN: true,
    USE_FAST_BOOLS: true,
  });
}

async function parseIFC(buffer) {
  const modelID = api.OpenModel(buffer);

  const total = api.GetLineCount(modelID);
  const batch = 5000;
  let read = 0;

  while (read < total) {
    api.GetLine(modelID, read, batch);
    read += batch;

    self.postMessage({
      action: "progress",
      progress: Math.min((read / total) * 100, 100),
    });
  }

  // ✅ Envia o IFC de volta pro browser como transferable
  self.postMessage(
    {
      action: "loaded",
      buffer, // IFC binary
      modelID,
    },
    [buffer] // transferable — zero cópia 🔥
  );
}
