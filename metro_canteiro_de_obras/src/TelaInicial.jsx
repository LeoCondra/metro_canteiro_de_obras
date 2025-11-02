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
} from "react-icons/md";
import { createClient } from "@supabase/supabase-js";
import {
  Scene,
  PerspectiveCamera,
  WebGLRenderer,
  Color,
  AmbientLight,
  DirectionalLight,
} from "three";
import { IFCLoader } from "web-ifc-three/IFCLoader";
import "./TelaInicial.css";

// ============================
// CONFIGURAÇÃO SUPABASE
// ============================
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";
const BUCKET_NAME = "canteiro de obras";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================
// COMPONENTE PRINCIPAL
// ============================
function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("não iniciada");
  const [report, setReport] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef(null);
  const viewerRef = useRef(null); // container do modelo 3D
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  // ============================
  // HISTÓRICO
  // ============================
  useEffect(() => {
    const fetchHistorico = async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list("arquivos", { limit: 50 });
      if (!error && data) {
        setHistorico(
          data.map((item) => ({
            name: item.name,
            url: supabase.storage
              .from(BUCKET_NAME)
              .getPublicUrl(`arquivos/${item.name}`).data.publicUrl,
          }))
        );
      }
    };
    fetchHistorico();
  }, [report]);

  // ============================
  // UPLOAD + ANÁLISE
  // ============================
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setStatus("analisando...");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("username", username);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/-rapid-analyze`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus("falhou");
        setReport({
          tipo: "erro",
          status: data.status || "Falha no servidor",
          descricao: data.descricao || "Erro desconhecido",
        });
        return;
      }

      setReport(data);
      setStatus("concluída");

      // Simula progresso visual suave
      let value = 0;
      const interval = setInterval(() => {
        value += 10;
        if (value >= 100) {
          clearInterval(interval);
          setProgress(100);
        } else {
          setProgress(value);
        }
      }, 150);
    } catch (err) {
      console.error("Erro:", err);
      setStatus("falhou");
      setReport({
        tipo: "erro",
        status: "Falha ao conectar ao servidor",
        descricao: err.message,
      });
    }
  };

  // ============================
  // CANVAS OVERLAY
  // ============================
  useEffect(() => {
    if (!report?.overlay || report.overlay.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = 1.5;
    report.overlay.forEach((det) => {
      const { xMin, yMin, xMax, yMax } = det.box;
      const color = det.cor || "#2563eb";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(
        xMin * scale,
        yMin * scale,
        (xMax - xMin) * scale,
        (yMax - yMin) * scale
      );
      ctx.fillStyle = color;
      ctx.font = "12px Arial";
      ctx.fillText(det.nome, xMin * scale + 5, yMin * scale - 5);
    });
  }, [report]);

  // ============================
  // RENDERIZAÇÃO 3D IFC
  // ============================
  useEffect(() => {
    if (!report?.tipo || report.tipo !== "bim" || !report.url) return;

    const container = viewerRef.current;
    if (!container) return;

    container.innerHTML = "";

    const scene = new Scene();
    scene.background = new Color(0xf3f4f6);

    const camera = new PerspectiveCamera(60, 600 / 400, 0.1, 1000);
    camera.position.set(3, 3, 3);

    const renderer = new WebGLRenderer({ antialias: true });
    renderer.setSize(600, 400);
    container.appendChild(renderer.domElement);

    const light1 = new AmbientLight(0xffffff, 0.8);
    const light2 = new DirectionalLight(0xffffff, 0.8);
    light2.position.set(3, 3, 3);
    scene.add(light1, light2);

    const ifcLoader = new IFCLoader();
    ifcLoader.load(
      report.url,
      (model) => {
        scene.add(model);
        renderer.render(scene, camera);
        const animate = () => {
          requestAnimationFrame(animate);
          model.rotation.y += 0.005;
          renderer.render(scene, camera);
        };
        animate();
      },
      undefined,
      (error) => console.error("Erro ao carregar modelo IFC:", error)
    );

    return () => renderer.dispose();
  }, [report]);

  // ============================
  // RENDER RELATÓRIO
  // ============================
  const renderReport = () => {
    if (!report) return null;
    if (report.tipo === "erro") {
      return (
        <div className="report error">
          <FaExclamationTriangle /> {report.status}
          <p>{report.descricao}</p>
        </div>
      );
    }

    const current = report;
    const progresso = parseInt(current?.simulacao?.progressoEstimado || progress);

    return (
      <div className="report success">
        <div className="tipo-arquivo">
          Tipo de arquivo: <strong>{current.tipo?.toUpperCase()}</strong>
        </div>
        <p><strong>Status:</strong> {current.status}</p>
        {current.descricao && <p><strong>Descrição:</strong> {current.descricao}</p>}

        {/* 🧱 Renderização 3D se for BIM */}
        {current.tipo === "bim" && (
          <div className="overlay-preview">
            <h4>🧱 Visualização 3D do Modelo</h4>
            <div ref={viewerRef} className="ifc-viewer-container"></div>
          </div>
        )}

        {/* 🔍 Visualização Overlay se for Imagem */}
        {current.overlay && current.overlay.length > 0 && current.tipo !== "bim" && (
          <div className="overlay-preview">
            <h4>🔹 Visualização</h4>
            <canvas ref={canvasRef} width={600} height={400}></canvas>
            <div className="legend">
              {Array.from(new Set(current.overlay.map((o) => o.cor))).map(
                (color, i) => (
                  <div key={i} className="legend-item">
                    <div
                      className="color-box"
                      style={{ backgroundColor: color }}
                    ></div>
                    {`Elemento ${i + 1}`}
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {/* 🚧 Progresso da Análise */}
        <div className="progress-section">
          <h4>🚧 Progresso da Análise</h4>
          <div className="progress-bar">
            <div
              className="progress-fill"
              style={{ width: `${progresso}%` }}
            ></div>
          </div>
          <p className="progress-text">
            {current?.simulacao?.mensagem || "Analisando..."}
          </p>
        </div>
      </div>
    );
  };

  // ============================
  // RENDER PRINCIPAL
  // ============================
  return (
    <div className="tela-container">
      <div className="top-bar">
        <div className="status-container">
          {status === "não iniciada" && <MdNotStarted className="status-icon not-started" />}
          {status.includes("analisando") && <MdAutorenew className="status-icon in-progress" />}
          {status === "concluída" && <MdCheckCircle className="status-icon done" />}
          {status === "falhou" && <MdCancel className="status-icon failed" />}
          <span className="status-text">{status}</span>
        </div>

        <div className="user-section">
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <MdClose /> : <MdMenu />}
          </button>
          <span className="username">{username}</span>
          <FaUserCircle className="user-icon" />
        </div>
      </div>

      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <h3>Histórico</h3>
        {historico.map((item, i) => (
          <div key={i} className="history-item">
            <p>{item.name}</p>
          </div>
        ))}
      </div>

      <div className="content">
        <div className="content-inner">
          <h2 className="welcome-text">Bem-vindo, {username}! 👋</h2>
          <label htmlFor="file-upload" className="upload-area">
            <FaFileUpload className="upload-icon" />
            <p>Envie uma imagem ou modelo BIM para análise</p>
            <input
              id="file-upload"
              type="file"
              accept="image/*,.ifc,.bim,.obj,.glb,.gltf,.stl"
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

          {renderReport()}
        </div>
      </div>
    </div>
  );
}

export default TelaInicial;
