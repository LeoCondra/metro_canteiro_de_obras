import express from "express";
import cors from "cors";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
const upload = multer({ storage: multer.memoryStorage() });

// 🔧 Configuração Supabase
const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const BUCKET = "canteiro de obras";

// ============================
// 📦 ROTA DE COMPRESSÃO
// ============================
app.post("/compress", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) throw new Error("Nenhum arquivo recebido");

    const file = req.file;
    const path = `arquivos/${Date.now()}-${file.originalname}`;

    // 🔹 Upload direto para o Storage
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file.buffer, { upsert: true, contentType: file.mimetype });

    if (error) throw error;

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);

    res.json({
      status: "ok",
      url: data.publicUrl,
      descricao: "Arquivo compactado e salvo no Storage com sucesso"
    });
  } catch (err) {
    console.error("❌ Erro na compressão:", err.message);
    res.status(500).json({
      status: "erro",
      descricao: err.message
    });
  }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`🚀 Compressor rodando na porta ${PORT}`));
