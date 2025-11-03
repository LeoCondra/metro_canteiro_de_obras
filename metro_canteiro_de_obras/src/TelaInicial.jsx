import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  FaUserCircle,
  FaFileUpload,
  FaFileAlt,
  FaExclamationTriangle,
} from "react-icons/fa";
import {
  MdNotStarted,
  MdAutorenew,
  MdCheckCircle,
  MdCancel,
  MdMenu,
  MdClose,
  MdHistory,
  MdArrowBack,
} from "react-icons/md";
import { createClient } from "@supabase/supabase-js";
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  AmbientLight,
  DirectionalLight,
  Box3,
  Vector3,
} from "three";
import { IFCLoader } from "web-ifc-three/IFCLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import "./TelaInicial.css";

const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("não iniciada");
  const [report, setReport] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [filtroData, setFiltroData] = useState("");
  const [taxaLocal, setTaxaLocal] = useState(null);

  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  // ============================
  // 🧾 HISTÓRICO
  // ============================
  useEffect(() => {
    const fetchHistorico = async () => {
      const { data, error } = await supabase
        .from("analises")
        .select("*")
        .eq("username", username)
        .order("created_at", { ascending: false })
        .limit(30);
      if (!error && data) setHistorico(data);
    };
    fetchHistorico();
  }, [report, username]);

  // ============================
  // 📤 UPLOAD + ANALISE
  // ============================
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setStatus("enviando...");
    setProgress(0);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("username", username);

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/-rapid-analyze`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
        body: form,
      });

      const result = await resp.json();
      if (!resp.ok) throw new Error(result.error || "Erro na análise");

      setReport(result);
      setProgress(100);
      setStatus("concluída");
    } catch (err) {
      console.error("❌ Erro:", err);
      setReport({
        tipo: "erro",
        status: "Falha no processamento",
        descricao: err.message,
      });
      setStatus("falhou");
    }
  };

  // ============================
  // 🧱 VIEWER 3D
  // ============================
  useEffect(() => {
    if (!report || (report.tipo !== "modelo" && !report.url_ifc)) return;

    const container = viewerRef.current;
    if (!container) return;
    container.innerHTML = "";

    const scene = new Scene();
    scene.background = new Color(0xf3f4f6);
    const width = container.clientWidth || 600;
    const height = 400;

    const camera = new PerspectiveCamera(60, width / height, 0.1, 1000);
    camera.position.set(3, 3, 3);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const ambient = new AmbientLight(0xffffff, 0.8);
    const directional = new DirectionalLight(0xffffff, 1);
    directional.position.set(3, 3, 3);
    scene.add(ambient, directional);

    const loader = new IFCLoader();
    loader.ifcManager.setWasmPath("/");

    // ============================
    // 🧩 Função segura com fallback .glb
    // ============================
    async function safeLoadIFC(url_ifc, url_glb) {
      try {
        const head = await fetch(url_ifc, { method: "HEAD" });
        const size = parseInt(head.headers.get("content-length") || "0", 10);
        const sizeMB = size / 1024 / 1024;

        console.log(`📦 IFC: ${sizeMB.toFixed(2)} MB`);

        if (sizeMB > 100 && url_glb) {
          console.log("⚡ Exibindo preview .glb");
          loader.load(
            url_glb,
            (model) => {
              scene.add(model);
              const box = new Box3().setFromObject(model);
              const center = box.getCenter(new Vector3());
              const size = box.getSize(new Vector3()).length();
              const fit = size / (2 * Math.tan((Math.PI * camera.fov) / 360));

              controls.target.copy(center);
              camera.position.copy(center.clone().add(new Vector3(fit, fit, fit)));
              camera.lookAt(center);

              const animate = () => {
                requestAnimationFrame(animate);
                controls.update();
                renderer.render(scene, camera);
              };
              animate();

              setReport((prev) => ({
                ...prev,
                tipo: "preview",
                status: "Preview gerado ⚙️",
                descricao:
                  "Arquivo original muito grande — exibindo versão leve (.glb) automaticamente.",
              }));
            },
            undefined,
            (error) => {
              console.error("Erro no preview:", error);
              setReport({
                tipo: "erro",
                status: "Falha ao exibir preview",
                descricao: error.message,
              });
            }
          );
          return;
        }

        // Se o arquivo for leve, renderiza direto
        loader.load(url_ifc, (model) => {
          scene.add(model);
          const box = new Box3().setFromObject(model);
          const center = box.getCenter(new Vector3());
          const size = box.getSize(new Vector3()).length();
          const fit = size / (2 * Math.tan((Math.PI * camera.fov) / 360));
          controls.target.copy(center);
          camera.position.copy(center.clone().add(new Vector3(fit, fit, fit)));
          camera.lookAt(center);

          const animate = () => {
            requestAnimationFrame(animate);
            controls.update();
            renderer.render(scene, camera);
          };
          animate();
        });
      } catch (err) {
        console.error("⚠️ Falha ao carregar IFC:", err);
        setReport({
          tipo: "erro",
          status: "Falha ao renderizar modelo",
          descricao: err.message,
        });
      }
    }

safeLoadIFC(report.url_ifc || report.url, report.url_glb)

    return () => {
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [report]);

  // ============================
  // 📊 RELATÓRIO
  // ============================
  const renderReport = () => {
    if (!report) return null;
    if (report.tipo === "erro")
      return (
        <div className="report error">
          <FaExclamationTriangle /> {report.descricao}
          <button className="btn-voltar" onClick={() => setReport(null)}>
            <MdArrowBack /> Voltar
          </button>
        </div>
      );

    return (
      <div className="report success">
        <button className="btn-voltar" onClick={() => setReport(null)}>
          <MdArrowBack /> Voltar
        </button>

        <div className="tipo-arquivo">
          Tipo: <strong>{report.tipo?.toUpperCase()}</strong>
        </div>
        <p><strong>Status:</strong> {report.status}</p>
        {report.descricao && <p><strong>Descrição:</strong> {report.descricao}</p>}

        {report.tipo === "preview" && (
          <div className="alerta-info">
            🔍 Este é um preview do modelo original (.ifc).  
            O arquivo completo foi salvo em nuvem e pode ser aberto por ferramentas externas.
          </div>
        )}

        {report.tipo === "modelo" && (
          <div className="overlay-preview">
            <h4>🧱 Visualização 3D</h4>
            <div ref={viewerRef} className="ifc-viewer-container"></div>
          </div>
        )}
      </div>
    );
  };

  // ============================
  // 🧭 RENDER PRINCIPAL
  // ============================
  const historicoFiltrado = historico.filter(
    (item) => !filtroData || item.created_at.startsWith(filtroData)
  );

  return (
    <div className="tela-container">
      <div className="top-bar">
        <div className="status-container">
          {status === "não iniciada" && <MdNotStarted className="status-icon not-started" />}
          {status.includes("analisando") && <MdAutorenew className="status-icon in-progress" />}
          {status === "concluída" && <MdCheckCircle className="status-icon done" />}
          {status === "falhou" && <MdCancel className="status-icon failed" />}
          <span className="status-text">{status} {progress > 0 && `(${progress}%)`}</span>
        </div>

        <div className="user-section">
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <MdClose /> : <MdMenu />}
          </button>
          <button className="history-replay" title="Reproduzir histórico" onClick={() => window.location.reload()}>
            <MdHistory />
          </button>
          <span className="username">{username}</span>
          <FaUserCircle className="user-icon" />
        </div>
      </div>

      {/* SIDEBAR HISTÓRICO */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <h3>Histórico</h3>
        <input
          type="date"
          className="filtro-data"
          onChange={(e) => setFiltroData(e.target.value)}
        />
        {historicoFiltrado.map((item, i) => (
          <div key={i} className="history-item" onClick={() => setReport(item)}>
            <p><strong>{item.filename}</strong></p>
            <small>{new Date(item.created_at).toLocaleString()}</small>
            <p>Avanço: {item.progresso_fisico}%</p>
          </div>
        ))}
      </div>

      <div className="content">
        <div className="content-inner">
          {!report && (
            <>
              <h2 className="welcome-text">Bem-vindo, {username}! 👷‍♂️</h2>
              <label htmlFor="file-upload" className="upload-area">
                <FaFileUpload className="upload-icon" />
                <p>Envie uma imagem ou modelo BIM (.ifc/.glb)</p>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*,.ifc,.glb,.gltf"
                  capture="environment"
                  onChange={handleFileChange}
                  hidden
                />
              </label>

              {selectedFile && (
                <div className="file-display">
                  <FaFileAlt className="file-icon" />
                  <span>{selectedFile.name}</span>
                </div>
              )}
            </>
          )}

          {renderReport()}
        </div>
      </div>
    </div>
  );
}

export default TelaInicial;
