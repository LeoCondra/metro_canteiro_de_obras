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

// URLs principais
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const NODE_COMPRESSOR_URL = "http://localhost:4000/compress";

function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("não iniciada");
  const [report, setReport] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [progress, setProgress] = useState(0);

  const viewerRef = useRef(null);
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  // ============================
  // 📤 UPLOAD + COMPRESSÃO
  // ============================
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setStatus("compactando...");
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("username", username);

      const response = await fetch(NODE_COMPRESSOR_URL, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Falha na compressão");
      const result = await response.json();

      setProgress(70);
      setStatus("renderizando...");

      setReport({
        tipo: "modelo",
        status: "Compactação concluída ✅",
        descricao: "Arquivo compactado e salvo com sucesso no Supabase.",
        url_ifc: result.url,
      });

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
  // 🧱 VIEWER 3D COM FALLBACK
  // ============================
  useEffect(() => {
    if (!report || (!report.url_ifc && !report.url)) return;

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

    async function safeLoadIFC(url_ifc, url_glb) {
      try {
        const head = await fetch(url_ifc, { method: "HEAD" });
        const size = parseInt(head.headers.get("content-length") || "0", 10);
        const sizeMB = size / 1024 / 1024;

        console.log(`📦 Tamanho IFC: ${sizeMB.toFixed(2)} MB`);

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
                status: "Preview leve ⚙️",
                descricao:
                  "Modelo original muito grande — exibindo versão reduzida (.glb).",
              }));
            },
            undefined,
            (error) => {
              console.error("Erro preview:", error);
              setReport({
                tipo: "erro",
                status: "Falha no preview .glb",
                descricao: error.message,
              });
            }
          );
          return;
        }

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

    safeLoadIFC(report.url_ifc || report.url, report.url_glb);

    return () => {
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [report]);

  // ============================
  // 📊 RELATÓRIO VISUAL
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

        <p><strong>Status:</strong> {report.status}</p>
        {report.descricao && <p><strong>Descrição:</strong> {report.descricao}</p>}

        {(report.tipo === "modelo" || report.tipo === "preview") && (
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
  return (
    <div className="tela-container">
      <div className="top-bar">
        <div className="status-container">
          {status === "não iniciada" && <MdNotStarted className="status-icon not-started" />}
          {status.includes("compactando") && <MdAutorenew className="status-icon in-progress" />}
          {status === "concluída" && <MdCheckCircle className="status-icon done" />}
          {status === "falhou" && <MdCancel className="status-icon failed" />}
          <span className="status-text">{status} {progress > 0 && `(${progress}%)`}</span>
        </div>

        <div className="user-section">
          <button className="toggle-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <MdClose /> : <MdMenu />}
          </button>
          <MdHistory />
          <span className="username">{username}</span>
          <FaUserCircle className="user-icon" />
        </div>
      </div>

      <div className="content">
        <div className="content-inner">
          {!report && (
            <>
              <h2 className="welcome-text">Bem-vindo, {username}! 👷‍♂️</h2>
              <label htmlFor="file-upload" className="upload-area">
                <FaFileUpload className="upload-icon" />
                <p>Envie um modelo BIM (.ifc / .glb) para compressão e visualização</p>
                <input
                  id="file-upload"
                  type="file"
                  accept=".ifc,.glb,.gltf,image/*"
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
