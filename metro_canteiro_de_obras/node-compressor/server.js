import express from "express";
import multer from "multer";
import cors from "cors";
import zlib from "zlib";
import fs from "fs";
import { supabase, BUCKET } from "./SUPABASE.js"; 
const app = express();
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

const upload = multer({ dest: "uploads/" });

// ✅ Rota principal
app.post("/compress", upload.single("file"), async (req, res) => {
  try {
    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);
    const compressedBuffer = zlib.gzipSync(fileBuffer);

    const username = req.body.username || "usuario";
    const compressedName = `${Date.now()}-${req.file.originalname}.gz`;

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

    fs.unlinkSync(filePath);

    return res.json({
      success: true,
      url: data.publicUrl,
      fileName: compressedName,
    });

  } catch (err) {
    console.error("❌ Erro no servidor:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Falha na compressão/upload",
    });
  }
});

// ✅ Porta
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 Node Compressor ativo e pronto! Porta ${PORT}`)
);
