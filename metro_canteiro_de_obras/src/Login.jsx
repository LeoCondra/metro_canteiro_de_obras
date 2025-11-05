import { useState } from 'react'
import { MdSubway } from 'react-icons/md'
import { useNavigate } from 'react-router-dom'
import {supabase} from './Supabase.js'   // cliente do Supabase
import './Login.css'

function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')

    try {
      const { data, error } = await supabase
        .from('administrador')
        .select('*')
        .eq('login', username)
        .eq('senha', password)
        .single()

      if (error || !data) {
        setError('Usuário ou senha inválidos')
        return
      }

      console.log('Login bem-sucedido:', data)
     navigate('/inicio', { state: { username: data.login } })
    } catch (err) {
      console.error('Erro inesperado:', err)
      setError('Erro ao conectar com o servidor')
    }
  }

  return (
    <div className="login-page">
      <div className="login-box">
        <MdSubway className="logo-icon" />
        <h1>Metrô Canteiro de Obras</h1>

        <form onSubmit={handleLogin}>
          {/* Usuário */}
          <input
            type="text"
            placeholder="Usuário"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />

          {/* Senha com botão Mostrar/Ocultar */}
          <div className="password-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className="toggle-password"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>

          {/* Exibe erro se houver */}
          {error && <p className="error">{error}</p>}

          <button type="submit" className="login-btn">Entrar</button>
        </form>

        <p className="footer">© Metrô de São Paulo</p>
      </div>
    </div>
  )
}

export default Login
