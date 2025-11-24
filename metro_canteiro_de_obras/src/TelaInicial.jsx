// === IMPORTS ===
import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { FaFileUpload } from "react-icons/fa";

import { supabase, BUCKET, ANALYZE_URL, SUPABASE_ANON_KEY } from "./Supabase";
import "./TelaInicial.css";

import TopBar from "./components/TopBar";
import HistorySidebar from "./components/HistorySidebar";
import IFCPanel from "./components/IFCPanel";
import CompareModal from "./components/CompareModal";
import ImagesModal from "./components/ImagesModal";
import PainelProgresso from "./components/PainelProgresso";
import RelatorioComparacao from "./components/RelatorioComparacao";

import { dataURLtoFile, getTipo } from "./utils/fileUtils";

export default function TelaInicial() {
  const [status, setStatus] = useState("não iniciada");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [historico, setHistorico] = useState([]);
  const [viewingHistoryItem, setViewingHistoryItem] = useState(null);

  const [bimEntry, setBimEntry] = useState(null);
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

  const [lastSnapshotImg, setLastSnapshotImg] = useState(null);
  const [lastPhotoImg, setLastPhotoImg] = useState(null);

  const [showImagesModal, setShowImagesModal] = useState(false);

  const location = useLocation();
  const username = location.state?.username || "Usuário";

  // === HISTÓRICO (SUPABASE) ===
  async function handleDeleteFile(nome) {
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .remove([`arquivos/${username}/${nome}`]);

      if (error) throw error;

      setHistorico((prev) => prev.filter((item) => item.nome !== nome));
    } catch (err) {
      console.error(err);
      alert("Erro ao deletar arquivo");
    }
  }

  async function carregarHistorico() {
    const { data } = await supabase.storage
      .from(BUCKET)
      .list(`arquivos/${username}`, { limit: 100 });

    if (!data) return;

    const list = data.map((f) => {
      const { data: url } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(`arquivos/${username}/${f.name}`);

      return {
        nome: f.name,
        url: url.publicUrl,
        tipo: getTipo(f.name),
        data: new Date(f.updated_at || f.created_at).toLocaleString(),
      };
    });

    setHistorico(list);
  }

  useEffect(() => {
    carregarHistorico();
  }, []);

  // === UPLOAD IFC ===
  const handleBimChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setStatus("processando");
    setProgressMsg("Carregando IFC...");
    setProgressPct(0);

    try {
      const fname = `${Date.now()}-${file.name}`;

      await supabase.storage.from(BUCKET).upload(
        `arquivos/${username}/${fname}`,
        file
      );

      const { data: url } = supabase.storage
        .from(BUCKET)
        .getPublicUrl(`arquivos/${username}/${fname}`);

      setBimEntry({ nome: fname, url: url.publicUrl });
      setViewingHistoryItem(null); 
      setSnapshotImg(null);
      setStatus("concluída");

      setTimeout(carregarHistorico, 600);
    } catch {
      setStatus("falhou");
      alert("Erro no upload do IFC");
    }
  };

  // === ENVIAR COMPARAÇÃO ==
  const enviarComparacaoModal = async () => {
    if (!snapshotImg) return alert("Capture primeiro");
    if (!modalPhotoFile) return alert("Selecione uma foto");

    setStatus("processando");
    setModalProgressPct(40);

    const snap = dataURLtoFile(snapshotImg, "snapshot.png");

    const prev = progressoObra.length
      ? progressoObra[progressoObra.length - 1].porcentagem
      : 0;

    const fd = new FormData();
    fd.append("fileA", snap);
    fd.append("fileB", modalPhotoFile);
    fd.append("prevProgress", String(prev));
    fd.append("username", username);

    try {
      const r = await fetch(ANALYZE_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        body: fd,
      });

      const out = await r.json();
      if (out.status !== "ok") throw new Error(out.message);

      const prog = parseFloat(out.progresso_global ?? 0);

      
      setLastSnapshotImg(snapshotImg);

      if (modalPhotoPreview) {
        setLastPhotoImg(modalPhotoPreview);
      } else if (modalPhotoFile) {
        setLastPhotoImg(URL.createObjectURL(modalPhotoFile));
      }

      setResultTextBox(
        `Progresso: ${(isNaN(prog) ? 0 : prog).toFixed(1)}%\n${
          out.textoFaltas || ""
        }`
      );

      setProgressoObra((prevArr) => [
        ...prevArr,
        {
          porcentagem: prog,
          data: new Date().toLocaleString(),
        },
      ]);

      setReport(out);
      setAlertas(out.alertas || []);
      setModalProgressPct(100);
      setStatus("concluída");
    } catch (err) {
      console.error(err);
      alert("Erro ao comparar imagens");
      setStatus("falhou");
    } finally {
      setTimeout(() => {
        setShowCompareModal(false);
        setModalPhotoFile(null);
        setModalPhotoPreview(null);
        setModalProgressPct(0);
      }, 600);
    }
  };

  return (
    <div className="tela-container">
      {/* TOP BAR */}
      <TopBar
        status={status}
        username={username}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
        onClearHistorySelection={() => setViewingHistoryItem(null)}
      />

      {/* SIDEBAR */}
      <HistorySidebar
        open={sidebarOpen}
        historico={historico}
        onSelectItem={(h) => {
          setViewingHistoryItem(h);
          if (h.tipo === "modelo") {
            setBimEntry(h);
            setProgressMsg("Carregando IFC...");
            setProgressPct(0);
          }
          setSnapshotImg(null);
        }}
        onDeleteItem={handleDeleteFile}
      />

      {/* CONTEÚDO CENTRAL */}
      <div className="content">
        <div className="content-inner">
          <label htmlFor="bim-upload" className="upload-area">
            <FaFileUpload className="upload-icon" />
            <p>Selecionar BIM (.ifc / .ifc.gz)</p>
          </label>

          <input
            id="bim-upload"
            type="file"
            accept=".ifc,.ifc.gz,.gz"
            style={{ display: "none" }}
            onChange={handleBimChange}
          />

          {/* IFC CARREGADO / PAINEL PRINCIPAL */}
          {bimEntry && (
            <IFCPanel
              bimEntry={bimEntry}
              viewingHistoryItem={viewingHistoryItem}
              progressMsg={progressMsg}
              progressPct={progressPct}
              setProgressMsg={setProgressMsg}
              setProgressPct={setProgressPct}
              resultTextBox={resultTextBox}
              onSnapshotCaptured={(dataUrl) => setSnapshotImg(dataUrl)}
              onOpenCompare={() => setShowCompareModal(true)}
              canViewLastImages={!!(lastSnapshotImg && lastPhotoImg)}
              onOpenImages={() => setShowImagesModal(true)}
            />
          )}

          <RelatorioComparacao report={report} />
          <PainelProgresso progressoObra={progressoObra} />
        </div>
      </div>

      {/* MODAL DE COMPARAÇÃO */}
      <CompareModal
        open={showCompareModal}
        snapshotImg={snapshotImg}
        modalPhotoFile={modalPhotoFile}
        modalPhotoPreview={modalPhotoPreview}
        modalProgressPct={modalProgressPct}
        onSelectPhoto={(file, previewUrl) => {
          setModalPhotoFile(file);
          setModalPhotoPreview(previewUrl);
        }}
        onConfirm={enviarComparacaoModal}
        onCancel={() => {
          setShowCompareModal(false);
          setModalPhotoFile(null);
          setModalPhotoPreview(null);
          setModalProgressPct(0);
        }}
      />

      {/* MODAL NOVO – VER IMAGENS USADAS */}
      <ImagesModal
        open={showImagesModal && !!lastSnapshotImg && !!lastPhotoImg}
        lastSnapshotImg={lastSnapshotImg}
        lastPhotoImg={lastPhotoImg}
        onClose={() => setShowImagesModal(false)}
      />
    </div>
  );
}
