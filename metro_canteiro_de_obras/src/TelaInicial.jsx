import { useState, useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { FaUserCircle, FaFileUpload, FaFileAlt } from "react-icons/fa";
import {
  MdNotStarted, MdAutorenew, MdCheckCircle, MdCancel,
  MdMenu, MdClose, MdHistory, MdDelete
} from "react-icons/md";

import {
  Scene, PerspectiveCamera, WebGLRenderer, Color,
  AmbientLight, DirectionalLight, Box3, Vector3, MeshStandardMaterial
} from "three";

import { IFCLoader } from "web-ifc-three/IFCLoader";
import pako from "pako";

import {
  Chart as ChartJS, LineElement, CategoryScale, LinearScale, PointElement
} from "chart.js";
import { Line } from "react-chartjs-2";
ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement);

import { supabase, BUCKET, ANALYZE_URL, SUPABASE_ANON_KEY } from "./Supabase";
import "./TelaInicial.css";

import sobel from "sobel";


// ✅ Converte WebGL → 2D → Sobel
function sobelEdge(webglCanvas) {
  try {
    const temp = document.createElement("canvas");
    temp.width = webglCanvas.width;
    temp.height = webglCanvas.height;
    const ctx = temp.getContext("2d");

    ctx.drawImage(webglCanvas, 0, 0);

    const imgData = ctx.getImageData(0, 0, temp.width, temp.height);
    const sobelData = sobel(imgData);

    const edgeCanvas = document.createElement("canvas");
    edgeCanvas.width = temp.width;
    edgeCanvas.height = temp.height;
    edgeCanvas.getContext("2d").putImageData(sobelData.toImageData(), 0, 0);

    return edgeCanvas;
  } catch (e) {
    console.error("Sobel edge failed:", e);
    alert("Falha ao gerar bordas do BIM");
    return null;
  }
}


export default function TelaInicial() {

  const [status, setStatus] = useState("não iniciada");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState(null);

  const [bimEntry, setBimEntry] = useState(null);
  const [fotoEntry] = useState(null);

  const [report, setReport] = useState(null);
  const [snapshotImg, setSnapshotImg] = useState(null);
  const [progressMsg, setProgressMsg] = useState("Aguardando arquivo...");
  const [progressPct, setProgressPct] = useState(0);

  const [progressoObra, setProgressoObra] = useState([]);
  const [alertas, setAlertas] = useState([]);

  const [showCompareModal, setShowCompareModal] = useState(false);
  const [modalPhotoFile, setModalPhotoFile] = useState(null);
  const [modalPhotoPreview, setModalPhotoPreview] = useState(null);
  const [modalProgressPct, setModalProgressPct] = useState(0);

  const [resultTextBox, setResultTextBox] = useState("");

  const viewerRef = useRef(null);
  const rendererRef = useRef(null);
  const location = useLocation();
  const username = location.state?.username || "Usuário";

  const getTipoArquivo = (f) => {
    const ext = f.split(".").pop().toLowerCase();
    return ["jpg","jpeg","png","webp"].includes(ext) ? "imagem" : "modelo";
  };

  const carregarHistorico = async () => {
    const { data } = await supabase.storage
      .from(BUCKET)
      .list(`arquivos/${username}`, { limit: 100, sortBy: { column: "updated_at", order: "desc" } });

    if (!data) return;

    const arr = data.map(f => {
      const { data:url } = supabase.storage.from(BUCKET)
        .getPublicUrl(`arquivos/${username}/${f.name}`);
      return {
        nome: f.name,
        url: url.publicUrl,
        tipo: getTipoArquivo(f.name),
        data: new Date(f.updated_at || f.created_at).toLocaleString()
      };
    });
    setHistorico(arr);
  };

  useEffect(()=>{ carregarHistorico(); },[]);

  async function uploadToSupabase(file){
    const fname = `${Date.now()}-${file.name}`;
    const path = `arquivos/${username}/${fname}`;
    await supabase.storage.from(BUCKET).upload(path, file);
    const { data:url } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return { nome: fname, url: url.publicUrl, tipo: getTipoArquivo(fname), data: new Date().toLocaleString() };
  }

  const handleBimChange = async (e) => {
    const file = e.target.files[0];
    if(!file) return;
    setStatus("processando");
    setProgressMsg("Carregando IFC...");
    try{
      const entry = await uploadToSupabase(file);
      setBimEntry(entry);
      setViewingHistoryItem(null);
      setStatus("concluída");
      setTimeout(carregarHistorico, 500);
    } catch {
      setStatus("falhou");
    }
  };

  const handleDeleteFile = async (nome) => {
    const ok = confirm(`Remover "${nome}" do histórico?`);
    if (!ok) return;

    try {
      await supabase.storage.from(BUCKET).remove([`arquivos/${username}/${nome}`]);
      if (bimEntry?.nome === nome) setBimEntry(null);
      await carregarHistorico();
    } catch {
      alert("Erro ao excluir arquivo");
    }
  };

  function dataURLtoFile(dataurl, filename) {
    const arr = dataurl.split(",");
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new File([u8], filename, { type: mime });
  }

  async function fetchIFCBuffer(url){
    const res = await fetch(url);
    const reader = res.body?.getReader();
    const total = Number(res.headers.get("content-length") || 0);

    if (!reader) return (await res.arrayBuffer());
    let mem = new Uint8Array(Math.max(total, 3000000));
    let off = 0;

    while(true){
      const {value,done} = await reader.read();
      if(done) break;
      mem.set(value,off);
      off+=value.length;
      const pct = total ? Math.round((off/total)*100) : Math.min(99, off/50000);
      setProgressPct(pct);
      setProgressMsg(`Carregando IFC: ${pct}%`);
    }
    setProgressPct(100);
    return mem.slice(0,off).buffer;
  }

  // ========== Renderiza IFC ==========
  useEffect(()=>{
    let disposed = false;
    (async()=>{
      const file = viewingHistoryItem?.tipo==="modelo" ? viewingHistoryItem : bimEntry;
      if (!file?.url) return;

      const ext = file.nome.split(".").pop().toLowerCase();
      if (!["ifc","gz","ifc.gz"].includes(ext)) return;

      const container = viewerRef.current;
      if (!container) return;
      container.innerHTML="";

      const scene = new Scene();
      scene.background = new Color("#ffffff");

      const camera = new PerspectiveCamera(60, container.clientWidth/400, 0.1, 9999999);
      const renderer = new WebGLRenderer({ antialias:true, preserveDrawingBuffer:true });
      rendererRef.current = renderer;
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setSize(container.clientWidth, 400);
      container.appendChild(renderer.domElement);

      const { OrbitControls } = await import("three/examples/jsm/controls/OrbitControls.js");
      const controls = new OrbitControls(camera,renderer.domElement);

      scene.add(new AmbientLight(1.2));
      const light = new DirectionalLight(0xffffff,1.2);
      light.position.set(10,10,10);
      scene.add(light);

      const raw = await fetchIFCBuffer(`${file.url}?t=${Date.now()}`);
      const buf = /\.gz$/i.test(file.nome) ? pako.ungzip(new Uint8Array(raw)).buffer : raw;
      const blobURL = URL.createObjectURL(new Blob([buf]));
      const loader=new IFCLoader();
      loader.ifcManager.setWasmPath("/");

      loader.load(blobURL,(model)=>{
        if (disposed) return;

        model.traverse(obj=>{
          if (obj.isMesh) {
            obj.material = new MeshStandardMaterial({
              color:"#d9d9d9",
              metalness:0.25,
              roughness:0.8
            });
          }
        });

        scene.add(model);
        const box = new Box3().setFromObject(model);
        const center = box.getCenter(new Vector3());
        const size = box.getSize(new Vector3()).length();
        const dist = size/(2*Math.tan((Math.PI*camera.fov)/360));
        controls.target.copy(center);
        camera.position.copy(center.clone().add(new Vector3(dist,dist,dist)));
        camera.lookAt(center);
        setProgressMsg("Modelo carregado");
        setProgressPct(100);

        function animate(){
          if (disposed) return;
          requestAnimationFrame(animate);
          controls.update();
          renderer.render(scene,camera);
        }
        animate();
      });

      return ()=>{ disposed=true; renderer.dispose(); };
    })();
  },[bimEntry?.url, viewingHistoryItem?.url]);

  // ✅ Gera sobel + abre modal
  const prepararSnapshot = () => {
    const canvas = rendererRef.current?.domElement;
    if (!canvas) return alert("Render não encontrado");

    const edgeCanvas = sobelEdge(canvas);
    if (!edgeCanvas) return;

    const snapshot = edgeCanvas.toDataURL();
    setSnapshotImg(snapshot);
    setShowCompareModal(true);
  };

  const enviarComparacaoModal = async () => {
    if (!snapshotImg) return alert("Gere snapshot primeiro");
    if (!modalPhotoFile) return alert("Anexe uma foto");

    setStatus("processando");
    setModalProgressPct(30);
    setReport(null);

    const snapshotFile = dataURLtoFile(snapshotImg, "snapshot-bim-edges.png");
    const fd = new FormData();
    fd.append("compare", "true");
    fd.append("fileA", snapshotFile);
    fd.append("fileB", modalPhotoFile);
    fd.append("username", username);

    try{
      const r = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: fd,
      });

      setModalProgressPct(70);
      const out = await r.json();
      if (!r.ok || out.status !== "ok") throw new Error(out.message);

      setReport(out);
      setModalProgressPct(100);
      setResultTextBox(`Progresso: ${Number(out.progresso).toFixed(1)}% \n${out.textoFaltas}`);

      setProgressoObra(p => [...p, {
        porcentagem: out.progresso,
        data: new Date().toLocaleString()
      }]);

      setAlertas(out.alertas || []);
      setStatus("concluída");

    } catch(e){
      setStatus("falhou");
      alert(e.message);
    } finally {
      setTimeout(()=>{
        setShowCompareModal(false);
        setModalPhotoFile(null);
        setModalPhotoPreview(null);
        setModalProgressPct(0);
      },900);
    }
  };

  const PainelProgresso = () => {
    if (!progressoObra.length) return null;
    const data = {
      labels: progressoObra.map(p=>p.data),
      datasets: [{
        label:"Avanço (%)",
        data: progressoObra.map(p=>p.porcentagem),
        borderColor:"#0050d6",
        backgroundColor:"rgba(0,80,214,.25)"
      }]
    };
    return (
      <div style={{marginTop:25}}>
        <h3>Histórico de Progresso</h3>
        <div style={{height:"200px"}}><Line data={data}/></div>
        {alertas.map((a,i)=><p key={i} style={{color:"red"}}>{a}</p>)}
      </div>
    );
  };

  const RelatorioComparacao = () => {
    if (!report) return null;
    const { progresso, textoFaltas, detalhePorClasse = {} } = report;
    const linhas = Object.entries(detalhePorClasse).map(([cls, det])=>({...det,cls}));
    const totalClasses = linhas.length;
    const totalEsperado = linhas.reduce((s,x)=>s+x.esperado,0);
    const totalDetectado = linhas.reduce((s,x)=>s+x.detectado,0);

    return (
      <div style={{marginTop:25}}>
        <h3>Resultado da comparação</h3>

        <div className="dashboard-cards">
          <div className="dash-card"><h4>Progresso</h4><p>{Number(progresso).toFixed(1)}%</p></div>
          <div className="dash-card"><h4>Classes</h4><p>{totalClasses}</p></div>
          <div className="dash-card"><h4>Esperado</h4><p>{totalEsperado}</p></div>
          <div className="dash-card"><h4>Detectado</h4><p>{totalDetectado}</p></div>
        </div>

        <div className="report success">
          <p><strong>Resumo:</strong> {textoFaltas}</p>

          <div style={{overflowX:"auto", marginTop:10}}>
            <table className="relatorio-tabela">
              <thead>
                <tr>
                  <th>Classe</th><th>Esperado</th><th>Detectado</th><th>Atendido</th><th>Faltando</th>
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
                  <tr><td colSpan={5}>Sem classes detectadas</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
<div className="tela-container">

  {/* Top Bar */}
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
      <MdHistory className="history-icon" onClick={()=>setViewingHistoryItem(null)}/>
      <span className="username">{username}</span>
      <FaUserCircle className="user-icon"/>
    </div>
  </div>

  {/* Sidebar */}
  <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
    <h3>Histórico</h3>
    {historico.map((h,i)=>(
      <div key={i} className="history-item"
        onClick={()=>{
          setViewingHistoryItem(h);
          if (h.tipo === "modelo") setBimEntry(h);
          setSnapshotImg(null);
        }}
      >
        <div style={{flex:1}}>
          <p>{h.nome}</p>
          <small>{h.data}</small>
        </div>

        <MdDelete
          style={{cursor:"pointer",color:"#c00"}}
          onClick={(e)=>{
            e.stopPropagation();
            handleDeleteFile(h.nome);
          }}
        />
      </div>
    ))}
  </div>

  {/* Content */}
  <div className="content">
    <div className="content-inner">

      <div className="uploader-grid">
        <label htmlFor="bim-upload" className="upload-area">
          <FaFileUpload className="upload-icon"/>
          <p>Selecionar BIM (.ifc / .ifc.gz)</p>
        </label>
        <input
          id="bim-upload"
          type="file"
          accept=".ifc,.ifc.gz,.gz"
          style={{ display: "none" }}
          onChange={handleBimChange}
        />
      </div>

      <div className="file-chips">
        {bimEntry && (<div className="file-display"><FaFileAlt/> {bimEntry.nome}</div>)}
      </div>

      {bimEntry && (
        <div className="report success" style={{marginTop:16}}>
          <div className="hud-line">{progressMsg}</div>
          <div className="progress-bar"><div style={{width:`${progressPct}%`}}/></div>

          <div ref={viewerRef} className="ifc-viewer-container"/>

          <button
            onClick={prepararSnapshot}
            className="capture-btn"
          >
            Comparar
          </button>

          <textarea
            value={resultTextBox}
            readOnly
            placeholder="Resultado..."
            style={{
              width:"100%", minHeight:90,
              marginTop:10, padding:10,
              borderRadius:8, background:"#fff", color:"#000",
              border:"1px solid #ccc"
            }}
          />
        </div>
      )}

      <RelatorioComparacao/>
      <PainelProgresso/>

    </div>
  </div>


  {/* MODAL */}
  {showCompareModal && (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h3>Comparar Snapshot × Foto</h3>

        <div className="progress-bar">
          <div style={{width:`${modalProgressPct}%`, background:"#00c853"}}/>
        </div>

        <div className="compare-grid">
          <div className="compare-box">
            <p>Snapshot BIM</p>
            {snapshotImg && <img src={snapshotImg} className="compare-img" alt="snapshot"/>}
          </div>

          <div className="compare-box">
            <p>Anexar foto</p>
            <label htmlFor="modal-photo-upload" className="upload-area" style={{minHeight:120}}>
              <FaFileUpload className="upload-icon"/>
              <span>Escolher foto</span>
            </label>

            <input
              id="modal-photo-upload"
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              style={{display:"none"}}
              onChange={(e)=>{
                const f = e.target.files?.[0];
                if (!f) return;
                setModalPhotoFile(f);
                setModalPhotoPreview(URL.createObjectURL(f));
              }}
            />

            {modalPhotoPreview && (
              <div style={{marginTop:10}}>
                <small>Selecionada:</small>
                <img src={modalPhotoPreview} className="compare-img" alt="foto"/>
              </div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button disabled={!modalPhotoFile} onClick={enviarComparacaoModal}>Confirmar</button>
          <button onClick={()=>{
            setShowCompareModal(false);
            setModalPhotoFile(null);
            setModalPhotoPreview(null);
            setModalProgressPct(0);
          }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )}

</div>
  );
}
