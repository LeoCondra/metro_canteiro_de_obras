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

import { IFCLoader } from "web-ifc-three";
import pako from "pako";

import {
  Chart as ChartJS, LineElement, CategoryScale, LinearScale, PointElement
} from "chart.js";
import { Line } from "react-chartjs-2";
ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement);

import { supabase, BUCKET, ANALYZE_URL } from "./Supabase";
import "./TelaInicial.css";

export default function TelaInicial() {

  const [selectedFile, setSelectedFile] = useState(null);
  const [status, setStatus] = useState("não iniciada");
  const [report, setReport] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState(null);

  const [snapshotImg, setSnapshotImg] = useState(null);

  const [progressMsg, setProgressMsg] = useState("Aguardando arquivo...");
  const [progressPct, setProgressPct] = useState(0);

  const [progressoObra, setProgressoObra] = useState([]);
  const [alertas, setAlertas] = useState([]);

  const [showCompareModal, setShowCompareModal] = useState(false);
  const [selectedCompare, setSelectedCompare] = useState(null);

  const viewerRef = useRef(null);
  const rendererRef = useRef(null);
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  const file = viewingHistoryItem || report;

  const getTipoArquivo = (f) => {
    const ext = f.split(".").pop().toLowerCase();
    return ["jpg","jpeg","png","webp"].includes(ext) ? "imagem" : "modelo";
  };

  const simularProgresso = () => {
    const total = Math.floor(Math.random()*200)+80;
    const instalados = Math.floor(total*(Math.random()*0.6+0.3));
    const pct = ((instalados/total)*100).toFixed(1);

    const a = [];
    if (pct < 45) a.push("Execução abaixo do esperado");
    if (Math.random()>0.8) a.push("Possível desvio estrutural detectado");

    setProgressoObra((p)=>[...p,{ porcentagem:pct, data:new Date().toLocaleString() }]);
    setAlertas(a);
  };

  const carregarHistorico = async () => {
    const { data } = await supabase.storage.from(BUCKET)
      .list(`arquivos/${username}`, { limit:100 });

    if (!data) return;

    const arr = data.map(f=>{
      const { data:url } = supabase.storage.from(BUCKET)
        .getPublicUrl(`arquivos/${username}/${f.name}`);

      return {
        nome:f.name,
        url:url.publicUrl,
        tipo:getTipoArquivo(f.name),
        data:new Date(f.created_at).toLocaleString()
      };
    });

    setHistorico(arr);
  };

  useEffect(()=>{ carregarHistorico(); },[]);

  const handleDeleteFile = async(nome) => {
    await supabase.storage.from(BUCKET).remove([`arquivos/${username}/${nome}`]);
    carregarHistorico();
    setViewingHistoryItem(null);
    setSelectedCompare(null);
  };

  const handleFileChange = async(e) => {
    const file = e.target.files[0];
    if(!file) return;

    setSelectedFile(file);
    setStatus("processando");

    const fname = `${Date.now()}-${file.name}`;
    const path = `arquivos/${username}/${fname}`;

    await supabase.storage.from(BUCKET).upload(path,file);

    const { data:urlData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = urlData.publicUrl;

    const form = new FormData();
    form.append("file",file);
    form.append("username",username);

    try{
      const r = await fetch(ANALYZE_URL,{method:"POST",body:form});
      const out = await r.json();
      out.url = publicUrl;
      out.nome = file.name;
      out.tipo = getTipoArquivo(file.name);
      setReport(out);
      simularProgresso();
      setStatus("concluída");
      setTimeout(carregarHistorico,500);
    } catch {
      setStatus("falhou");
    }
  };

  async function fetchIFCBuffer(url){
    const res = await fetch(url);
    const total = +res.headers.get("content-length")||0;
    const reader = res.body.getReader();
    let mem = new Uint8Array(Math.max(total,3_000_000));
    let off=0;

    while(true){
      const {value,done} = await reader.read();
      if(done) break;
      mem.set(value,off);
      off+=value.length;
      const pct = Math.round((off/total)*100);
      setProgressMsg(`Baixando IFC: ${pct}%`);
      setProgressPct(pct);
    }

    return mem.slice(0,off).buffer;
  }

  useEffect(()=>{

    (async()=>{
      if(!file?.url) return;
      if(!["ifc","gz"].includes(file.nome.split(".").pop())) return;

      const container = viewerRef.current;
      container.innerHTML="";

      const scene = new Scene();
      scene.background = new Color("#0d1117");

      const camera = new PerspectiveCamera(60, container.clientWidth/400, 0.1, 1000000);

      const renderer = new WebGLRenderer({
        antialias: true,
        preserveDrawingBuffer: true // ✅ snapshot fix
      });

      rendererRef.current = renderer;
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth,400);
      container.appendChild(renderer.domElement);

      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const controls = new OrbitControls(camera,renderer.domElement);

      scene.add(new AmbientLight(1));
      const light=new DirectionalLight(0xffffff,1);
      light.position.set(10,10,10);
      scene.add(light);

      const raw = await fetchIFCBuffer(`${file.url}?t=${Date.now()}`);
      const buf = file.url.endsWith(".gz") ? pako.ungzip(new Uint8Array(raw)).buffer : raw;
      const blobURL = URL.createObjectURL(new Blob([buf]));

      const loader=new IFCLoader();
      loader.ifcManager.setWasmPath("/");

      loader.load(blobURL,(model)=>{
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
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene,camera);
        };
        animate();
      });
    })();

  },[report,viewingHistoryItem]);

  const enviarComparacao = async (snap, refFile) => {
    const blobSnap = await (await fetch(snap)).blob();
    const blobRef = await fetch(refFile.url).then(r=>r.blob());

    const fd = new FormData();
    fd.append("compare","true");
    fd.append("fileA", blobSnap, "snapshot.png");
    fd.append("fileB", blobRef, refFile.nome);
    fd.append("username", username);

    await fetch(ANALYZE_URL,{method:"POST",body:fd});

    setShowCompareModal(false);
    setSelectedCompare(null);
  };

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
      <MdHistory className="history-icon" onClick={()=>{setReport(null);setViewingHistoryItem(null);}}/>
      <span className="username">{username}</span>
      <FaUserCircle className="user-icon"/>
    </div>
  </div>

  <div className={`sidebar ${sidebarOpen?"open":""}`}>
    <h3>Histórico</h3>
    {historico.map((h,i)=>(
      <div key={i} className="history-item"
        onClick={()=>{setViewingHistoryItem(h);setSnapshotImg(null);}}>
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

      {!file && (
        <>
          <h2>Portal BIM – Monitoramento</h2>
          <label htmlFor="file-upload" className="upload-area">
            <FaFileUpload className="upload-icon"/>
            <p>Enviar arquivo IFC ou Foto</p>
            <input id="file-upload"
              type="file"
              accept=".ifc,.gz,.jpg,.jpeg,.png,.webp"
              onChange={handleFileChange} hidden/>
          </label>

          {selectedFile && (
            <div className="file-display">
              <FaFileAlt/> {selectedFile.name}
            </div>
          )}

          <PainelProgresso/>
        </>
      )}

      {file && file.tipo==="imagem" && (
        <div className="report success">
          <img src={file.url} style={{width:"100%",borderRadius:8}}/>
          <PainelProgresso/>
        </div>
      )}

      {file && file.tipo==="modelo" && (
        <div className="report success" style={{position:"relative"}}>
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
              setSnapshotImg(dataUrl);
              setShowCompareModal(true);
            }}
            className="capture-btn"
          >
            Capturar visão BIM
          </button>

          <PainelProgresso/>
        </div>
      )}

    </div>
  </div>

  {showCompareModal && (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h3>Comparar snapshot com imagem</h3>

        <div className="compare-grid">
          <div className="compare-box">
            <p>Snapshot</p>
            {snapshotImg ? (
              <img src={snapshotImg} className="compare-img" alt="snapshot"/>
            ) : <div className="compare-placeholder"/>}
          </div>

          <div className="compare-box">
            <p>Histórico</p>
            <div className="compare-history-list">
              {historico.map((h,i)=>(
                <div key={i}
                  className={`compare-history-item ${selectedCompare?.nome===h.nome ? "selected":""}`}
                  onClick={()=>setSelectedCompare(h)}
                >
                  {h.nome}
                </div>
              ))}
            </div>
          </div>
        </div>

        {selectedCompare && (
          <div style={{marginTop:10}}>
            <p>Imagem escolhida</p>
            <img src={selectedCompare.url} className="compare-img"/>
          </div>
        )}

        <div className="modal-actions">
          <button
            disabled={!snapshotImg || !selectedCompare}
            onClick={()=>enviarComparacao(snapshotImg,selectedCompare)}
          >
            Comparar
          </button>
          <button onClick={()=>{setShowCompareModal(false);setSelectedCompare(null);}}>
            Fechar
          </button>
        </div>

      </div>
    </div>
  )}

</div>
  );
}
