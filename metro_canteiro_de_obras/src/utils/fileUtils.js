export function dataURLtoFile(dataurl, filename) {
  const arr = dataurl.split(",");
  const mime = arr[0].match(/:(.*?);/)[1];
  const bstr = atob(arr[1]);
  const u8 = Uint8Array.from([...bstr].map((c) => c.charCodeAt(0)));

  return new File([u8], filename, { type: mime });
}

export function getTipo(name) {
  const ext = name.split(".").pop().toLowerCase();
  return ["jpg", "jpeg", "png", "webp"].includes(ext) ? "imagem" : "modelo";
}
