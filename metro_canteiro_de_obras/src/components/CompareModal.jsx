import { FaFileUpload } from "react-icons/fa";

export default function CompareModal({
  open,
  snapshotImg,
  modalPhotoFile,
  modalPhotoPreview,
  modalProgressPct,
  onSelectPhoto,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const previewUrl = URL.createObjectURL(f);
    onSelectPhoto(f, previewUrl);
  };

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h3>Comparar Snapshot × Foto</h3>

        <div className="progress-bar">
          <div
            style={{
              width: `${modalProgressPct}%`,
              background: "#00c853",
            }}
          />
        </div>

        <div className="compare-grid">
          <div className="compare-box">
            <p>Snapshot BIM</p>
            {snapshotImg && (
              <img src={snapshotImg} className="compare-img" alt="snapshot" />
            )}
          </div>

          <div className="compare-box">
            <p>Foto da Obra</p>

            <label
              htmlFor="modal-photo-upload"
              className="upload-area"
              style={{ minHeight: 120 }}
            >
              <FaFileUpload className="upload-icon" />
              <span>Escolher foto</span>
            </label>

            <input
              id="modal-photo-upload"
              type="file"
              accept=".jpg,.jpeg,.png,.webp"
              style={{ display: "none" }}
              onChange={handleFileChange}
            />

            {modalPhotoPreview && (
              <img src={modalPhotoPreview} className="compare-img" alt="foto" />
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button disabled={!modalPhotoFile} onClick={onConfirm}>
            Confirmar
          </button>

          <button onClick={onCancel}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
