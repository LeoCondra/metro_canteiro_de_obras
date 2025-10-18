import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Login from './Login.jsx'
import TelaInicial from './TelaInicial.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/inicio" element={<TelaInicial />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
