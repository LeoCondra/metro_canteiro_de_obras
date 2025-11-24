import sobel from "sobel";

export function sobelEdge(webglCanvas) {
  try {
    if (!webglCanvas) return null;

    const temp = document.createElement("canvas");
    temp.width = webglCanvas.width;
    temp.height = webglCanvas.height;

    const ctx = temp.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(webglCanvas, 0, 0);
    const imgData = ctx.getImageData(0, 0, temp.width, temp.height);

    const sobelData = sobel(imgData);

    if (!sobelData || !sobelData.toImageData) {
      console.warn("Sobel falhou → usando imagem normal");
      return temp;
    }

    const edgeCanvas = document.createElement("canvas");
    edgeCanvas.width = temp.width;
    edgeCanvas.height = temp.height;

    const ectx = edgeCanvas.getContext("2d");
    if (!ectx) return temp;

    ectx.putImageData(sobelData.toImageData(), 0, 0);
    return edgeCanvas;
  } catch (err) {
    console.error("Erro no Sobel:", err);
    return null;
  }
}
