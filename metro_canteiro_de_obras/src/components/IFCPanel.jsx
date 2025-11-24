import { useEffect, useRef } from "react";

import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  AmbientLight,
  DirectionalLight,
  Box3,
  Vector3,
  MeshStandardMaterial,
} from "three";

import { IFCLoader } from "web-ifc-three/IFCLoader";
import pako from "pako";

import { sobelEdge } from "../utils/sobelUtils";

function createRenderer(container) {
  const renderer = new WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setSize(container.clientWidth, 400);
  container.innerHTML = "";
  container.appendChild(renderer.domElement);
  return renderer;
}

async function fetchIFCBuffer(url, setProgressPct) {
  const res = await fetch(url);
  const reader = res.body?.getReader();

  if (!reader) {
    setProgressPct(100);
    return res.arrayBuffer();
  }

  const total = Number(res.headers.get("content-length") || 0);
  const mem = new Uint8Array(Math.max(total, 3_000_000));
  let off = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    mem.set(value, off);
    off += value.length;

    if (total) {
      setProgressPct(Math.round((off / total) * 100));
    }
  }

  setProgressPct(100);
  return mem.slice(0, off).buffer;
}

export default function IFCPanel({
  bimEntry,
  viewingHistoryItem,
  progressMsg,
  progressPct,
  setProgressMsg,
  setProgressPct,
  resultTextBox,
  onSnapshotCaptured,
  onOpenCompare,
  canViewLastImages,
  onOpenImages,
}) {
  const viewerRef = useRef(null);
  const rendererRef = useRef(null);

  // Render do IFC
  useEffect(() => {
    let disposed = false;
    let animationId;

    const carregar = async () => {
      const file =
        viewingHistoryItem?.tipo === "modelo" ? viewingHistoryItem : bimEntry;

      if (!file?.url) return;

      const container = viewerRef.current;
      if (!container) return;

      let renderer = rendererRef.current;
      if (!renderer) {
        renderer = createRenderer(container);
        rendererRef.current = renderer;
      }

      const scene = new Scene();
      scene.background = new Color("#fff");

      const camera = new PerspectiveCamera(
        60,
        container.clientWidth / 400,
        0.1,
        9999
      );

      scene.add(new AmbientLight(1.2));

      const dl = new DirectionalLight(0xffffff, 1.2);
      dl.position.set(5, 10, 10);
      scene.add(dl);

      setProgressMsg("Carregando modelo...");
      const raw = await fetchIFCBuffer(
        `${file.url}?t=${Date.now()}`,
        setProgressPct
      );
      const buf = /\.gz$/.test(file.nome)
        ? pako.ungzip(new Uint8Array(raw)).buffer
        : raw;

      const { OrbitControls } = await import(
        "three/examples/jsm/controls/OrbitControls.js"
      );
      const controls = new OrbitControls(camera, renderer.domElement);

      const loader = new IFCLoader();
      loader.ifcManager.setWasmPath("/");

      const blobURL = URL.createObjectURL(new Blob([buf]));

      loader.load(blobURL, (model) => {
        if (disposed) return;

        model.traverse((o) => {
          if (o.isMesh) {
            o.material = new MeshStandardMaterial({
              color: "#d9d9d9",
            });
          }
        });

        scene.add(model);

        const box = new Box3().setFromObject(model);
        const c = box.getCenter(new Vector3());
        const size = box.getSize(new Vector3()).length();

        const dist = size / (2 * Math.tan(Math.PI * camera.fov / 360));

        controls.target.copy(c);
        camera.position.copy(c.clone().add(new Vector3(dist, dist, dist)));
        camera.lookAt(c);

        setProgressMsg("Modelo carregado");

        const loop = () => {
          if (disposed) return;
          animationId = requestAnimationFrame(loop);
          controls.update();
          renderer.render(scene, camera);
        };

        loop();
      });
    };

    carregar();

    return () => {
      disposed = true;
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [bimEntry?.url, viewingHistoryItem?.url, setProgressMsg, setProgressPct]);

  const prepararSnapshot = () => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return alert("Render não pronto");

    const processed = sobelEdge(canvas);
    if (!processed) return;

    const dataUrl = processed.toDataURL();
    onSnapshotCaptured(dataUrl);
    onOpenCompare();
  };

  return (
    <div className="report success" style={{ marginTop: 16 }}>
      <div className="hud-line">{progressMsg}</div>

      <div className="progress-bar">
        <div style={{ width: `${progressPct}%` }} />
      </div>

      <div ref={viewerRef} className="ifc-viewer-container" />

      <div className="compare-actions">
        <button className="capture-btn" onClick={prepararSnapshot}>
          Comparar
        </button>

        <button
          className="capture-btn"
          disabled={!canViewLastImages}
          onClick={onOpenImages}
        >
          Ver imagens usadas
        </button>
      </div>

      <textarea
        readOnly
        value={resultTextBox}
        placeholder="Resultado..."
        style={{
          width: "100%",
          minHeight: 100,
          marginTop: 10,
          padding: 10,
          borderRadius: 8,
          border: "1px solid #ccc",
        }}
      />
    </div>
  );
}
