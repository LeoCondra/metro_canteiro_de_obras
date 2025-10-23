import os
import sys
import requests
import json
import tempfile
import shutil
import pycolmap


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
    """Executa análise simples usando pycolmap"""
    imagens_dir = os.path.dirname(imagem_path)
    rec = pycolmap.Reconstruction()

    # Cria reconstrução incremental simples
    rec.incremental_mapping(database_path=os.path.join(pasta_saida, "database.db"),
                            image_path=imagens_dir,
                            output_path=pasta_saida)

    # Extrai estatísticas
    cameras = len(rec.cameras)
    imagens = len(rec.images)
    pontos3d = len(rec.points3D)

    return {
        "cameras": cameras,
        "imagens": imagens,
        "pontos3D": pontos3d,
        "saida": pasta_saida
    }


def analisar(url_imagem):
    pasta_temp = tempfile.mkdtemp()
    try:
        # Baixar imagem
        img_path = baixar_imagem(url_imagem, pasta_temp)

        # Rodar Colmap
        resultado = rodar_colmap(img_path, pasta_temp)

        # Montar resultado
        return {
            "imagem": url_imagem,
            "resultado_colmap": resultado,
            "status": "Análise concluída ✅"
        }
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
    print(json.dumps(resultado, indent=2, ensure_ascii=False))
