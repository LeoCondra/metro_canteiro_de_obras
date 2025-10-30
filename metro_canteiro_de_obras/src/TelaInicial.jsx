import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import {
  FaUserCircle, FaFileUpload, FaFileAlt, FaCheck, FaExclamationTriangle
} from "react-icons/fa";
import {
  MdNotStarted, MdAutorenew, MdCheckCircle, MdCancel,
  MdMenu, MdClose
} from "react-icons/md";
import { createClient } from "@supabase/supabase-js";
import "./TelaInicial.css";

// Supabase
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";
const BUCKET_NAME = "canteiro de obras";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Categorias
const categorizeDetections = (deteccoes) => {
  const categorias = { pessoas: [], materiais: [], estruturas: [], outros: [] };
  (deteccoes || []).forEach((d) => {
    const desc = d.description?.toLowerCase() || "";
    if (desc.includes("person") || desc.includes("worker")) categorias.pessoas.push(d.description);
    else if (desc.includes("brick") || desc.includes("concrete") || desc.includes("wood") || desc.includes("steel")) categorias.materiais.push(d.description);
    else if (desc.includes("building") || desc.includes("scaffold") || desc.includes("crane")) categorias.estruturas.push(d.description);
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

  const location = useLocation();
  const username = location.state?.username || "Usuário";

  // Buscar histórico do bucket
  useEffect(() => {
    const fetchHistorico = async () => {
      const { data, error } = await supabase
        .storage
        .from(BUCKET_NAME)
        .list("imagens", { limit: 50 });
      if (!error && data) {
        setHistorico(
          data.map((item) => ({
            name: item.name,
            url: supabase.storage.from(BUCKET_NAME).getPublicUrl(`imagens/${item.name}`).data.publicUrl,
          }))
        );
      }
    };
    fetchHistorico();
  }, [report]);

  // Upload
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
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
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

  // Toggle seleção histórico
  const toggleSelecionado = (item) => {
    setSelecionados((prev) =>
      prev.find((s) => s.name === item.name)
        ? prev.filter((s) => s.name !== item.name)
        : prev.length < 2
        ? [...prev, item]
        : prev
    );
  };

  // Render relatório
  const renderReport = () => {
    if (!report && selecionados.length === 0) return null;

    // Erro
    if (report?.error) {
      return (
        <div className="report error">
          <FaExclamationTriangle /> Erro: {report.error}
        </div>
      );
    }

    const current = report || selecionados[0];
    const categorias = current?.deteccoes ? categorizeDetections(current.deteccoes) : null;

    return (
      <div className="report success">
        <h3>📊 Relatório da Análise</h3>

        {/* BIM */}
        {current?.bim && (
          <div className="bim-block">
            <h4>Modelo BIM</h4>
            <p>Progresso: {current.bim.progresso}</p>
            <p><strong>Encontrados:</strong> {current.bim.encontrados.join(", ")}</p>
            <p><strong>Faltando:</strong> {current.bim.faltando.join(", ")}</p>
          </div>
        )}

        {/* Detecções */}
        {categorias && (
          <div className="detections">
            {Object.entries(categorias).map(([key, arr]) =>
              arr.length > 0 && (
                <div key={key} className="det-group">
                  <h5>{key}</h5>
                  <ul>{arr.map((v, i) => <li key={i}>{v}</li>)}</ul>
                </div>
              )
            )}
          </div>
        )}

        {/* Overlay */}
        {current?.overlay && current.overlay.length > 0 && (
          <div className="overlay-block">
            <h4>Overlay AR/VR</h4>
            <p>Bounding boxes detectados para renderização.</p>
            <pre>{JSON.stringify(current.overlay.slice(0,3), null, 2)}...</pre>
          </div>
        )}

        {/* Comparação histórica */}
        {current?.comparacao && (
          <div className="comparacao-block">
            <h4>Comparação Histórica</h4>
            <p>Progresso: {current.comparacao.progresso}</p>
            {current.comparacao.novos?.length > 0 && (
              <ul>
                {current.comparacao.novos.map((n, i) => <li key={i}>{n}</li>)}
              </ul>
            )}
            <div className="compare-images">
              <img src={current.comparacao.imgA} alt="Histórico A" />
              <img src={current.comparacao.imgB} alt="Histórico B" />
            </div>
          </div>
        )}

        {/* AR/VR placeholder */}
        {current?.arvr && (
          <div className="arvr-block">
            <h4>AR/VR</h4>
            <p>{current.arvr.instrucoes}</p>
          </div>
        )}

        {current.url && <img src={current.url} alt="obra" className="obra-img" />}
      </div>
    );
  };

  return (
    <div className="tela-container">
      {/* Top bar */}
      <div className="top-bar">
        <div className="status-container">
          {status === "não iniciada" && <MdNotStarted className="status-icon not-started" />}
          {status === "em análise" && <MdAutorenew className="status-icon in-progress" />}
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

      {/* Sidebar */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <h3>Histórico</h3>
        {historico.map((item, i) => (
          <div key={i} className="history-item">
            <input
              type="checkbox"
              checked={!!selecionados.find((s) => s.name === item.name)}
              onChange={() => toggleSelecionado(item)}
            />
            <img src={item.url} alt={item.name} className="history-thumb" />
            <p>{item.name}</p>
          </div>
        ))}
      </div>

      {/* Conteúdo */}
      <div className="content">
        <div className="content-inner">
          <h2 className="welcome-text">Bem-vindo, {username}! 👋</h2>
          <label htmlFor="file-upload" className="upload-area">
            <FaFileUpload className="upload-icon" />
            <p>Clique ou arraste um arquivo aqui</p>
            <input id="file-upload" type="file" accept="image/*" onChange={handleFileChange} hidden />
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
