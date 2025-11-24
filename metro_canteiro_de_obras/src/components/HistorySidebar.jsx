import { MdDelete } from "react-icons/md";

export default function HistorySidebar({
  open,
  historico,
  onSelectItem,
  onDeleteItem,
}) {
  return (
    <div className={`sidebar ${open ? "open" : ""}`}>
      <h3>Histórico</h3>

      {historico.map((h, i) => (
        <div
          key={i}
          className="history-item"
          onClick={() => onSelectItem(h)}
        >
          <div style={{ flex: 1 }}>
            <p>{h.nome}</p>
            <small>{h.data}</small>
          </div>

          <MdDelete
            style={{ cursor: "pointer", color: "#c00" }}
            onClick={(e) => {
              e.stopPropagation();
              onDeleteItem(h.nome);
            }}
          />
        </div>
      ))}
    </div>
  );
}
    