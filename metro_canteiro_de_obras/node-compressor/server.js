import express from "express";
import multer from "multer";
import cors from "cors";
import zlib from "zlib";
import fs from "fs";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "uploads/" });

const SUPABASE_URL = "https://aedludqrnwntsqgyjjla.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFlZGx1ZHFybndudHNxZ3lqamxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjA3NTE2OTYsImV4cCI6MjA3NjMyNzY5Nn0.DV8BB3SLXxBKSZ6pMCbCUmnhkLaujehwPxJi4zvIbRU";
const BUCKET = "canteiro de obras";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================
// 🚀 ENDPOINT DE COMPRESSÃO
// ============================
app.post("/compress", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const compressedBuffer = zlib.gzipSync(fileBuffer);

    const username = req.body.username || "usuario";
    const compressedName = `${Date.now()}-${req.file.originalname}.gz`;

    // Upload para o Supabase Storage
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`compressed/${username}/${compressedName}`, compressedBuffer, {
        contentType: "application/gzip",
        upsert: true,
      });

    if (error) throw error;

    const { data } = supabase.storage
      .from(BUCKET)
      .getPublicUrl(`compressed/${username}/${compressedName}`);

    fs.unlinkSync(filePath); // limpar arquivo local

    res.json({
      success: true,
      url: data.publicUrl,
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

app.listen(10000, () =>
  console.log("🚀 Node compressor rodando na porta 10000")
);
