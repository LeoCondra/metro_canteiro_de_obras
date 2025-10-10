import { useState } from 'react'
import { FaUserCircle, FaFileUpload, FaFileAlt } from 'react-icons/fa'
import { MdNotStarted, MdAutorenew, MdCheckCircle } from 'react-icons/md'
import './TelaInicial.css'

function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [status, setStatus] = useState('não iniciada') 
  const username = "João da Silva" // pode vir do backend

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0])
  }

  // ícones para o status
  const renderStatusIcon = () => {
    switch (status) {
      case 'não iniciada':
        return <MdNotStarted className="status-icon not-started" />
      case 'em progresso':
        return <MdAutorenew className="status-icon in-progress" />
      case 'concluída':
        return <MdCheckCircle className="status-icon done" />
      default:
        return null
    }
  }

  return (
    <div className="tela-container">
      {/* Top bar */}
      <div className="top-bar">
        <FaUserCircle className="user-icon" />
        <span className="username">{username}</span>
        <div className="status-container">
          {renderStatusIcon()}
          <span className="status-text">{status}</span>
        </div>
      </div>

      {/* Conteúdo principal */}
      <div className="content">
        <label htmlFor="file-upload" className="upload-area">
          <FaFileUpload className="upload-icon" />
          <p>Clique para enviar um arquivo</p>
          <input 
            id="file-upload"
            type="file" 
            onChange={handleFileChange} 
            hidden 
          />
        </label>

        {selectedFile && (
          <div className="file-display">
            <FaFileAlt className="file-icon" />
            <span>{selectedFile.name}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export default TelaInicial
