import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import {
  FaUserCircle,
  FaFileUpload,
  FaFileAlt,
  FaExclamationTriangle,
  FaClock,
  FaImage,
  FaCube,
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
import { createClient } from "@supabase/supabase-js";
import "./TelaInicial.css";

// ============================
// 🌐 CONFIGURAÇÕES
// ============================
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";
const BUCKET = "canteiro de obras";

// 🔗 Coloca o domínio do backend Node hospedado no Render:
const NODE_RENDER_URL = "https://metro-canteiro-de-obras.onrender.com/compress";
;

// 🔗 URL exata da edge function Supabase:
const ANALYZE_URL =
  "https://aedludqrnwntsqgyjjla.functions.supabase.co/-rapid-analyze";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("não iniciada");
  const [report, setReport] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [progress, setProgress] = useState(0);
  const [historico, setHistorico] = useState([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState(null);

  const viewerRef = useRef(null);
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  // ============================
  // 📜 HISTÓRICO
  // ============================
  const carregarHistorico = async () => {
    try {
      const { data, error } = await supabase.storage
        .from(BUCKET)
        .list(`arquivos/${username}`, {
          limit: 100,
          sortBy: { column: "created_at", order: "desc" },
        });
      if (error) throw error;

      const items = data
        .filter((f) => f.name)
        .map((f) => {
          const { data: urlData } = supabase.storage
            .from(BUCKET)
            .getPublicUrl(`arquivos/${username}/${f.name}`);
          const ext = f.name.split(".").pop().toLowerCase();
          const tipo = ["jpg", "jpeg", "png", "gif", "bmp", "webp"].includes(ext)
            ? "imagem"
            : "modelo";
          return {
            nome: f.name,
            tipo,
            data: new Date(f.created_at || Date.now()).toLocaleString(),
            url: urlData.publicUrl,
          };
        });
      setHistorico(items);
    } catch (err) {
      console.error("❌ Erro ao carregar histórico:", err);
    }
  };

  useEffect(() => {
    carregarHistorico();
  }, []);

  // ============================
  // 📤 UPLOAD + ANÁLISE
  // ============================
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setStatus("processando...");
    setProgress(10);

    const ext = file.name.split(".").pop().toLowerCase();
    const isImage = ["jpg", "jpeg", "png", "bmp", "gif", "webp"].includes(ext);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("username", username);

    try {
      const endpoint = isImage ? ANALYZE_URL : NODE_RENDER_URL;
      const response = await fetch(endpoint, { method: "POST", body: formData });

      if (!response.ok) throw new Error("Falha no processamento do arquivo.");

      const result = await response.json();
      console.log("📥 Retorno do servidor:", result);

      setReport(result);
      setProgress(100);
      setStatus("concluída");
      setTimeout(() => carregarHistorico(), 3000);
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
  // 🧱 VISUALIZAÇÃO 3D
  // ============================
  useEffect(() => {
    const item = viewingHistoryItem || report;
    if (!item || item.tipo === "imagem" || !item.url) return;

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

    loader.load(item.url, (model) => {
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

    return () => {
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [report, viewingHistoryItem]);

  // ============================
  // 📊 RELATÓRIO VISUAL
  // ============================
  const renderReport = () => {
    const item = viewingHistoryItem || report;
    if (!item) return null;

    if (item.tipo === "erro")
      return (
        <div className="report error">
          <FaExclamationTriangle /> {item.descricao}
          <button
            className="btn-voltar"
            onClick={() => {
              setReport(null);
              setViewingHistoryItem(null);
            }}
          >
            <MdArrowBack /> Voltar
          </button>
        </div>
      );

    if (item.tipo === "imagem")
      return (
        <div className="report success">
          <button
            className="btn-voltar"
            onClick={() => {
              setReport(null);
              setViewingHistoryItem(null);
            }}
          >
            <MdArrowBack /> Voltar
          </button>
          <p>
            <strong>Status:</strong> {item.status}
          </p>
          <img
            src={item.url}
            alt="Analisada"
            style={{ maxWidth: "300px", borderRadius: "10px" }}
          />
        </div>
      );

    return (
      <div className="report success">
        <button
          className="btn-voltar"
          onClick={() => {
            setReport(null);
            setViewingHistoryItem(null);
          }}
        >
          <MdArrowBack /> Voltar
        </button>
        <p>
          <strong>Status:</strong> {item.status}
        </p>
        <div className="overlay-preview">
          <h4>🧱 Visualização 3D</h4>
          <div ref={viewerRef} className="ifc-viewer-container"></div>
        </div>
      </div>
    );
  };

  // ============================
  // 🕓 HISTÓRICO
  // ============================
  const renderHistorico = () => (
    <div className="historico-container">
      <h3>
        <FaClock /> Histórico de uploads
      </h3>
      {historico.length === 0 ? (
        <p>Nenhum arquivo encontrado.</p>
      ) : (
        <ul className="historico-lista">
          {historico.map((item, i) => (
            <li
              key={i}
              onClick={() => setViewingHistoryItem(item)}
              className="historico-item"
            >
              {item.tipo === "imagem" ? <FaImage /> : <FaCube />}{" "}
              <strong>{item.nome}</strong>
              <span className="data">{item.data}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  // ============================
  // 🧭 RENDER PRINCIPAL
  // ============================
  return (
    <div className="tela-container">
      <div className="top-bar">
        <div className="status-container">
          {status === "não iniciada" && (
            <MdNotStarted className="status-icon not-started" />
          )}
          {status.includes("processando") && (
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
          <MdHistory onClick={() => carregarHistorico()} />
          <span className="username">{username}</span>
          <FaUserCircle className="user-icon" />
        </div>
      </div>

      <div className="content">
        <div className="content-inner">
          {sidebarOpen ? (
            renderHistorico()
          ) : !report && !viewingHistoryItem ? (
            <>
              <h2 className="welcome-text">Bem-vindo, {username}! 👷‍♂️</h2>
              <label htmlFor="file-upload" className="upload-area">
                <FaFileUpload className="upload-icon" />
                <p>Envie uma imagem ou modelo BIM para análise</p>
                <input
                  id="file-upload"
                  type="file"
                  accept=".ifc,.glb,.gltf,.stl,.jpg,.jpeg,.png,.gif,.bmp,.webp"
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
          ) : (
            renderReport()
          )}
        </div>
      </div>
    </div>
  );
}

export default TelaInicial;
