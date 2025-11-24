// === IMPORTS ===
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { FaUserCircle, FaFileUpload } from "react-icons/fa";
import {
  MdNotStarted, MdAutorenew, MdCheckCircle, MdCancel,
  MdMenu, MdClose, MdHistory, MdDelete
} from "react-icons/md";

import {
  Scene, PerspectiveCamera, WebGLRenderer, Color,
  AmbientLight, DirectionalLight, Box3, Vector3, MeshStandardMaterial
} from "three";

import { IFCLoader } from "web-ifc-three/IFCLoader";
import pako from "pako";

import {
  Chart as ChartJS, LineElement, CategoryScale, LinearScale, PointElement
} from "chart.js";
import { Line } from "react-chartjs-2";
ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement);

import sobel from "sobel";

import { supabase, BUCKET, ANALYZE_URL, SUPABASE_ANON_KEY } from "./Supabase";
import "./TelaInicial.css";


// === SOBEL SAFE ===
function sobelEdge(webglCanvas) {
  try {
    if (!webglCanvas) return null;

    const temp = document.createElement("canvas");
    temp.width = webglCanvas.width;
    temp.height = webglCanvas.height;

    const ctx = temp.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(webglCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, temp.width, temp.height);

    const sobelData = sobel(imgData);

    if (!sobelData || !sobelData.toImageData) {
      console.warn("Sobel falhou → usando imagem normal");
      return temp;
    }

    const edgeCanvas = document.createElement("canvas");
    edgeCanvas.width = temp.width;
    edgeCanvas.height = temp.height;

    const ectx = edgeCanvas.getContext("2d");
    if (!ectx) return temp;

    ectx.putImageData(sobelData.toImageData(), 0, 0);
    return edgeCanvas;

  } catch (err) {
    console.error("Erro no Sobel:", err);
    return null;
  }
}



// === COMPONENTE PRINCIPAL ===
export default function TelaInicial() {

  const [status, setStatus] = useState("não iniciada");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState(null);

  const [bimEntry, setBimEntry] = useState(null);
  const [report, setReport] = useState(null);

  const [snapshotImg, setSnapshotImg] = useState(null);
  const [progressMsg, setProgressMsg] = useState("Aguardando arquivo...");
  const [progressPct, setProgressPct] = useState(0);

  const [progressoObra, setProgressoObra] = useState([]);
  const [alertas, setAlertas] = useState([]);

  const [showCompareModal, setShowCompareModal] = useState(false);
  const [modalPhotoFile, setModalPhotoFile] = useState(null);
  const [modalPhotoPreview, setModalPhotoPreview] = useState(null);
  const [modalProgressPct, setModalProgressPct] = useState(0);

  const [resultTextBox, setResultTextBox] = useState("");

  // guarda a última combinação usada
  const [lastSnapshotImg, setLastSnapshotImg] = useState(null);
  const [lastPhotoImg, setLastPhotoImg] = useState(null);

  // modal novo “ver imagens usadas”
  const [showImagesModal, setShowImagesModal] = useState(false);

  const viewerRef = useRef(null);
  const rendererRef = useRef(null);

  const location = useLocation();
  const username = location.state?.username || "Usuário";


  // === HISTÓRICO (SUPABASE) ===
  async function handleDeleteFile(nome) {
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove([`arquivos/${username}/${nome}`]);

      if (error) throw error;

      setHistorico(prev => prev.filter(item => item.nome !== nome));

    } catch (err) {
      console.error(err);
      alert("Erro ao deletar arquivo");
    }
  }

  const getTipo = (name) => {
    const ext = name.split(".").pop().toLowerCase();
    return ["jpg", "jpeg", "png", "webp"].includes(ext)
      ? "imagem"
      : "modelo";
  };

  async function carregarHistorico() {
    const { data } = await supabase.storage
      .from(BUCKET)
      .list(`arquivos/${username}`, { limit: 100 });

    if (!data) return;

    const list = data.map(f => {
      const { data: url } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(`arquivos/${username}/${f.name}`);

      return {
        nome: f.name,
        url: url.publicUrl,
        tipo: getTipo(f.name),
        data: new Date(f.updated_at || f.created_at).toLocaleString()
      };
    });

    setHistorico(list);
  }

  useEffect(() => { carregarHistorico(); }, []);


  // === UPLOAD IFC ===
  const handleBimChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("processando");
    setProgressMsg("Carregando IFC...");

    try {
      const fname = `${Date.now()}-${file.name}`;

      await supabase.storage.from(BUCKET).upload(
        `arquivos/${username}/${fname}`,
        file
      );

      const { data: url } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(`arquivos/${username}/${fname}`);

      setBimEntry({ nome: fname, url: url.publicUrl });
      setStatus("concluída");

      setTimeout(carregarHistorico, 600);

    } catch {
      setStatus("falhou");
      alert("Erro no upload do IFC");
    }
  };


  // === DOWNLOAD IFC BUFFER ===
  async function fetchIFCBuffer(url) {
    const res = await fetch(url);
    const reader = res.body?.getReader();

    if (!reader) return res.arrayBuffer();

    const total = Number(res.headers.get("content-length") || 0);
    const mem = new Uint8Array(Math.max(total, 3_000_000));

    let off = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      mem.set(value, off);
      off += value.length;

      if (total)
        setProgressPct(Math.round((off / total) * 100));
    }

    setProgressPct(100);
    return mem.slice(0, off).buffer;
  }


  // === RENDER IFC ===
  useEffect(() => {
    let disposed = false;
    let animationId;

    (async () => {
      const file = viewingHistoryItem?.tipo === "modelo"
        ? viewingHistoryItem
        : bimEntry;

      if (!file?.url) return;

      const container = viewerRef.current;
      if (!container) return;

      let renderer = rendererRef.current;

      if (!renderer) {
        renderer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
        rendererRef.current = renderer;
        renderer.setSize(container.clientWidth, 400);
        container.appendChild(renderer.domElement);
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

      const raw = await fetchIFCBuffer(`${file.url}?t=${Date.now()}`);
      const buf = /\.gz$/.test(file.nome)
        ? pako.ungzip(new Uint8Array(raw)).buffer
        : raw;

      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const controls = new OrbitControls(camera, renderer.domElement);

      const loader = new IFCLoader();
      loader.ifcManager.setWasmPath("/");

      const blobURL = URL.createObjectURL(new Blob([buf]));

      loader.load(blobURL, (model) => {
        if (disposed) return;

        model.traverse(o => {
          if (o.isMesh) {
            o.material = new MeshStandardMaterial({
              color: "#d9d9d9"
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

        const loop = () => {
          if (disposed) return;
          animationId = requestAnimationFrame(loop);
          controls.update();
          renderer.render(scene, camera);
        };

        loop();
      });

    })();

    return () => {
      disposed = true;
      if (animationId) cancelAnimationFrame(animationId);
    };

  }, [bimEntry?.url, viewingHistoryItem?.url]);



  // === SNAPSHOT ===
  const prepararSnapshot = () => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return alert("Render não pronto");

    const processed = sobelEdge(canvas);
    if (!processed) return;

    setSnapshotImg(processed.toDataURL());
    setShowCompareModal(true);
  };


  function dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const u8 = Uint8Array.from([...bstr].map(c => c.charCodeAt(0)));

    return new File([u8], filename, { type: mime });
  }



  // === ENVIAR COMPARAÇÃO ===
  const enviarComparacaoModal = async () => {

    if (!snapshotImg) return alert("Capture primeiro");
    if (!modalPhotoFile) return alert("Selecione uma foto");

    setStatus("processando");
    setModalProgressPct(40);

    const snap = dataURLtoFile(snapshotImg, "snapshot.png");

    const prev =
      progressoObra.length
        ? progressoObra[progressoObra.length - 1].porcentagem
        : 0;

    const fd = new FormData();
    fd.append("fileA", snap);
    fd.append("fileB", modalPhotoFile);
    fd.append("prevProgress", String(prev));
    fd.append("username", username);

    try {
      const r = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: fd
      });

      const out = await r.json();
      if (out.status !== "ok") throw new Error(out.message);

      const prog = parseFloat(out.progresso_global ?? 0);

      // guarda as imagens usadas
      setLastSnapshotImg(snapshotImg);

      if (modalPhotoPreview) {
        setLastPhotoImg(modalPhotoPreview);
      } else if (modalPhotoFile) {
        setLastPhotoImg(URL.createObjectURL(modalPhotoFile));
      }

      setResultTextBox(
        `Progresso: ${(isNaN(prog) ? 0 : prog).toFixed(1)}%\n${out.textoFaltas || ""}`
      );

      setProgressoObra(prev => [
        ...prev,
        {
          porcentagem: prog,
          data: new Date().toLocaleString()
        }
      ]);

      setReport(out);
      setAlertas(out.alertas || []);
      setModalProgressPct(100);
      setStatus("concluída");

    } catch (err) {
      console.error(err);
      alert("Erro ao comparar imagens");
      setStatus("falhou");

    } finally {
      setTimeout(() => {
        setShowCompareModal(false);
        setModalPhotoFile(null);
        setModalPhotoPreview(null);
        setModalProgressPct(0);
      }, 600);
    }
  };



  // === GRÁFICO ===
  const PainelProgresso = () => {
    if (!progressoObra.length) return null;

    return (
      <div style={{ marginTop: 25 }}>
        <h3>Progressão da Obra</h3>

        <div style={{ height: "200px" }}>
          <Line
            data={{
              labels: progressoObra.map(p => p.data),
              datasets: [{
                label: "Estado da Obra (%)",
                data: progressoObra.map(p => p.porcentagem),
                borderColor: "#0050d6",
                backgroundColor: "rgba(0,80,214,.25)"
              }]
            }}
          />
        </div>
      </div>
    );
  };



  // === RELATÓRIO ===
  const RelatorioComparacao = () => {
    if (!report) return null;

    const p = Number(report.progresso_global).toFixed(1);

    const linhas = Object.entries(report.detalhePorClasse || {})
      .map(([cls, det]) => ({ ...det, cls }));

    return (
      <div style={{ marginTop: 25 }}>
        <h3>Resultado da Comparação</h3>

        <div className="dashboard-cards">
          <div className="dash-card">
            <h4>Progresso</h4>
            <p>{p}%</p>
          </div>
        </div>

        <div className="report success">
          <p><strong>Resumo:</strong> {report.textoFaltas}</p>

          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="relatorio-tabela">
              <thead>
                <tr>
                  <th>Classe</th>
                  <th>Esperado</th>
                  <th>Detectado</th>
                  <th>Atendido</th>
                  <th>Faltando</th>
                </tr>
              </thead>

              <tbody>
                {linhas.length > 0 ? (
                  linhas.map((l, i) => (
                    <tr key={i}>
                      <td>{l.cls}</td>
                      <td>{l.esperado}</td>
                      <td>{l.detectado}</td>
                      <td>{l.atendido}</td>
                      <td>{l.faltando}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5}>Sem classes detectadas</td>
                  </tr>
                )}
              </tbody>

            </table>
          </div>
        </div>
      </div>
    );
  };



  // === UI PRINCIPAL ===
  return (
    <div className="tela-container">

      {/* TOP BAR */}
      <div className="top-bar">
        <div className="status-container">
          {status === "não iniciada" && <MdNotStarted className="status-icon not-started" />}
          {status === "processando" && <MdAutorenew className="status-icon in-progress" />}
          {status === "concluída" && <MdCheckCircle className="status-icon done" />}
          {status === "falhou" && <MdCancel className="status-icon failed" />}
          <span className="status-text">{status}</span>
        </div>

        <div className="user-section">
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <MdClose /> : <MdMenu />}
          </button>

          <MdHistory className="history-icon" onClick={() => setViewingHistoryItem(null)} />
          <span className="username">{username}</span>
          <FaUserCircle className="user-icon" />
        </div>
      </div>



      {/* SIDEBAR */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <h3>Histórico</h3>

        {historico.map((h, i) => (
          <div
            key={i}
            className="history-item"
            onClick={() => {
              setViewingHistoryItem(h);
              if (h.tipo === "modelo") setBimEntry(h);
              setSnapshotImg(null);
            }}
          >
            <div style={{ flex: 1 }}>
              <p>{h.nome}</p>
              <small>{h.data}</small>
            </div>

            <MdDelete
              style={{ cursor: "pointer", color: "#c00" }}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFile(h.nome);
              }}
            />
          </div>
        ))}
      </div>



      {/* CONTEÚDO CENTRAL */}
      <div className="content">
        <div className="content-inner">

          <label htmlFor="bim-upload" className="upload-area">
            <FaFileUpload className="upload-icon" />
            <p>Selecionar BIM (.ifc / .ifc.gz)</p>
          </label>

          <input
            id="bim-upload"
            type="file"
            accept=".ifc,.ifc.gz,.gz"
            style={{ display: "none" }}
            onChange={handleBimChange}
          />



          {/* IFC CARREGADO */}
          {bimEntry && (
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
                  disabled={!lastSnapshotImg || !lastPhotoImg}
                  onClick={() => setShowImagesModal(true)}
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
                  border: "1px solid #ccc"
                }}
              />
            </div>
          )}

          <RelatorioComparacao />
          <PainelProgresso />

        </div>
      </div>



      {/* MODAL DE COMPARAÇÃO */}
      {showCompareModal && (
        <div className="modal-backdrop">
          <div className="modal-content">

            <h3>Comparar Snapshot × Foto</h3>

            <div className="progress-bar">
              <div style={{ width: `${modalProgressPct}%`, background: "#00c853" }} />
            </div>

            <div className="compare-grid">

              <div className="compare-box">
                <p>Snapshot BIM</p>
                {snapshotImg && (
                  <img src={snapshotImg} className="compare-img" alt="snapshot" />
                )}
              </div>

              <div className="compare-box">
                <p>Foto da Obra</p>

                <label
                  htmlFor="modal-photo-upload"
                  className="upload-area"
                  style={{ minHeight: 120 }}
                >
                  <FaFileUpload className="upload-icon" />
                  <span>Escolher foto</span>
                </label>

                <input
                  id="modal-photo-upload"
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp"
                  style={{ display: "none" }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setModalPhotoFile(f);
                    setModalPhotoPreview(URL.createObjectURL(f));
                  }}
                />

                {modalPhotoPreview && (
                  <img src={modalPhotoPreview} className="compare-img" alt="foto" />
                )}
              </div>

            </div>

            <div className="modal-actions">
              <button disabled={!modalPhotoFile} onClick={enviarComparacaoModal}>
                Confirmar
              </button>

              <button
                onClick={() => {
                  setShowCompareModal(false);
                  setModalPhotoFile(null);
                  setModalPhotoPreview(null);
                  setModalProgressPct(0);
                }}
              >
                Cancelar
              </button>
            </div>

          </div>
        </div>
      )}



      {/* MODAL NOVO – VER IMAGENS USADAS */}
      {showImagesModal && lastSnapshotImg && lastPhotoImg && (
        <div className="modal-backdrop">
          <div className="modal-content">
            <h3>Imagens usadas na última comparação</h3>

            <div className="compare-grid">
              <div className="compare-box">
                <p>Snapshot BIM</p>
                <img src={lastSnapshotImg} className="compare-img" alt="Snapshot BIM" />
              </div>

              <div className="compare-box">
                <p>Foto da obra</p>
                <img src={lastPhotoImg} className="compare-img" alt="Foto da obra" />
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={() => setShowImagesModal(false)}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
