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
  const canvasRef = useRef(null);
  const viewerRef = useRef(null);
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  // ============================
  // 🧾 HISTÓRICO DE ANÁLISES (BANCO)
  // ============================
  useEffect(() => {
    const fetchHistorico = async () => {
      const { data, error } = await supabase
        .from("analises")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30);

      if (!error && data) setHistorico(data);
    };
    fetchHistorico();
  }, [report]);

  // ============================
  // 📤 UPLOAD + ANÁLISE
  // ============================
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setStatus("analisando...");

    const { error: uploadError } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(`arquivos/${file.name}`, file, { upsert: true });

    if (uploadError) {
      setStatus("falhou");
      setReport({
        tipo: "erro",
        status: "Erro no upload",
        descricao: uploadError.message,
      });
      return;
    }

    const publicUrl = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(`arquivos/${file.name}`).data.publicUrl;

    const isBim = /\.(ifc|bim|glb|gltf)$/i.test(file.name);
    const progressoFisico = Math.round(40 + Math.random() * 55);
    const compatibilidade = 70 + Math.random() * 25;

    // Simulação de análise
    const simulated = {
      tipo: isBim ? "bim" : "imagem",
      status: "Análise concluída ✅",
      descricao: isBim
        ? "Renderização IFC concluída com sucesso."
        : "Imagem analisada com IA — elementos identificados.",
      url: publicUrl,
      progresso_fisico: progressoFisico,
      comparacao: { taxa: compatibilidade },
      overlay: !isBim
        ? [
            {
              nome: "Pilar",
              cor: "#2563eb",
              box: { xMin: 120, yMin: 80, xMax: 200, yMax: 200 },
            },
            {
              nome: "Viga",
              cor: "#22c55e",
              box: { xMin: 250, yMin: 100, xMax: 350, yMax: 200 },
            },
          ]
        : [],
    };

    // Salvar no banco
    await supabase.from("analises").insert([
      {
        filename: file.name,
        url: publicUrl,
        tipo: simulated.tipo,
        username,
        progresso_fisico: simulated.progresso_fisico,
        taxa_compatibilidade: simulated.comparacao.taxa,
        detections: simulated.overlay,
        created_at: new Date().toISOString(),
      },
    ]);

    setReport(simulated);
    setStatus("concluída");
    setProgress(100);
  };

  // ============================
  // 🖼️ VISUALIZAÇÃO DE IMAGEM
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
      ctx.strokeStyle = det.cor || "#2563eb";
      ctx.lineWidth = 2;
      ctx.strokeRect(
        xMin * scale,
        yMin * scale,
        (xMax - xMin) * scale,
        (yMax - yMin) * scale
      );
      ctx.fillStyle = det.cor || "#2563eb";
      ctx.font = "12px Arial";
      ctx.fillText(det.nome, xMin * scale + 5, yMin * scale - 5);
    });
  }, [report]);

  // ============================
  // 🧱 VISUALIZAÇÃO IFC (3D)
  // ============================
  useEffect(() => {
    if (!report?.url || report.tipo !== "bim") return;

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
        const fitDistance = size / (2 * Math.tan((Math.PI * camera.fov) / 360));

        controls.target.copy(center);
        camera.position.copy(
          center.clone().add(new Vector3(fitDistance, fitDistance, fitDistance))
        );
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
        console.error("❌ Erro ao renderizar IFC:", error);
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
    if (report.tipo === "erro") {
      return (
        <div className="report error">
          <FaExclamationTriangle /> {report.status}
          <p>{report.descricao}</p>
        </div>
      );
    }

    return (
      <div className="report success">
        <div className="tipo-arquivo">
          Tipo de arquivo: <strong>{report.tipo?.toUpperCase()}</strong>
        </div>
        <p><strong>Status:</strong> {report.status}</p>
        {report.descricao && <p><strong>Descrição:</strong> {report.descricao}</p>}

        {/* ⚠️ ALERTA DE INCONSISTÊNCIA */}
        {report.comparacao?.taxa < 75 && (
          <div className="alerta">
            ⚠️ Inconsistência detectada — compatibilidade baixa ({report.comparacao.taxa.toFixed(1)}%)
          </div>
        )}

        {/* 📊 BARRA DE PROGRESSO */}
        {report.progresso_fisico && (
          <div className="progress-section">
            <h4>📊 Progresso Físico Estimado</h4>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{
                  width: `${report.progresso_fisico}%`,
                  background:
                    report.progresso_fisico < 50
                      ? "#f59e0b"
                      : report.progresso_fisico < 80
                      ? "#3b82f6"
                      : "#22c55e",
                }}
              ></div>
            </div>
            <p className="progress-text">{report.progresso_fisico}% concluído</p>
          </div>
        )}

        {/* 3D IFC */}
        {report.tipo === "bim" && (
          <div className="overlay-preview">
            <h4>🧱 Visualização 3D do Modelo</h4>
            <div ref={viewerRef} className="ifc-viewer-container"></div>
          </div>
        )}

        {/* OVERLAY 2D */}
        {report.overlay && report.overlay.length > 0 && report.tipo !== "bim" && (
          <div className="overlay-preview">
            <h4>🔹 Visualização</h4>
            <canvas ref={canvasRef} width={600} height={400}></canvas>
          </div>
        )}
      </div>
    );
  };

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

      {/* SIDEBAR HISTÓRICO */}
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <h3>Histórico</h3>
        {historico.map((item, i) => (
          <div key={i} className="history-item" onClick={() => setReport(item)}>
            <p><strong>{item.filename}</strong></p>
            <small>{new Date(item.created_at).toLocaleString()}</small>
            <p>Avanço: {item.progresso_fisico}%</p>
            <p>Compat.: {item.taxa_compatibilidade?.toFixed(1)}%</p>
          </div>
        ))}
      </div>

      <div className="content">
        <div className="content-inner">
          <h2 className="welcome-text">Bem-vindo, {username}! 👷‍♂️</h2>
          <label htmlFor="file-upload" className="upload-area">
            <FaFileUpload className="upload-icon" />
            <p>Envie uma imagem ou modelo BIM para análise</p>
            <input
              id="file-upload"
              type="file"
              accept="image/*,.ifc,.bim,.obj,.glb,.gltf"
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
