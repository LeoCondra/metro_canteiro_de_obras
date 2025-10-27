import { useState } from "react";
import { useLocation } from "react-router-dom";
import { 
  FaUserCircle, FaFileUpload, FaFileAlt, FaCheck, FaExclamationTriangle 
} from "react-icons/fa";
import { 
  MdNotStarted, MdAutorenew, MdCheckCircle, MdCancel 
} from "react-icons/md";
import "./TelaInicial.css";

// Variáveis fixas do Supabase
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";

// Função para categorizar as detecções do Vision
const categorizeDetections = (deteccoes) => {
  const categorias = {
    pessoas: [],
    materiais: [],
    estruturas: [],
    outros: [],
  };

  deteccoes.forEach((d) => {
    const desc = d.description?.toLowerCase() || "";

    if (desc.includes("person") || desc.includes("worker") || desc.includes("man") || desc.includes("woman")) {
      categorias.pessoas.push(d.description);
    } else if (
      desc.includes("brick") || desc.includes("concrete") || desc.includes("wood") ||
      desc.includes("steel") || desc.includes("glass") || desc.includes("cement")
    ) {
      categorias.materiais.push(d.description);
    } else if (
      desc.includes("building") || desc.includes("scaffold") || desc.includes("crane") ||
      desc.includes("tower") || desc.includes("bridge")
    ) {
      categorias.estruturas.push(d.description);
    } else {
      categorias.outros.push(d.description);
    }
  });

  return categorias;
};

function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("não iniciada");
  const [report, setReport] = useState(null);

  const location = useLocation();
  const username = location.state?.username || "Usuário";

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
          "apikey": SUPABASE_ANON_KEY,
          "Authorization": `Bearer ${SUPABASE_ANON_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errMsg = await response.text();
        throw new Error(`Erro invoke (${response.status}): ${errMsg}`);
      }

      const data = await response.json();
      setReport(data);
      setStatus("concluída");
    } catch (err) {
      console.error("❌ Erro ao processar:", err);
      setReport({ error: err.message });
      setStatus("falhou");
    }
  };

  const renderStatusIcon = () => {
    switch (status) {
      case "não iniciada":
        return <MdNotStarted className="status-icon not-started" />;
      case "em análise":
        return <MdAutorenew className="status-icon in-progress" />;
      case "concluída":
        return <MdCheckCircle className="status-icon done" />;
      case "falhou":
        return <MdCancel className="status-icon failed" />;
      default:
        return null;
    }
  };

  const renderReport = () => {
    if (!report) return null;

    if (report.error) {
      return (
        <div className="report error">
          <FaExclamationTriangle className="error-icon" />
          <p>Erro na análise: {report.error}</p>
        </div>
      );
    }

    const categorias = report.deteccoes ? categorizeDetections(report.deteccoes) : null;

    return (
      <div className="report success">
        <h3>📊 Relatório da Análise</h3>
        <ul>
          <li><FaCheck className="ok-icon"/> Arquivo: {report.arquivo}</li>
          <li><FaCheck className="ok-icon"/> Status: {report.status}</li>
          <li><FaCheck className="ok-icon"/> 
            URL: <a href={report.url} target="_blank" rel="noreferrer">{report.url}</a>
          </li>
        </ul>

        {categorias && (
          <div className="detections">
            {categorias.pessoas.length > 0 && (
              <div className="det-group pessoas">
                <h5>👷 Pessoas</h5>
                <ul>
                  {categorias.pessoas.map((p, i) => (
                    <li key={`p-${i}`}><FaCheck className="ok-icon"/> {p}</li>
                  ))}
                </ul>
              </div>
            )}

            {categorias.materiais.length > 0 && (
              <div className="det-group materiais">
                <h5>🧱 Materiais</h5>
                <ul>
                  {categorias.materiais.map((m, i) => (
                    <li key={`m-${i}`}><FaCheck className="ok-icon"/> {m}</li>
                  ))}
                </ul>
              </div>
            )}

            {categorias.estruturas.length > 0 && (
              <div className="det-group estruturas">
                <h5>🏗️ Estruturas</h5>
                <ul>
                  {categorias.estruturas.map((e, i) => (
                    <li key={`e-${i}`}><FaCheck className="ok-icon"/> {e}</li>
                  ))}
                </ul>
              </div>
            )}

            {categorias.outros.length > 0 && (
              <div className="det-group outros">
                <h5>📦 Outros</h5>
                <ul>
                  {categorias.outros.map((o, i) => (
                    <li key={`o-${i}`}><FaCheck className="ok-icon"/> {o}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="tela-container">
      <div className="top-bar">
        <div className="status-container">
          {renderStatusIcon()}
          <span className="status-text">{status}</span>
        </div>
        <div className="user-section">
          <span className="username">{username}</span>
          <FaUserCircle className="user-icon" />
        </div>
      </div>

      <div className="content">
        <div className="content-inner">
          <h2 className="welcome-text">Bem-vindo, {username}! 👋</h2>

          <label htmlFor="file-upload" className="upload-area">
            <FaFileUpload className="upload-icon" />
            <p>Clique ou arraste um arquivo aqui</p>
            <input
              id="file-upload"
              type="file"
              accept="image/*"
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
