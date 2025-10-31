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
import "./TelaInicial.css";

// ============================
// CONFIG
// ============================
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";
const BUCKET_NAME = "canteiro de obras";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================
// HELPER: Categoriza detecções visuais
// ============================
const categorizeDetections = (deteccoes) => {
  const categorias = { pessoas: [], materiais: [], estruturas: [], outros: [] };
  (deteccoes || []).forEach((d) => {
    const desc = d.description?.toLowerCase() || "";
    if (desc.includes("person") || desc.includes("worker"))
      categorias.pessoas.push(d.description);
    else if (
      desc.includes("brick") ||
      desc.includes("concrete") ||
      desc.includes("wood") ||
      desc.includes("steel")
    )
      categorias.materiais.push(d.description);
    else if (
      desc.includes("building") ||
      desc.includes("scaffold") ||
      desc.includes("crane")
    )
      categorias.estruturas.push(d.description);
    else categorias.outros.push(d.description);
  });
  return categorias;
};

function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("não iniciada");
  const [report, setReport] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const canvasRef = useRef(null);
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  // ============================
  // Buscar histórico
  // ============================
  useEffect(() => {
    const fetchHistorico = async () => {
      const { data, error } = await supabase
        .storage
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
  // Upload + análise
  // ============================
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setStatus("em análise");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/rapid-service`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) throw new Error(`Erro invoke (${response.status})`);

      const data = await response.json();
      setReport(data);
      setStatus("concluída");
    } catch (err) {
      setReport({ error: err.message });
      setStatus("falhou");
    }
  };

  // ============================
  // Render overlay (YOLO/IFC)
  // ============================
  useEffect(() => {
    if (!report?.overlay || report.overlay.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Ajusta escala
    const scale = 5; // escala simbólica de zoom
    report.overlay.forEach((det) => {
      const { xMin, yMin, xMax, yMax } = det.box;
      const color = det.color || "#00ff00";
      const width = (xMax - xMin) * scale;
      const height = (yMax - yMin) * scale;
      const x = xMin * scale + 200;
      const y = yMin * scale + 200;

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, width, height);

      ctx.fillStyle = color;
      ctx.font = "10px Arial";
      ctx.fillText(`${det.name} (${Math.round(det.score * 100)}%)`, x + 3, y - 5);
    });
  }, [report]);

  // ============================
  // Render relatório textual
  // ============================
  const renderReport = () => {
    if (!report && selecionados.length === 0) return null;
    if (report?.error)
      return (
        <div className="report error">
          <FaExclamationTriangle /> Erro: {report.error}
        </div>
      );

    const current = report || selecionados[0];
    const categorias = current?.deteccoes
      ? categorizeDetections(current.deteccoes)
      : null;

    const progresso = current?.bim?.progresso
      ? parseInt(current.bim.progresso)
      : current?.simulacao?.progressoEstimado
      ? parseInt(current.simulacao.progressoEstimado)
      : 0;

    return (
      <div className="report success">
        <h3>📊 Relatório da Análise</h3>
        {current?.tipo && (
          <p>
            Tipo de arquivo: <strong>{current.tipo.toUpperCase()}</strong>
          </p>
        )}

        {/* Progresso */}
        {current?.simulacao && (
          <div className="progress-section">
            <h4>🚧 Progresso estimado</h4>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progresso}%` }} />
            </div>
            <p className="progress-text">{current.simulacao.mensagem}</p>
          </div>
        )}

        {/* BIM */}
        {current?.bim && (
          <div className="bim-block">
            <h4>Modelo BIM</h4>
            <p>Progresso: {current.bim.progresso}</p>
            <p>
              <strong>Encontrados:</strong> {current.bim.encontrados.join(", ")}
            </p>
            <p>
              <strong>Faltando:</strong> {current.bim.faltando.join(", ")}
            </p>
          </div>
        )}

        {/* Categorias visuais */}
        {categorias && (
          <div className="detections">
            {Object.entries(categorias).map(
              ([key, arr]) =>
                arr.length > 0 && (
                  <div key={key} className="det-group">
                    <h5>{key}</h5>
                    <ul>{arr.map((v, i) => <li key={i}>{v}</li>)}</ul>
                  </div>
                )
            )}
          </div>
        )}

        {/* Render overlay visual */}
        {current?.overlay && current.overlay.length > 0 && (
          <div className="overlay-preview">
            <h4>🧱 Visualização 2D do Modelo / Detecções</h4>
            <canvas ref={canvasRef} width={600} height={400} />
            <div className="legend">
              {[
                ...new Set(current.overlay.map((d) => d.name)),
              ].map((type, i) => {
                const color =
                  current.overlay.find((d) => d.name === type)?.color || "#ccc";
                return (
                  <div key={i} className="legend-item">
                    <span
                      className="color-box"
                      style={{ background: color }}
                    ></span>
                    {type}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {current.tipo === "imagem" && current.url && (
          <img src={current.url} alt="obra" className="obra-img" />
        )}
      </div>
    );
  };

  // ============================
  // RENDER PRINCIPAL
  // ============================
  return (
    <div className="tela-container">
      {/* Top bar */}
      <div className="top-bar">
        <div className="status-container">
          {status === "não iniciada" && (
            <MdNotStarted className="status-icon not-started" />
          )}
          {status === "em análise" && (
            <MdAutorenew className="status-icon in-progress" />
          )}
          {status === "concluída" && (
            <MdCheckCircle className="status-icon done" />
          )}
          {status === "falhou" && <MdCancel className="status-icon failed" />}
          <span className="status-text">{status}</span>
        </div>
        <div className="user-section">
          <button
            className="toggle-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <MdClose /> : <MdMenu />}
          </button>
          <span className="username">{username}</span>
          <FaUserCircle className="user-icon" />
        </div>
      </div>

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <h3>Histórico</h3>
        {historico.map((item, i) => (
          <div key={i} className="history-item">
            <input
              type="checkbox"
              checked={!!selecionados.find((s) => s.name === item.name)}
              onChange={() =>
                setSelecionados((prev) =>
                  prev.find((s) => s.name === item.name)
                    ? prev.filter((s) => s.name !== item.name)
                    : prev.length < 2
                    ? [...prev, item]
                    : prev
                )
              }
            />
            <p>{item.name}</p>
          </div>
        ))}
      </div>

      {/* Conteúdo principal */}
      <div className="content">
        <div className="content-inner">
          <h2 className="welcome-text">Bem-vindo, {username}! 👋</h2>
          <label htmlFor="file-upload" className="upload-area">
            <FaFileUpload className="upload-icon" />
            <p>Clique ou arraste um arquivo (imagem ou modelo BIM)</p>
            <input
              id="file-upload"
              type="file"
              accept=".jpg,.jpeg,.png,.bmp,.gif,.webp,.ifc,.bim,.obj,.glb,.gltf,.stl"
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
