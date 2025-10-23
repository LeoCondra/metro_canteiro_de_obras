import os
import sys
import requests
import json
import subprocess
import tempfile
import shutil

def baixar_imagem(url, pasta_destino):
    """Baixa a imagem do Supabase Storage"""
    local_path = os.path.join(pasta_destino, os.path.basename(url))
    r = requests.get(url, stream=True)
    if r.status_code == 200:
        with open(local_path, "wb") as f:
            f.write(r.content)
        return local_path
    else:
        raise Exception(f"Erro ao baixar imagem: {r.status_code}")

def rodar_colmap(imagem_path, pasta_saida):
    """Executa análise simples no Colmap"""
    banco_dados = os.path.join(pasta_saida, "database.db")
    imagens_dir = os.path.dirname(imagem_path)

    # 1. Extrair features
    subprocess.run([
        "colmap", "feature_extractor",
        "--database_path", banco_dados,
        "--image_path", imagens_dir
    ], check=True)

    # 2. Casar features (matching)
    subprocess.run([
        "colmap", "exhaustive_matcher",
        "--database_path", banco_dados
    ], check=True)

    # 3. Reconstrução incremental (simples)
    rec_dir = os.path.join(pasta_saida, "sparse")
    os.makedirs(rec_dir, exist_ok=True)
    subprocess.run([
        "colmap", "mapper",
        "--database_path", banco_dados,
        "--image_path", imagens_dir,
        "--output_path", rec_dir
    ], check=True)

    return rec_dir

def analisar(url_imagem):
    pasta_temp = tempfile.mkdtemp()
    try:
        # Baixar imagem
        img_path = baixar_imagem(url_imagem, pasta_temp)

        # Rodar Colmap
        out_dir = rodar_colmap(img_path, pasta_temp)

        # Montar resultado (exemplo: arquivos gerados)
        resultado = {
            "imagem": url_imagem,
            "saida_colmap": os.listdir(out_dir),
            "status": "Análise concluída ✅"
        }
        return resultado
    except Exception as e:
        return {"error": str(e)}
    finally:
        shutil.rmtree(pasta_temp, ignore_errors=True)

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python analisar-colmap.py <url_imagem>")
        sys.exit(1)

    url_imagem = sys.argv[1]
    resultado = analisar(url_imagem)
    print(json.dumps(resultado, indent=2))
