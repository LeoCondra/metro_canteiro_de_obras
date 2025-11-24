import { FaUserCircle } from "react-icons/fa";
import {
  MdNotStarted,
  MdAutorenew,
  MdCheckCircle,
  MdCancel,
  MdMenu,
  MdClose,
  MdHistory,
} from "react-icons/md";

export default function TopBar({
  status,
  username,
  sidebarOpen,
  onToggleSidebar,
  onClearHistorySelection,
}) {
  return (
    <div className="top-bar">
      <div className="status-container">
        {status === "não iniciada" && (
          <MdNotStarted className="status-icon not-started" />
        )}
        {status === "processando" && (
          <MdAutorenew className="status-icon in-progress" />
        )}
        {status === "concluída" && (
          <MdCheckCircle className="status-icon done" />
        )}
        {status === "falhou" && <MdCancel className="status-icon failed" />}
        <span className="status-text">{status}</span>
      </div>

      <div className="user-section">
        <button className="toggle-btn" onClick={onToggleSidebar}>
          {sidebarOpen ? <MdClose /> : <MdMenu />}
        </button>

        <MdHistory
          className="history-icon"
          onClick={onClearHistorySelection}
        />
        <span className="username">{username}</span>
        <FaUserCircle className="user-icon" />
      </div>
    </div>
  );
}
