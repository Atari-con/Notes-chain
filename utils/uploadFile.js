// utils/uploadFile.js
export async function uploadFileToApi(files) {
  // files может быть File, FileList или Array<File>
  const list = Array.isArray(files) ? files : (files instanceof FileList ? Array.from(files) : [files]);

  const formData = new FormData();
  list.forEach((f) => formData.append("files", f, f.name));

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error("Upload failed: " + (text || res.statusText));
  }

  const data = await res.json();
  // ожидаем { files: [ {name,key,url,type,size}, ... ] }
  return data.files || [];
}
