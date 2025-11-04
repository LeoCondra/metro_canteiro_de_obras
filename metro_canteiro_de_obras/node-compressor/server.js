import express from "express";
import multer from "multer";
import cors from "cors";
import zlib from "zlib";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const app = express();

// ============================
// 🌐 CORS liberado
// ============================
app.use(
  cors({
    origin: [
      "https://metro-canteiro-de-obras.onrender.com",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "apikey"],
  })
);
app.use(express.json());

// ============================
// 🗂️ UPLOAD TEMPORÁRIO
// ============================
const upload = multer({ dest: "uploads/" });

// ============================
// 🔧 SUPABASE CONFIG
// ============================
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";
const BUCKET = "canteiro de obras";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================
// 🚀 ENDPOINT /compress
// ============================
app.post("/compress", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Nenhum arquivo enviado." });
    }

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const compressedBuffer = zlib.gzipSync(fileBuffer);

    const username = req.body.username || "usuario";
    const compressedName = `${Date.now()}-${req.file.originalname}.gz`;

    console.log(`📦 Compactando arquivo: ${req.file.originalname}`);

    // Upload para Supabase
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(`compressed/${username}/${compressedName}`, compressedBuffer, {
        contentType: "application/gzip",
        upsert: true,
      });

    if (uploadError) throw uploadError;

    const { data: publicData } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(`compressed/${username}/${compressedName}`);

    fs.unlink(filePath, () => {}); // limpa temporário
    console.log(`✅ Upload concluído: ${publicData.publicUrl}`);

    res.json({
      success: true,
      url: publicData.publicUrl,
      fileName: compressedName,
    });
  } catch (err) {
    console.error("❌ Erro no servidor:", err);
    res.status(500).json({
      success: false,
      message: err.message || "Falha na compressão/upload",
    });
  }
});
// ============================
// 🧠 HEALTH CHECK
// ============================
app.get("/", (req, res) => {
  res.status(200).send("✅ Node Compressor ativo e pronto!");
});

// ============================
// 🚀 START SERVER
// ============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🚀 Node compressor rodando na porta ${PORT}`));
