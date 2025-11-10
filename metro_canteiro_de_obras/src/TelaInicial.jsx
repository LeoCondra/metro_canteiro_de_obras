// TelaInicial.jsx — Snapshot BIM × Foto (progresso físico) + caixa de texto do resultado
import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { FaUserCircle, FaFileUpload, FaFileAlt } from "react-icons/fa";
import {
  MdNotStarted, MdAutorenew, MdCheckCircle, MdCancel,
  MdMenu, MdClose, MdHistory, MdDelete
} from "react-icons/md";

import {
  Scene, PerspectiveCamera, WebGLRenderer, Color,
  AmbientLight, DirectionalLight, Box3, Vector3
} from "three";

import { IFCLoader } from "web-ifc-three/IFCLoader";
import pako from "pako";

import {
  Chart as ChartJS, LineElement, CategoryScale, LinearScale, PointElement
} from "chart.js";
import { Line } from "react-chartjs-2";
ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement);

import { supabase, BUCKET, ANALYZE_URL } from "./Supabase";
import "./TelaInicial.css";

export default function TelaInicial() {
  const [status, setStatus] = useState("não iniciada");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState(null);

  const [bimEntry, setBimEntry] = useState(null);
  const [fotoEntry, setFotoEntry] = useState(null);

  const [report, setReport] = useState(null);

  const [snapshotImg, setSnapshotImg] = useState(null);
  const [progressMsg, setProgressMsg] = useState("Aguardando arquivo...");
  const [progressPct, setProgressPct] = useState(0);

  const [progressoObra, setProgressoObra] = useState([]);
  const [alertas, setAlertas] = useState([]);

  const [showCompareModal, setShowCompareModal] = useState(false);
  const [modalPhotoFile, setModalPhotoFile] = useState(null);
  const [modalPhotoPreview, setModalPhotoPreview] = useState(null);

  // ✅ caixa de texto (resultado) logo abaixo do botão "Comparar"
  const [resultTextBox, setResultTextBox] = useState("");

  const viewerRef = useRef(null);
  const rendererRef = useRef(null);
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  const getTipoArquivo = (f) => {
    const ext = f.split(".").pop().toLowerCase();
    return ["jpg","jpeg","png","webp"].includes(ext) ? "imagem" : "modelo";
  };

  // ---------- Histórico (Supabase Storage) ----------
  const carregarHistorico = async () => {
    const { data, error } = await supabase.storage.from(BUCKET).list(
      `arquivos/${username}`,
      { limit: 100, sortBy: { column: "updated_at", order: "desc" } }
    );
    if (error || !data) return;

    const arr = data.map(f => {
      const { data:url } = supabase.storage.from(BUCKET)
        .getPublicUrl(`arquivos/${username}/${f.name}`);
      const when = f.updated_at || f.created_at || new Date().toISOString();
      return {
        nome: f.name,
        url: url.publicUrl,
        tipo: getTipoArquivo(f.name),
        data: new Date(when).toLocaleString()
      };
    });
    setHistorico(arr);
  };
  useEffect(()=>{ carregarHistorico(); },[]);

  // ---------- Upload helper ----------
  async function uploadToSupabase(file){
    const fname = `${Date.now()}-${file.name}`;
    const path = `arquivos/${username}/${fname}`;
    const up = await supabase.storage.from(BUCKET).upload(path, file);
    if (up.error) throw up.error;
    const { data:urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { nome: fname, url: urlData.publicUrl, tipo: getTipoArquivo(fname), data: new Date().toLocaleString() };
  }

  // ---------- Entradas de arquivo ----------
  const handleBimChange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    setStatus("processando");
    try{
      const entry = await uploadToSupabase(file);
      setBimEntry(entry);
      setViewingHistoryItem(null);
      setStatus("concluída");
      setTimeout(carregarHistorico, 400);
    } catch {
      setStatus("falhou");
    }
  };

  const handleFotoChange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    setStatus("processando");
    try{
      const entry = await uploadToSupabase(file);
      setFotoEntry(entry);
      setViewingHistoryItem(null);
      setStatus("concluída");
      setTimeout(carregarHistorico, 400);
    } catch {
      setStatus("falhou");
    }
  };

  const handleDeleteFile = async(nome) => {
    await supabase.storage.from(BUCKET).remove([`arquivos/${username}/${nome}`]);
    carregarHistorico();
    setViewingHistoryItem(null);
    if (bimEntry?.nome === nome) setBimEntry(null);
    if (fotoEntry?.nome === nome) setFotoEntry(null);
  };

  // ---------- Helpers ----------
  async function ensureBlobAsFileFromEntry(entry, fallbackName){
    const blob = await fetch(entry.url).then(r=>r.blob());
    return new File([blob], entry.nome || fallbackName, { type: blob.type || "application/octet-stream" });
  }

  function dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new File([u8], filename, { type: mime });
  }

  // ---------- Backend: comparação via modal (snapshot + foto) ----------
  const enviarComparacaoModal = async () => {
    if (!snapshotImg) { alert("Gere a snapshot do BIM antes."); return; }
    if (!modalPhotoFile) { alert("Anexe uma foto para comparar."); return; }

    setStatus("processando");
    setReport(null);
    setResultTextBox(""); // limpa caixa

    const snapshotFile = dataURLtoFile(snapshotImg, "snapshot-bim.png");

    const fd = new FormData();
    fd.append("compare", "true");
    fd.append("fileA", snapshotFile, snapshotFile.name);     // snapshot BIM
    fd.append("fileB", modalPhotoFile, modalPhotoFile.name); // foto real
    fd.append("username", username);

    try{
      const r = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU"}` },
        body: fd,
      });

      const out = await r.json();
      if (!r.ok || out.status !== "ok") throw new Error(out.message || `Falha (${r.status})`);

      setReport(out);
      setResultTextBox(`Progresso: ${Number(out.progresso ?? 0).toFixed(1)}%\n${out.textoFaltas || ""}`);

      if (typeof out.progresso === "number") {
        setProgressoObra(p => [...p, { porcentagem: out.progresso, data: new Date().toLocaleString() }]);
      }
      setAlertas(out.alertas || []);
      setStatus("concluída");
    } catch (e) {
      console.error(e);
      setStatus("falhou");
      alert(e.message || "Falha ao comparar.");
    } finally {
      setShowCompareModal(false);
      setModalPhotoFile(null);
      setModalPhotoPreview(null);
    }
  };

  // ---------- Download progress do IFC ----------
  async function fetchIFCBuffer(url){
    const res = await fetch(url);
    const total = Number(res.headers.get("content-length") || 0);
    const reader = res.body?.getReader();
    if (!reader) {
      const arr = new Uint8Array(await res.arrayBuffer());
      setProgressMsg("Baixando IFC: 100%");
      setProgressPct(100);
      return arr.buffer;
    }

    let mem = new Uint8Array(Math.max(total, 3_000_000));
    let off=0;

    while(true){
      const {value,done} = await reader.read();
      if(done) break;
      if (off + value.length > mem.length) {
        const grown = new Uint8Array((mem.length * 3) >> 1);
        grown.set(mem);
        mem = grown;
      }
      mem.set(value,off);
      off+=value.length;

      if (total > 0) {
        const pct = Math.min(100, Math.round((off / total) * 100));
        setProgressMsg(`Baixando IFC: ${pct}%`);
        setProgressPct(pct);
      } else {
        const approx = Math.min(99, Math.floor(off / 1_000_000));
        setProgressMsg("Baixando IFC…");
        setProgressPct(approx);
      }
    }

    if (total === 0) {
      setProgressMsg("Baixando IFC: 100%");
      setProgressPct(100);
    }
    return mem.slice(0,off).buffer;
  }

  // ---------- Viewer 3D ----------
  useEffect(()=>{
    let disposed = false;

    (async()=>{
      const file = viewingHistoryItem?.tipo==="modelo" ? viewingHistoryItem : bimEntry;
      if(!file?.url) return;
      if(!["ifc","gz"].includes(file.nome.split(".").pop())) return;

      const container = viewerRef.current;
      if (!container) return;
      container.innerHTML="";

      const scene = new Scene();
      scene.background = new Color("#0d1117");

      const camera = new PerspectiveCamera(60, container.clientWidth/400, 0.1, 1_000_000);

      const renderer = new WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true
      });
      rendererRef.current = renderer;
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth, 400);
      container.appendChild(renderer.domElement);

      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const controls = new OrbitControls(camera,renderer.domElement);

      scene.add(new AmbientLight(1));
      const light=new DirectionalLight(0xffffff,1);
      light.position.set(10,10,10);
      scene.add(light);

      const raw = await fetchIFCBuffer(`${file.url}?t=${Date.now()}`);
      const isGz = /\.gz($|\?)/i.test(file.url);
      const buf = isGz ? pako.ungzip(new Uint8Array(raw)).buffer : raw;
      const blobURL = URL.createObjectURL(new Blob([buf]));

      const loader=new IFCLoader();
      // ✅ aponta WASM para CDN — não mexe no backend
      loader.ifcManager.setWasmPath("/");

      loader.load(blobURL,(model)=>{
        if (disposed) return;
        scene.add(model);
        const box=new Box3().setFromObject(model);
        const center=box.getCenter(new Vector3());
        const size=box.getSize(new Vector3()).length();
        const dist=size/(2*Math.tan((Math.PI*camera.fov)/360));

        controls.target.copy(center);
        camera.position.copy(center.clone().add(new Vector3(dist,dist,dist)));
        camera.lookAt(center);

        setProgressMsg("Modelo carregado");
        setProgressPct(100);

        const animate=()=>{
          if (disposed) return;
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene,camera);
        };
        animate();
      });

      const handleResize = () => {
        const w = container.clientWidth;
        renderer.setSize(w, 400);
        camera.aspect = w / 400;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", handleResize);

      return () => {
        disposed = true;
        window.removeEventListener("resize", handleResize);
        try { renderer.dispose(); } catch {}
        if (renderer.domElement?.parentNode) {
          renderer.domElement.parentNode.removeChild(renderer.domElement);
        }
      };
    })();

  },[bimEntry?.url, viewingHistoryItem?.url]);

  // ---------- Painel Progresso ----------
  const PainelProgresso = () => {
    if (!progressoObra.length) return null;
    const data = {
      labels: progressoObra.map(p=>p.data),
      datasets: [{
        label:"Avanço (%)",
        data: progressoObra.map(p=>Number(p.porcentagem)),
        borderColor:"#2563eb",
        backgroundColor:"rgba(37,99,235,0.25)",
        tension:0.3
      }]
    };
    return (
      <div style={{marginTop:20}}>
        <h3>Progresso da obra</h3>
        <div style={{height:"200px"}}>
          <Line data={data} options={{maintainAspectRatio:false}}/>
        </div>
        {alertas.map((a,i)=><p key={i} style={{color:"#c00"}}>{a}</p>)}
      </div>
    );
  };

  // ---------- Relatório (tabela detalhada) ----------
  const RelatorioComparacao = () => {
    if (!report) return null;
    const { progresso, textoFaltas, detalhePorClasse = {} } = report;
    const linhas = Object.entries(detalhePorClasse).map(([cls, det]) => ({
      cls,
      esperado: det.esperado ?? 0,
      detectado: det.detectado ?? 0,
      atendido: det.atendido ?? 0,
      faltando: det.faltando ?? 0
    }));
    return (
      <div className="report success" style={{marginTop:20}}>
        <h3>Relatório Snapshot × Foto</h3>
        <p><strong>Progresso estimado:</strong> {Number(progresso ?? 0).toFixed(1)}%</p>
        <p><strong>Resumo:</strong> {textoFaltas}</p>
        <div style={{overflowX:"auto", marginTop:10}}>
          <table className="relatorio-tabela">
            <thead>
              <tr>
                <th>Classe</th>
                <th>Esperado</th>
                <th>Detectado</th>
                <th>Atendido</th>
                <th>Faltando</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l,i)=>(
                <tr key={i}>
                  <td>{l.cls}</td>
                  <td>{l.esperado}</td>
                  <td>{l.detectado}</td>
                  <td>{l.atendido}</td>
                  <td>{l.faltando}</td>
                </tr>
              ))}
              {!linhas.length && (
                <tr><td colSpan={5} style={{textAlign:"center"}}>Sem classes detectadas no snapshot.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  // ---------- Render ----------
  return (
<div className="tela-container">

  <div className="top-bar">
    <div className="status-container">
      {status==="não iniciada" && <MdNotStarted className="status-icon not-started"/>}
      {status==="processando" && <MdAutorenew className="status-icon in-progress"/>}
      {status==="concluída" && <MdCheckCircle className="status-icon done"/>}
      {status==="falhou" && <MdCancel className="status-icon failed"/>}
      <span className="status-text">{status}</span>
    </div>

    <div className="user-section">
      <button className="toggle-btn" onClick={()=>setSidebarOpen(!sidebarOpen)}>
        {sidebarOpen ? <MdClose/> : <MdMenu/>}
      </button>
      <MdHistory className="history-icon" onClick={()=>{setViewingHistoryItem(null);}}/>
      <span className="username">{username}</span>
      <FaUserCircle className="user-icon"/>
    </div>
  </div>

  <div className={`sidebar ${sidebarOpen?"open":""}`}>
    <h3>Histórico</h3>
    {historico.map((h,i)=>(
      <div key={i} className="history-item"
        onClick={()=>{
          setViewingHistoryItem(h);
          if (h.tipo === "modelo") setBimEntry(h);
          if (h.tipo === "imagem") setFotoEntry(h);
          setSnapshotImg(null);
        }}>
        <div style={{flex:1}}>
          <p>{h.nome}</p>
          <small>{h.data}</small>
        </div>
        <MdDelete style={{cursor:"pointer",color:"#c00"}}
          onClick={(e)=>{e.stopPropagation();handleDeleteFile(h.nome);}}/>
      </div>
    ))}
  </div>

  <div className="content">
    <div className="content-inner">

      <div className="uploader-grid">
        <label htmlFor="bim-upload" className="upload-area">
          <FaFileUpload className="upload-icon"/>
          <p>Selecionar BIM (.ifc ou .ifc.gz)</p>
          <input id="bim-upload" type="file" accept=".ifc,.gz" onChange={e=>handleBimChange(e)} hidden/>
        </label>

        <label htmlFor="foto-upload" className="upload-area">
          <FaFileUpload className="upload-icon"/>
          <p>Selecionar Foto (.jpg/.png/.webp)</p>
          <input id="foto-upload" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={e=>handleFotoChange(e)} hidden/>
        </label>
      </div>

      <div className="file-chips">
        {bimEntry && (<div className="file-display"><FaFileAlt/> {bimEntry.nome}</div>)}
        {fotoEntry && (<div className="file-display"><FaFileAlt/> {fotoEntry.nome}</div>)}
      </div>

      {bimEntry && (
        <div className="report success" style={{position:"relative", marginTop:16}}>
          <div className="hud-line">{progressMsg}</div>
          <div className="progress-bar">
            <div style={{width:`${progressPct}%`,background:"#2563eb",height:"100%"}}/>
          </div>

          <div ref={viewerRef} className="ifc-viewer-container"/>

          <button
            onClick={()=>{
              const canvas = rendererRef.current?.domElement;
              if (!canvas) return;
              const dataUrl = canvas.toDataURL("image/png");
              setSnapshotImg(dataUrl);           // gera snapshot do BIM
              setShowCompareModal(true);         // abre popup para anexar a foto
            }}
            className="capture-btn"
            disabled={!rendererRef.current?.domElement}
          >
            Comparar
          </button>

          {/* ✅ Caixa de texto do resultado imediatamente abaixo do botão */}
          <div style={{marginTop:12}}>
            <label style={{display:"block", fontWeight:600, marginBottom:6}}>
              Resultado (texto):
            </label>
            <textarea
              value={resultTextBox}
              readOnly
              placeholder="O resultado da comparação aparecerá aqui..."
              style={{
                width:"100%", minHeight:90, resize:"vertical",
                padding:10, borderRadius:8, border:"1px solid #334",
                background:"#0b1220", color:"#eaeffd"
              }}
            />
          </div>
        </div>
      )}

      {fotoEntry && fotoEntry.tipo==="imagem" && (
        <div className="report success" style={{marginTop:16}}>
          <img src={fotoEntry.url} style={{width:"100%",borderRadius:8}} alt="Foto selecionada"/>
        </div>
      )}

      <RelatorioComparacao/>
      <PainelProgresso/>

    </div>
  </div>

  {showCompareModal && (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h3>Comparar Snapshot × Foto</h3>

        <div className="compare-grid">
          <div className="compare-box">
            <p>Snapshot atual do BIM</p>
            {snapshotImg ? (
              <img src={snapshotImg} className="compare-img" alt="snapshot"/>
            ) : <div className="compare-placeholder"/>}
          </div>

          <div className="compare-box">
            <p>Anexar foto real</p>

            <label htmlFor="modal-photo-upload" className="upload-area" style={{minHeight: 120}}>
              <FaFileUpload className="upload-icon"/>
              <span>Escolher foto (.jpg/.png/.webp)</span>
              <input
                id="modal-photo-upload"
                type="file"
                accept=".jpg,.jpeg,.png,.webp"
                hidden
                onChange={(e)=>{
                  const f = e.target.files?.[0];
                  if (!f) return;
                  setModalPhotoFile(f);
                  const url = URL.createObjectURL(f);
                  setModalPhotoPreview(url);
                }}
              />
            </label>

            {modalPhotoPreview && (
              <div style={{marginTop:10}}>
                <small>Selecionada:</small>
                <img src={modalPhotoPreview} className="compare-img" alt="foto selecionada"/>
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button
            disabled={!modalPhotoFile}
            onClick={enviarComparacaoModal}
          >
            Confirmar comparação
          </button>
          <button
            onClick={()=>{
              setShowCompareModal(false);
              setModalPhotoFile(null);
              setModalPhotoPreview(null);
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )}

</div>
  );
}
