import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 🚀 Configuração definitiva para React + IFC no Render
export default defineConfig({
  plugins: [react()],

  preview: {
    port: 4173,
    allowedHosts: [
      "metro-canteiro-de-obras.onrender.com",
      "node-compressor.onrender.com",
    ],
  },

  server: {
    port: 5173,
    allowedHosts: [
      "metro-canteiro-de-obras.onrender.com",
      "node-compressor.onrender.com",
    ],
    cors: {
      origin: [
        "https://metro-canteiro-de-obras.onrender.com",
        "https://node-compressor.onrender.com",
        "http://localhost:5173",
      ],
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "apikey"],
    },

    // 👇 ISSO É O QUE FAZ O WASM FUNCIONAR NO RENDER
    mimeTypes: {
      "application/wasm": ["wasm"],
    },
  },

  build: {
    chunkSizeWarningLimit: 1600,
    target: "esnext", // garante compatibilidade com WebAssembly
  },
});
