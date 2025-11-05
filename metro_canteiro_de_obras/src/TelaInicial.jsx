import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { FaUserCircle, FaFileUpload, FaFileAlt, FaExclamationTriangle } from "react-icons/fa";
import { MdNotStarted, MdAutorenew, MdCheckCircle, MdCancel, MdMenu, MdClose, MdHistory, MdArrowBack } from "react-icons/md";

import {
  Scene, PerspectiveCamera, WebGLRenderer, Color,
  AmbientLight, DirectionalLight, Box3, Vector3
} from "three";
import { IFCLoader } from "web-ifc-three/IFCLoader";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";

import pako from "pako";
import { Line } from "react-chartjs-2";
import { Chart as ChartJS } from "chart.js/auto";

import "./TelaInicial.css";
import { supabase, BUCKET, NODE_RENDER_URL, ANALYZE_URL } from "./Supabase.js";

const SIZE_LIMIT_MB = 8;

function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("não iniciada");
  const [report, setReport] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState(null);

  const [progressMsg, setProgressMsg] = useState("Aguardando arquivo...");
  const [progressPct, setProgressPct] = useState(0);

  const [progressoObra, setProgressoObra] = useState([]);
  const [alertas, setAlertas] = useState([]);

  const viewerRef = useRef(null);
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  const atualizarHUD = (msg, pct = null) => {
    setProgressMsg(msg);
    if (pct !== null) setProgressPct(pct);
  };

  const simularProgresso = () => {
    const total = Math.floor(Math.random() * 200) + 80;
    const instalados = Math.floor(total * (Math.random() * 0.6 + 0.3));
    const porcentagem = ((instalados / total) * 100).toFixed(1);

    const alertaTemp = [];
    if (porcentagem < 45) alertaTemp.push("Execução abaixo do esperado");
    if (Math.random() > 0.8) alertaTemp.push("Possível desvio estrutural detectado");

    setProgressoObra(prev => [...prev, {
      total, instalados, porcentagem, data: new Date().toLocaleString()
    }]);
    setAlertas(alertaTemp);
  };

  const carregarHistorico = async () => {
    const { data } = await supabase.storage.from(BUCKET).list(`arquivos/${username}`, {
      limit: 100, sortBy: { column: "created_at", order: "desc" },
    });

    const items = data?.map((f) => {
      const { data: urlData } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(`arquivos/${username}/${f.name}`);
      const ext = f.name.split(".").pop().toLowerCase();
      const tipo = ["jpg","jpeg","png","gif","bmp","webp"].includes(ext)
        ? "imagem"
        : "modelo";
      return { nome: f.name, tipo, data: new Date(f.created_at).toLocaleString(), url: urlData.publicUrl };
    });

    setHistorico(items || []);
  };

  useEffect(() => {
    carregarHistorico();
  }, []);

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSelectedFile(file);
    setStatus("processando");

    const ext = file.name.split(".").pop().toLowerCase();
    const isImage = ["jpg","jpeg","png","bmp","gif","webp"].includes(ext);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("username", username);

    try {
      const endpoint = isImage ? ANALYZE_URL : NODE_RENDER_URL;
      const resp = await fetch(endpoint, { method: "POST", body: formData });
      const result = await resp.json();

      setReport(result);
      setStatus("concluída");
      setTimeout(carregarHistorico, 1000);
      simularProgresso();
    } catch (err) {
      setReport({ tipo:"erro", descricao:err.message });
      setStatus("falhou");
    }
  };

  async function fetchIFCBuffer(url) {
    const res = await fetch(url);
    const total = +res.headers.get("content-length") || 0;
    const reader = res.body.getReader();

    let mem = new Uint8Array(Math.max(total, 3_000_000));
    let off = 0;

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      mem.set(value, off);
      off += value.length;
      const pct = Math.round((off / total) * 100);
      atualizarHUD(`Baixando IFC: ${pct}%`, pct);
    }
    return mem.slice(0, off).buffer;
  }

  useEffect(() => {
    const item = viewingHistoryItem || report;
    if (!item || item.tipo === "imagem" || !item.url) return;

    let cancel = false;
    const container = viewerRef.current;
    container.innerHTML = "";

    const scene = new Scene();
    scene.background = new Color("#0d1117");

    const camera = new PerspectiveCamera(60, container.clientWidth / 400, 0.1, 100000);
    camera.position.set(10,10,10);

    const renderer = new WebGLRenderer({ antialias:true });
    renderer.setSize(container.clientWidth, 400);
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    scene.add(new AmbientLight(1));
    const d = new DirectionalLight(0xffffff,1); d.position.set(5,5,5); scene.add(d);

    (async () => {
      const raw = await fetchIFCBuffer(`${item.url}?t=${Date.now()}`);
      const buf = item.url.endsWith(".gz") ? pako.ungzip(new Uint8Array(raw)).buffer : raw;

      const sizeMB = buf.byteLength / 1e6;
      atualizarHUD("Carregando modelo IFC");

      if (sizeMB > SIZE_LIMIT_MB) {
        atualizarHUD("Arquivo muito grande. Renderização sem worker ativada.");
      }

      const blobURL = URL.createObjectURL(new Blob([buf]));

      const loader = new IFCLoader();
      loader.ifcManager.setWasmPath("/");
      loader.ifcManager.useWebWorkers(false);

      loader.load(blobURL, (model) => {
        if (cancel) return;

        scene.add(model);
        const box = new Box3().setFromObject(model);
        const center = box.getCenter(new Vector3());
        const sizeBB = box.getSize(new Vector3()).length();
        const dist = sizeBB / (2 * Math.tan((Math.PI * camera.fov) / 360));

        controls.target.copy(center);
        camera.position.copy(center.clone().add(new Vector3(dist,dist,dist)));
        camera.lookAt(center);

        setProgressPct(100);
        atualizarHUD("Modelo carregado");

        const animate = () => {
          if (cancel) return;
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene, camera);
        };
        animate();
      });
    })();

    return () => { cancel = true; container.innerHTML = ""; renderer.dispose(); };
  }, [report, viewingHistoryItem]);

  const PainelProgresso = () => {
    if (!progressoObra.length) return null;
    const last = progressoObra.at(-1);

    return (
      <div style={{ marginTop:"20px", width:"100%" }}>
        <h3>Progresso da obra</h3>
        <p>Avanço: {last.porcentagem}%</p>
        <p>Elementos instalados: {last.instalados} / {last.total}</p>

        {alertas.length > 0 && (
          <div style={{ background:"#fff3cd", padding:"10px", borderRadius:"6px", marginTop:"8px", color:"#664d03" }}>
            {alertas.map((a,i)=> <div key={i}>{a}</div>)}
          </div>
        )}

        <div style={{ marginTop:"12px" }}>
          <Line
            data={{
              labels: progressoObra.map(p => p.data),
              datasets: [{
                label: "Progresso (%)",
                data: progressoObra.map(p => p.porcentagem),
                borderColor: "#2563eb",
                backgroundColor: "rgba(37,99,235,0.3)"
              }]
            }}
            height={120}
          />
        </div>
      </div>
    );
  };

  const renderPainelImagem = (item) => (
    <div className="report success">
      <button className="btn-voltar" onClick={()=>{setReport(null);setViewingHistoryItem(null);}}>
        <MdArrowBack/> Voltar
      </button>

      <div style={{ position:"relative", maxWidth:"520px", margin:"0 auto" }}>
        <img src={item.url} alt="preview" style={{ width:"100%", borderRadius:"8px" }} />

        <div style={{
          position:"absolute", top:"10px", right:"10px",
          background:"rgba(0,0,0,0.6)", padding:"8px", borderRadius:"8px",
          color:"#fff", fontSize:"13px"
        }}>
          {(item.detections || ["Concreto", "Aço", "Pilar"]).map((label, i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:"6px", marginBottom:"4px" }}>
              <input type="checkbox" defaultChecked />
              <span>{label.description || label}</span>
            </div>
          ))}
        </div>
      </div>

      <PainelProgresso />
    </div>
  );

  const renderPainelIFC = (item) => (
    <div className="report success">
      <button className="btn-voltar" onClick={()=>{setReport(null);setViewingHistoryItem(null);}}>
        <MdArrowBack/> Voltar
      </button>

      <p>Status: {item.status}</p>
      <div className="hud-line">{progressMsg}</div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{width:`${progressPct}%`}}></div>
      </div>

      <div style={{marginTop:"10px", border:"1px solid #003da5", borderRadius:"8px"}}>
        <div ref={viewerRef} className="ifc-viewer-container"></div>
      </div>

      <PainelProgresso />
    </div>
  );

  const item = viewingHistoryItem || report;

  return (
    <div className="tela-container">
      <div className="top-bar">
        <div className="status-container">
          {status==="não iniciada" && <MdNotStarted className="status-icon not-started" />}
          {status.includes("processando") && <MdAutorenew className="status-icon in-progress" />}
          {status==="concluída" && <MdCheckCircle className="status-icon done" />}
          {status==="falhou" && <MdCancel className="status-icon failed" />}
          <span className="status-text">{status}</span>
        </div>

        <div className="user-section">
          <button className="toggle-btn" onClick={()=>setSidebarOpen(!sidebarOpen)}>
            {sidebarOpen ? <MdClose/> : <MdMenu/>}
          </button>

          <MdHistory onClick={carregarHistorico}/>
          <span className="username">{username}</span>
          <FaUserCircle className="user-icon"/>
        </div>
      </div>

      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <h3>Histórico</h3>
        {historico.map((h,i)=>(
          <div key={i} className="history-item" onClick={()=>setViewingHistoryItem(h)}>
            <p>{h.nome}</p>
            <small>{h.data}</small>
          </div>
        ))}
      </div>

      <div className="content">
        <div className="content-inner">
          {!item ? (
            <>
              <h2 className="welcome-text">Bem-vindo, {username}</h2>
              <label htmlFor="file-upload" className="upload-area">
                <FaFileUpload className="upload-icon" />
                <p>Envie uma imagem ou modelo BIM</p>
                <input id="file-upload" type="file"
                  accept=".ifc,.gz,.glb,.gltf,.stl,.jpg,.jpeg,.png,.gif,.bmp,.webp"
                  onChange={handleFileChange} hidden />
              </label>
              {selectedFile && (
                <div className="file-display"><FaFileAlt className="file-icon" />{selectedFile.name}</div>
              )}
            </>
          ) : item.tipo==="imagem" ? renderPainelImagem(item) : renderPainelIFC(item)}
        </div>
      </div>
    </div>
  );
}

export default TelaInicial;
