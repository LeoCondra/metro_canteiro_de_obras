import { useState } from "react";
import { useLocation } from "react-router-dom";
import { FaUserCircle, FaFileUpload, FaFileAlt, FaDownload } from "react-icons/fa";
import { MdNotStarted, MdAutorenew, MdCheckCircle } from "react-icons/md";
import supabase from "./Supabase.js";
import "./TelaInicial.css";

// Variáveis fixas do Supabase
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";

function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("não iniciada");
  const [report, setReport] = useState(null);
  const [bimFile, setBimFile] = useState(null);

  const location = useLocation();
  const username = location.state?.username || "Usuário";

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setStatus("em análise");

    try {
      // 1. Upload para bucket "canteiro-de-obras"
      const { error: uploadError } = await supabase.storage
        .from("canteiro de obras")
        .upload(`imagens/${file.name}`, file, {
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) throw new Error("Erro no upload: " + uploadError.message);

      // 2. URL pública do arquivo
      const { data: publicData } = supabase.storage
        .from("canteiro de obras")
        .getPublicUrl(`imagens/${file.name}`);

      const publicUrl = publicData.publicUrl;
      console.log("✅ URL pública do arquivo:", publicUrl);

      // 3. Invoca a Edge Function rapid-service
      const response = await fetch(`${SUPABASE_URL}/functions/v1/rapid-service`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
          // "Authorization": `Bearer ${SUPABASE_ANON_KEY}`, // se precisar auth
        },
        body: JSON.stringify({
          fileUrl: publicUrl,
          filename: file.name,
        }),
      });

      if (!response.ok) {
        const errMsg = await response.text();
        throw new Error(`Erro invoke (${response.status}): ${errMsg}`);
      }

      // 4. Resultado da análise
      const data = await response.json();
      setReport(data);
      setStatus("concluída");

      // 5. Simula BIM (gera JSON fake para download)
      const fakeBimFile = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      setBimFile(URL.createObjectURL(fakeBimFile));
    } catch (err) {
      console.error("❌ Erro ao processar:", err);
      setReport({ error: err.message });
      setStatus("não iniciada");
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
      default:
        return null;
    }
  };

  return (
    <div className="tela-container">
      {/* Top bar */}
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

      {/* Conteúdo central */}
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

          {report && (
            <div className="report">
              <h3>📊 Relatório da Análise</h3>
              <pre>{JSON.stringify(report, null, 2)}</pre>
            </div>
          )}

          {bimFile && (
            <a href={bimFile} download="projeto-gerado.bim" className="download-btn">
              <FaDownload /> Baixar Arquivo BIM
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default TelaInicial;
