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
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import "./TelaInicial.css";

// ============================
// CONFIG SUPABASE
// ============================
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const BUCKET_NAME = "canteiro de obras";

function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("não iniciada");
  const [report, setReport] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const viewerContainer = useRef(null);
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  // ============================
  // Histórico
  // ============================
  useEffect(() => {
    const fetchHistorico = async () => {
      const { data, error } = await supabase.storage
        .from(BUCKET_NAME)
        .list("arquivos", { limit: 30 });
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
  // Upload + análise Supabase
  // ============================
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setStatus("enviando...");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(`${SUPABASE_URL}/functions/v1/-rapid-service`, {
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
      console.error(err);
      setReport({ error: err.message });
      setStatus("falhou");
    }
  };

  // ============================
  // Renderização 3D leve (.GLB / .GLTF / fallback IFC convertido)
  // ============================
  useEffect(() => {
    if (!report?.url) return;
    const url = report.url;

    // Só renderiza se for modelo suportado
    if (!url.match(/\.(glb|gltf|ifc|bim)$/i)) return;

    const container = viewerContainer.current;
    if (!container) return;
    container.innerHTML = "";

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, 640 / 480, 0.1, 1000);
    camera.position.set(6, 6, 6);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(640, 480);
    renderer.setClearColor(0xf5f6fa);
    container.appendChild(renderer.domElement);

    // Luzes básicas
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(10, 10, 10);
    scene.add(dirLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    // Controles de órbita
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    // Plano base
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshBasicMaterial({ color: 0xe0e0e0, side: THREE.DoubleSide })
    );
    plane.rotation.x = -Math.PI / 2;
    scene.add(plane);

    // Loader leve
    const loader = new GLTFLoader();
    loader.load(
      url,
      (gltf) => {
        gltf.scene.traverse((child) => {
          if (child.isMesh) {
            child.material = new THREE.MeshBasicMaterial({
              color: 0x007aff,
              wireframe: true,
            });
          }
        });
        scene.add(gltf.scene);
        setStatus("modelo renderizado ✅");
      },
      (xhr) => {
        const pct = Math.round((xhr.loaded / xhr.total) * 100);
        setStatus(`carregando modelo ${pct}%`);
      },
      (err) => {
        console.error("❌ Erro ao carregar modelo:", err);
        setStatus("falhou");
      }
    );

    // Animação
    const animate = () => {
      requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      renderer.dispose();
    };
  }, [report]);

  // ============================
  // Relatório textual
  // ============================
  const renderReport = () => {
    if (!report) return null;
    if (report.error)
      return (
        <div className="report error">
          <FaExclamationTriangle /> Erro: {report.error}
        </div>
      );

    const progresso = parseInt(
      report?.simulacao?.progressoEstimado?.replace("%", "") || "0"
    );

    return (
      <div className="report success">
        <h3>📊 Relatório da Análise</h3>
        <p><strong>Status:</strong> {report.status}</p>
        {report.tipo && <p>Tipo: {report.tipo.toUpperCase()}</p>}
        {report.descricao && <p>📝 {report.descricao}</p>}
        {report.resumo && (
          <ul>
            {Object.entries(report.resumo).map(([k, v]) => (
              <li key={k}><strong>{k}</strong>: {v}</li>
            ))}
          </ul>
        )}
        {report.simulacao && (
          <div className="progress-section">
            <h4>🚧 Progresso</h4>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${progresso}%` }} />
            </div>
            <p className="progress-text">{report.simulacao.mensagem}</p>
          </div>
        )}
      </div>
    );
  };

  // ============================
  // Layout principal
  // ============================
  return (
    <div className="tela-container">
      {/* BARRA SUPERIOR */}
      <div className="top-bar">
        <div className="status-container">
          {status === "não iniciada" && <MdNotStarted className="status-icon not-started" />}
          {status.includes("enviando") && <MdAutorenew className="status-icon in-progress" />}
          {status.includes("carregando") && <MdAutorenew className="status-icon in-progress" />}
          {status.includes("modelo renderizado") && <MdCheckCircle className="status-icon done" />}
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

      {/* SIDEBAR */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <h3>📂 Histórico</h3>
        {historico.map((item, i) => (
          <div key={i} className="history-item">
            <a href={item.url} target="_blank" rel="noreferrer">{item.name}</a>
          </div>
        ))}
      </div>

      {/* CONTEÚDO */}
      <div className="content">
        <div className="content-inner">
          <h2 className="welcome-text">Bem-vindo, {username}! 👷‍♂️</h2>

          <label htmlFor="file-upload" className="upload-area">
            <FaFileUpload className="upload-icon" />
            <p>Clique ou arraste um arquivo (imagem ou modelo 3D)</p>
            <input
              id="file-upload"
              type="file"
              accept=".glb,.gltf,.ifc,.bim,.jpg,.jpeg,.png"
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

          {/* VISUALIZAÇÃO 3D */}
          <div
            ref={viewerContainer}
            className="viewer3d"
            style={{
              width: "640px",
              height: "480px",
              marginTop: "20px",
              borderRadius: "10px",
              border: "2px solid #003da5",
              overflow: "hidden",
            }}
          />
        </div>
      </div>
    </div>
  );
}

export default TelaInicial;
