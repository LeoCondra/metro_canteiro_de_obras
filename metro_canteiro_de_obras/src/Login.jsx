import { useState } from 'react'
import { MdSubway } from 'react-icons/md'
import { useNavigate } from 'react-router-dom'
import './Login.css'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const navigate = useNavigate()

  const handleLogin = (e) => {
    e.preventDefault()
    // Aceita qualquer usuário/senha e redireciona
    console.log('Login:', username, password)
    navigate('/inicio')
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <MdSubway className="logo-icon" />
        <h1>Metrô Canteiro de Obras</h1>

        <form onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit">Entrar</button>
        </form>

        <p className="footer">© Metrô de São Paulo</p>
      </div>
    </div>
  )
}

export default Login
