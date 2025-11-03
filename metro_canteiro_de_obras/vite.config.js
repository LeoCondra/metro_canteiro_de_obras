import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 🚀 Configuração definitiva
export default defineConfig({
  plugins: [react()],
  preview: {
    port: 4173,
    allowedHosts: [
      "metro-canteiro-de-obras.onrender.com", // teu front
      "node-compressor.onrender.com",          // teu backend no Render
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
  },
  build: {
    chunkSizeWarningLimit: 1600, // evita warning de bundle grande
  },
});
