import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import Login from './Login'  // tela inicial será o Login

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <Login />
  </React.StrictMode>
)
