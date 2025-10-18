// pages/api/delete-note.js
import { deleteFilesFromR2 } from "../../utils/cloudflareR2";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Создаём серверный supabase-клиент:
 * - если есть SERVICE_ROLE — используем его (админские права)
 * - иначе используем anon (но он может не иметь прав удалять по RLS)
 */
const supabase = SUPABASE_SERVICE_ROLE
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE)
  : createClient(SUPABASE_URL, SUPABASE_ANON);

/** Если attachment только с url — пытаемся достать ключ объекта R2 из url */
function keyFromUrl(url) {
  try {
    if (!url) return null;
    const u = new URL(url);
    // Простейшее предположение: ключ — всё, что после последнего слеша
    // либо после `/<bucket>/...` — корректируй под твой PUBLIC URL формат
    const path = u.pathname || "";
    if (!path) return null;
    // удалим ведущий /
    return path.replace(/^\//, "");
  } catch (err) {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const { noteId, attachments } = req.body || {};

    if (!noteId) {
      return res.status(400).json({ success: false, error: "noteId is required" });
    }

    // --- 1) Удаляем файлы из R2 (если есть) ---
    if (Array.isArray(attachments) && attachments.length > 0) {
      // Берём либо a.key либо извлекаем из url
      const keys = attachments
        .map((a) => a?.key || keyFromUrl(a?.url) || a?.name)
        .filter(Boolean);

      if (keys.length) {
        try {
          await deleteFilesFromR2(keys);
          console.log(`Deleted ${keys.length} files from R2 for note ${noteId}`);
        } catch (err) {
          console.error("R2 deleteFilesFromR2 error:", err);
          // Не фейлим бережно — можно продолжить и удалить запись в БД,
          // либо вернуть ошибку. Здесь возвращаем ошибку, чтобы не оставлять висящие заметки.
          return res.status(500).json({ success: false, error: "Failed to delete files from R2", details: String(err) });
        }
      }
    }

    // --- 2) Удаляем запись в Supabase ---
    const { error } = await supabase.from("notes").delete().eq("id", noteId);

    if (error) {
      console.error("Supabase delete error:", error);
      return res.status(500).json({ success: false, error: "Failed to delete note from DB", details: error.message || error });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("API delete-note unexpected error:", err);
    return res.status(500).json({ success: false, error: "Server error", details: String(err) });
  }
}
