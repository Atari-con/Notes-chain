// src/utils/uploadFile.js
import { supabase } from "../supabaseClient";

const BUCKET = "notes-photos"; // <- проверь, что это имя твоего бакета в Supabase Storage

/**
 * Принимает File | File[] | FileList
 * Загружает каждый файл в Supabase Storage и возвращает массив мета-объектов:
 * [{ name, url, key, type, size }, ...]
 */
export async function uploadFileToApi(files) {
  const arr = Array.isArray(files) ? files : Array.from(files ? files : []);
  if (!arr.length) return [];

  const results = [];

  for (const file of arr) {
    const safeName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${(file.name || '').replace(/\s+/g, '_')}`;
    const path = `notes/${safeName}`;

    // upload
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true });

    if (uploadError) {
      console.error("Supabase upload error", uploadError);
      throw new Error(`Upload failed: ${uploadError.message || JSON.stringify(uploadError)}`);
    }

    // get public url (getPublicUrl возвращает объект синхронно)
    const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const url = publicData?.publicUrl ?? publicData?.public_url ?? null;

    results.push({
      name: file.name,
      url,
      key: path,
      type: file.type,
      size: file.size,
    });
  }

  return results;
}
