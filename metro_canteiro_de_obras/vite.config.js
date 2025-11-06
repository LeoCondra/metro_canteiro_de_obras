import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteStaticCopy } from "vite-plugin-static-copy";

export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: "public/wasm/*",
          dest: "wasm"
        }
      ]
    })
  ],

  assetsInclude: ["**/*.wasm"],

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

    fsServe: {
      strict: false,
    },
  },

  build: {
    chunkSizeWarningLimit: 1600,
    target: "esnext",
  },
});
