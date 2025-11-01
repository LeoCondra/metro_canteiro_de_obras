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
import pako from "pako";
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
// HELPERS
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
      desc.includes("crane") ||
      desc.includes("wall") ||
      desc.includes("door") ||
      desc.includes("window")
    )
      categorias.estruturas.push(d.description);
    else categorias.outros.push(d.description);
  });
  return categorias;
};

// divide arquivo grande
async function splitFile(file, partsCount = 8) {
  const buffer = await file.arrayBuffer();
  const total = buffer.byteLength;
  const partSize = Math.ceil(total / partsCount);
  const parts = [];

  for (let i = 0; i < partsCount; i++) {
    const start = i * partSize;
    if (start >= total) break;
    const end = Math.min(start + partSize, total);
    const blob = new Blob([buffer.slice(start, end)]);
    const part = new File([blob], `${file.name}.part${String(i + 1).padStart(2, "0")}`);
    parts.push(part);
  }

  return parts;
}

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
  // Histórico
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
  // Upload + análise com split
  // ============================
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);

    const ext = file.name.split(".").pop().toLowerCase();
    const isModelo = ["ifc", "bim", "obj", "glb", "gltf", "stl"].includes(ext);

    try {
      if (isModelo && file.size > 50 * 1024 * 1024) {
        setStatus("dividindo arquivo...");
        const parts = await splitFile(file);
        const partNames = [];

        setStatus("enviando partes...");
        for (const [idx, part] of parts.entries()) {
          const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(`arquivos/${part.name}`, part, { upsert: true });
          if (error) throw error;
          partNames.push(part.name);
          setStatus(`enviando parte ${idx + 1}/${parts.length}`);
        }

        setStatus("analisando (merge)...");
        const mergeResponse = await fetch(
          `${SUPABASE_URL}/functions/v1/rapid-service`,
          {
            method: "POST",
            headers: {
              apikey: SUPABASE_ANON_KEY,
              Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              tipo: "split_merge",
              partes: partNames,
            }),
          }
        );

        if (!mergeResponse.ok)
          throw new Error(`Erro invoke (${mergeResponse.status})`);
        const mergeData = await mergeResponse.json();
        setReport(mergeData);
        setStatus("concluída");
        return;
      }

      // modelo pequeno → compressão gzip padrão
      setStatus("comprimindo...");
      let fileToSend = file;
      if (isModelo) {
        const buffer = new Uint8Array(await file.arrayBuffer());
        const compressed = pako.gzip(buffer);
        const blob = new Blob([compressed], { type: "application/gzip" });
        fileToSend = new File([blob], file.name + ".gz");
      }

      setStatus("enviando...");
      const formData = new FormData();
      formData.append("file", fileToSend);

      const response = await fetch(
        `${SUPABASE_URL}/functions/v1/rapid-service`,
        {
          method: "POST",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: formData,
        }
      );

      if (!response.ok) throw new Error(`Erro invoke (${response.status})`);
      const data = await response.json();
      setReport(data);
      setStatus("concluída");
    } catch (err) {
      console.error(err);
      setReport({ error: err.message });
      setStatus("falhou");
    }
  };

  // ============================
  // Render overlay
  // ============================
  useEffect(() => {
    if (!report?.overlay || report.overlay.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const scale = 4;
    report.overlay.forEach((det) => {
      const { xMin, yMin, xMax, yMax } = det.box;
      const color = det.color || "#00ff00";
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(xMin * scale, yMin * scale, (xMax - xMin) * scale, (yMax - yMin) * scale);
      ctx.fillStyle = color;
      ctx.font = "10px Arial";
      ctx.fillText(`${det.name}`, xMin * scale + 3, yMin * scale - 5);
    });
  }, [report]);

  // ============================
  // Render relatório textual
  // ============================
  const renderReport = () => {
    if (!report) return null;
    if (report.error)
      return (
        <div className="report error">
          <FaExclamationTriangle /> Erro: {report.error}
        </div>
      );

    const current = report;
    const progresso = parseInt(
      current?.simulacao?.progressoEstimado?.replace("%", "") || "0"
    );

    return (
      <div className="report success">
        <h3>📊 Relatório da Análise</h3>
        <p>
          Tipo de arquivo: <strong>{current.tipo?.toUpperCase()}</strong>
        </p>
        <p>
          <strong>Status:</strong> {current.status}
        </p>

        {current?.simulacao && (
          <div className="progress-section">
            <h4>🚧 Progresso estimado</h4>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progresso}%` }}
              />
            </div>
            <p className="progress-text">{current.simulacao.mensagem}</p>
          </div>
        )}
      </div>
    );
  };

  // ============================
  // Render principal
  // ============================
  return (
    <div className="tela-container">
      <div className="top-bar">
        <div className="status-container">
          {status === "não iniciada" && <MdNotStarted className="status-icon not-started" />}
          {status.includes("comprimindo") ||
          status.includes("enviando") ||
          status.includes("dividindo") ||
          status.includes("analisando") ? (
            <MdAutorenew className="status-icon in-progress" />
          ) : null}
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
