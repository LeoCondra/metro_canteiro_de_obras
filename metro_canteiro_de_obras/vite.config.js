import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ⚙️ Configuração completa para produção no Render
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, // porta local padrão
    host: true, // permite acesso externo (útil pra testes LAN)
  },
  preview: {
    port: 4173, // porta usada no comando "vite preview"
    host: true,
    allowedHosts: [
      "metro-canteiro-de-obras.onrender.com",
       "node-compressor.onrender.com", // ✅ domínio público do Render liberado
    ],
  },
  build: {
    outDir: "dist",
    chunkSizeWarningLimit: 1600, // evita warnings de bundles grandes (three.js)
  },
});
