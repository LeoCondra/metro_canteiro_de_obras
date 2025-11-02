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

// ============================
// 🔧 SUPABASE CONFIG
// ============================
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";
const BUCKET_NAME = "canteiro de obras";
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
  // 📤 UPLOAD E ANÁLISE
  // ============================
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setStatus("enviando...");
    setProgress(0);

    const uploadName = `${Date.now()}-${file.name}`;
    const uploadPath = `arquivos/${uploadName}`;
    const { data: signedData, error: signedError } = await supabase.storage
      .from(BUCKET_NAME)
      .createSignedUploadUrl(uploadPath);

    if (signedError) {
      setStatus("falhou");
      console.error("Erro ao criar URL de upload:", signedError);
      return;
    }

    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        setProgress(Math.round((e.loaded / e.total) * 100));
      }
    };

    xhr.onload = async () => {
      setStatus("analisando...");
      try {
        const response = await fetch(`${SUPABASE_URL}/functions/v1/-rapid-analyze`, {
          method: "POST",
          mode: "cors",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
          body: (() => {
            const formData = new FormData();
            formData.append("file", file, file.name);
            formData.append("username", username);
            return formData;
          })(),
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.descricao || "Erro na análise");

        setReport(result);
        setStatus("concluída");
        setProgress(100);
      } catch (err) {
        console.error(err);
        setReport({
          tipo: "erro",
          status: "Falha na análise",
          descricao: err.message,
        });
        setStatus("falhou");
      }
    };

    xhr.onerror = () => setStatus("falhou");
    xhr.open("PUT", signedData.signedUrl);
    xhr.send(file);
  };

  // ============================
  // ⚙️ COMPARAÇÃO LOCAL MODELO × IMAGEM
  // ============================
  useEffect(() => {
    if (!report?.detections || report.tipo !== "imagem") return;
    const ifcElements = ["Wall", "Slab", "Column"];
    const matches = ifcElements.filter((el) =>
      report.detections?.some((d) =>
        d.nome?.toLowerCase().includes(el.toLowerCase())
      )
    );
    const taxa = Math.round((matches.length / ifcElements.length) * 100);
    setTaxaLocal(taxa);
  }, [report]);

  // ============================
  // 🖼️ OVERLAY 2D
  // ============================
  useEffect(() => {
    if (!report?.overlay || report.overlay.length === 0) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    report.overlay.forEach((det) => {
      const { xMin, yMin, xMax, yMax } = det.box;
      ctx.strokeStyle = det.cor || "#2563eb";
      ctx.lineWidth = 2;
      ctx.strokeRect(xMin, yMin, xMax - xMin, yMax - yMin);
      ctx.fillStyle = det.cor || "#2563eb";
      ctx.font = "12px Arial";
      ctx.fillText(det.nome, xMin + 5, yMin - 5);
    });
  }, [report]);

  // ============================
  // 🧱 VIEWER 3D
  // ============================
  useEffect(() => {
    if (!report?.url || report.tipo !== "modelo") return;
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

    loader.load(
      report.url,
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
      },
      undefined,
      (error) => {
        console.error("❌ Erro IFC:", error);
        setReport({
          tipo: "erro",
          status: "Falha na renderização IFC",
          descricao: error.message,
        });
      }
    );

    return () => {
      renderer.dispose();
      container.innerHTML = "";
    };
  }, [report?.url]);

  // ============================
  // 📊 RELATÓRIO FINAL
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

        {taxaLocal !== null && (
          <div className="comparacao-local">
            <h4>🧩 Comparação modelo × imagem</h4>
            <p>Compatibilidade: {taxaLocal}%</p>
            {taxaLocal < 70 && (
              <div className="alerta">
                ⚠️ Inconsistência detectada: compatibilidade abaixo do ideal.
              </div>
            )}
          </div>
        )}

        {report.simulacao && (
          <div className="progress-section">
            <h4>📊 {report.simulacao.mensagem}</h4>
            <p>{report.simulacao.progressoEstimado}%</p>
          </div>
        )}
        {report.overlay && report.overlay.length > 0 && (
          <div className="overlay-preview">
            <h4>🔹 Visualização</h4>
            <canvas ref={canvasRef} width={600} height={400}></canvas>
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
                <p>Envie uma imagem ou modelo BIM (.ifc/.glb) para análise</p>
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
            </>
          )}

          {renderReport()}
        </div>
      </div>
    </div>
  );
}

export default TelaInicial;
