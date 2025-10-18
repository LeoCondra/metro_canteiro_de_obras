import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { FaUserCircle, FaFileUpload, FaFileAlt } from 'react-icons/fa'
import { MdNotStarted, MdAutorenew, MdCheckCircle } from 'react-icons/md'
import './TelaInicial.css'

function TelaInicial() {
  const [selectedFile, setSelectedFile] = useState(null)
  const [status, setStatus] = useState('não iniciada')

  // pega o usuário enviado pelo Login
  const location = useLocation()
  const username = location.state?.username || 'Usuário'

  const handleFileChange = (e) => {
    setSelectedFile(e.target.files[0])
    setStatus('em progresso')

    setTimeout(() => {
      setStatus('concluída')
    }, 2000)
  }

  const renderStatusIcon = () => {
    switch (status) {
      case 'não iniciada': return <MdNotStarted className="status-icon not-started" />
      case 'em progresso': return <MdAutorenew className="status-icon in-progress" />
      case 'concluída': return <MdCheckCircle className="status-icon done" />
      default: return null
    }
  }

  return (
    <div className="tela-container">
      {/* Top bar */}
      <div className="top-bar">
        <div className="status-container">
          {renderStatusIcon()}
          <span className="status-text">{status}</span>
        </div>
        <div className="user-section">
          <span className="username">{username}</span>
          <FaUserCircle className="user-icon" />
        </div>
      </div>

      {/* Conteúdo centralizado */}
      <div className="content">
        <div className="content-inner">
          <h2 className="welcome-text">Bem-vindo, {username}! 👋</h2>

          <label htmlFor="file-upload" className="upload-area">
            <FaFileUpload className="upload-icon" />
            <p>Clique ou arraste um arquivo aqui</p>
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
    </div>
  )
}

export default TelaInicial
