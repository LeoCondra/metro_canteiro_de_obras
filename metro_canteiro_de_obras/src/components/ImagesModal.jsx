export default function ImagesModal({
  open,
  lastSnapshotImg,
  lastPhotoImg,
  onClose,
}) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal-content">
        <h3>Imagens usadas na última comparação</h3>

        <div className="compare-grid">
          <div className="compare-box">
            <p>Snapshot BIM</p>
            <img
              src={lastSnapshotImg}
              className="compare-img"
              alt="Snapshot BIM"
            />
          </div>

          <div className="compare-box">
            <p>Foto da obra</p>
            <img
              src={lastPhotoImg}
              className="compare-img"
              alt="Foto da obra"
            />
          </div>
        </div>

        <div className="modal-actions">
          <button onClick={onClose}>Fechar</button>
        </div>
      </div>
    </div>
  );
}
