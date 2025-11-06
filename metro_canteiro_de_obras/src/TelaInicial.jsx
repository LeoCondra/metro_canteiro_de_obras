import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { FaUserCircle, FaFileUpload, FaFileAlt } from "react-icons/fa";
import { MdNotStarted, MdAutorenew, MdCheckCircle, MdCancel,
  MdMenu, MdClose, MdHistory, MdDelete } from "react-icons/md";

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
import { supabase, BUCKET, ANALYZE_URL } from "./Supabase.js";

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

  // comparação
  const [compareFiles, setCompareFiles] = useState([]);
  const [compareResult, setCompareResult] = useState(null);

  const getTipoArquivo = (filename) => {
    const ext = filename.split(".").pop().toLowerCase();
    return ["jpg","jpeg","png","gif","bmp","webp"].includes(ext)
      ? "imagem"
      : "modelo";
  };

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
    const { data } = await supabase.storage.from(BUCKET)
      .list(`arquivos/${username}`, {
        limit: 100,
        sortBy: { column: "created_at", order: "desc" }
      });

    const items = data?.map((f) => {
      const { data: urlData } = supabase.storage.from(BUCKET)
        .getPublicUrl(`arquivos/${username}/${f.name}`);
      return {
        nome: f.name,
        tipo: getTipoArquivo(f.name),
        data: new Date(f.created_at).toLocaleString(),
        url: urlData.publicUrl,
      };
    });

    setHistorico(items || []);
  };

  useEffect(() => { carregarHistorico(); }, []);

  const handleDeleteFile = async (nome) => {
    await supabase.storage.from(BUCKET)
      .remove([`arquivos/${username}/${nome}`]);

    setViewingHistoryItem(null);
    setReport(null);
    carregarHistorico();
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setStatus("processando");
    setSelectedFile(file);

    const filename = `${Date.now()}-${file.name}`;
    const storagePath = `arquivos/${username}/${filename}`;

    const { error: uploadErr } = await supabase.storage.from(BUCKET)
      .upload(storagePath, file, { upsert: true });

    if (uploadErr) {
      setStatus("falhou");
      setReport({ tipo:"erro", descricao: uploadErr.message });
      return;
    }

    const { data: urlData } = supabase.storage.from(BUCKET)
      .getPublicUrl(storagePath);
    const publicUrl = urlData.publicUrl;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("username", username);

    try {
      const resp = await fetch(ANALYZE_URL, { method: "POST", body: formData });
      const result = await resp.json();
      result.url = publicUrl;
      result.nome = file.name;
      result.tipo = getTipoArquivo(file.name);

      setReport(result);
      setStatus("concluída");
      simularProgresso();
      setTimeout(carregarHistorico, 800);

    } catch (err) {
      setReport({ tipo:"erro", descricao: err.message });
      setStatus("falhou");
    }
  };

  // fetch IFC
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

  // render IFC
  useEffect(() => {
    const item = viewingHistoryItem || report;
    if (!item || !item.url) return;

    const ext = item.nome?.split(".").pop().toLowerCase();
    if (!["ifc","gz"].includes(ext)) return;

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
    const d = new DirectionalLight(0xffffff,1);
    d.position.set(5,5,5);
    scene.add(d);

    (async () => {
      const raw = await fetchIFCBuffer(`${item.url}?t=${Date.now()}`);
      const buf = item.url.endsWith(".gz") ? pako.ungzip(new Uint8Array(raw)).buffer : raw;

      atualizarHUD("Carregando modelo IFC");

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

  // progresso timeline
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

  // comparar
  const compararArquivos = async () => {
    if (compareFiles.length !== 2) return;
    const [a,b] = compareFiles;

    try {
      setProgressMsg("🔍 IA analisando imagens e comparando estruturas...");
      setStatus("processando");

      const blobA = await fetch(a.url).then(r => r.blob());
      const blobB = await fetch(b.url).then(r => r.blob());

      const form = new FormData();
      form.append("compare", "true");
      form.append("fileA", blobA, a.nome);
      form.append("fileB", blobB, b.nome);
      form.append("username", username);

      const r = await fetch(ANALYZE_URL, { method:"POST", body:form });
      const out = await r.json();

      setCompareResult({
        files: [a.nome, b.nome],
        tipo: out.tipo ?? out.tipoComparacao,
        similaridade: out.similaridade,
        alertas: out.alertas || [],
        conclusao: (() => {
          if (out.alertas?.includes("execução pode não corresponder ao modelo"))
            return "⚠️ Execução possivelmente fora do planejado";
          if (out.alertas?.length > 0)
            return "Diferenças relevantes encontradas";
          return " Compatível com execução esperada";
        })()
      });

      setStatus("concluída");
      setProgressMsg("Comparação concluída");

    } catch {
      setCompareResult({
        files: [a.nome, b.nome],
        similaridade: "N/A",
        alertas: ["Erro no comparador"],
        conclusao: "Falha ao comparar"
      });
      setStatus("falhou");
      setProgressMsg("Erro na comparação");
    }
  };

  // auto trigger
  useEffect(() => {
    if (compareFiles.length === 2) compararArquivos();
  }, [compareFiles]);

  const renderPainelImagem = (item) => {
    const labels = item.detections || [];

    return (
      <div className="report success">
        <div style={{maxWidth:"600px",margin:"0 auto"}}>
          <img src={item.url} alt="preview"
            style={{width:"100%",borderRadius:"8px",display:"block"}} />
        </div>

        <div style={{textAlign:"left",marginTop:"1rem"}}>
          <h3>Resumo da análise</h3>
          <p><b>Tipo:</b> Imagem de obra</p>
          <h4 style={{marginTop:"0.7rem"}}>Elementos detectados</h4>

          {labels.length > 0 ? (
            <ul>{labels.map((l,i)=>( <li key={i}>{l}</li> ))}</ul>
          ) : <p>Nenhuma estrutura detectada</p>}
        </div>

        <PainelProgresso />
      </div>
    );
  };

  const renderPainelIFC = () => (
    <div className="report success">
      <div className="hud-line">{progressMsg}</div>
      <div className="progress-bar">
        <div className="progress-bar-fill" style={{width:`${progressPct}%`}}></div>
      </div>
      <div style={{marginTop:"10px",border:"1px solid #003da5",borderRadius:"8px"}}>
        <div ref={viewerRef} className="ifc-viewer-container"></div>
      </div>
      <PainelProgresso />
    </div>
  );

  const item = viewingHistoryItem || report || null;

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

          <MdHistory
            onClick={() => {
              if (viewingHistoryItem || report) {
                setReport(null);
                setViewingHistoryItem(null);
                setStatus("não iniciada");
              } else {
                carregarHistorico();
              }
            }}
            className="history-icon"
          />

          <span className="username">{username}</span>
          <FaUserCircle className="user-icon"/>
        </div>
      </div>

      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <h3>Histórico</h3>

        {historico.map((h,i)=>(
          <div key={i} className="history-item">
            <div
              style={{flex:1, cursor:"pointer"}}
              onClick={() => setViewingHistoryItem(h)}
              draggable
              onDragStart={(e)=>e.dataTransfer.setData("file",h.nome)}
            >
              <p>{h.nome}</p>
              <small>{h.data}</small>
            </div>

            <MdDelete
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteFile(h.nome);
              }}
              style={{cursor:"pointer", fontSize:"1.25rem", color:"#c00"}}
            />
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
                <input id="file-upload"
                  type="file"
                  accept=".ifc,.gz,.glb,.gltf,.stl,.jpg,.jpeg,.png,.gif,.bmp,.webp"
                  onChange={handleFileChange}
                  hidden
                />
              </label>

              {selectedFile && (
                <div className="file-display">
                  <FaFileAlt className="file-icon" />
                  {selectedFile.name}
                </div>
              )}

              {/* Drag & Drop de comparação */}
              <div
                style={{
                  marginTop: "15px",
                  padding: "15px",
                  border: "2px dashed #0a5ccf",
                  borderRadius: "10px",
                  background: "#eef6ff",
                  cursor: "grab",
                  textAlign: "center"
                }}
                onDragOver={(e)=>e.preventDefault()}
                onDrop={(e)=>{
                  const nome = e.dataTransfer.getData("file");
                  const item = historico.find(h => h.nome === nome);
                  if (item) {
                    setCompareFiles(prev => [...prev.slice(-1), item]);
                    setCompareResult(null);
                  }
                }}
              >
                <b>Arraste 2 arquivos do histórico aqui para comparar</b>
                <p style={{fontSize:"0.85rem",opacity:.7}}>
                  (Imagem ↔ Imagem ou IFC ↔ IFC)
                </p>

                <div style={{marginTop:"8px"}}>
                  {compareFiles.map((f,i)=>(
                    <div key={i} style={{
                      padding:"6px 10px",
                      background:"#fff",
                      margin:"4px auto",
                      borderRadius:"6px",
                      width:"90%",
                      fontSize:"0.9rem",
                      border:"1px solid #cce"
                    }}>
                      {f.nome}
                    </div>
                  ))}
                </div>
              </div>

              {compareResult && (
                <div style={{
                  marginTop:"12px",
                  padding:"15px",
                  background:"#f1fff1",
                  border:"1px solid #3aa93a",
                  borderRadius:"8px"
                }}>
                  <h4>Comparação</h4>
                  <p><b>Arquivos:</b> {compareResult.files.join(" vs ")}</p>
                  <p><b>Similaridade:</b> {compareResult.similaridade}</p>
                  {compareResult.alertas?.length > 0 && (
                    <ul>
                      {compareResult.alertas.map((a,i)=>(
                        <li key={i} style={{color:"#a00"}}>{a}</li>
                      ))}
                    </ul>
                  )}
                  <p><b>Conclusão:</b> {compareResult.conclusao}</p>
                </div>
              )}
            </>
          ) : item.tipo === "imagem"
            ? renderPainelImagem(item)
            : renderPainelIFC(item)}
        </div>
      </div>
    </div>
  );
}

export default TelaInicial;
