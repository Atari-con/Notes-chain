// components/Subject.jsx
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../utils/supabaseClient";
import { uploadFileToApi } from "../utils/uploadFile";

/**
 * Subject — устойчивая версия с proxy fallback.
 * - Автоматически подставляет изображение через /api/proxy-image (по key или url)
 * - Сохраняет прежнюю логику загрузки/поиска/удаления
 * - Лёгкая диагностика (debugCheckAttachments)
 */

export default function Subject(props) {
  const router = useRouter();

  const propSlug = props.subjectSlug ?? props.slug;
  const querySlug = router.query?.subjectSlug ?? router.query?.slug;
  const rawSlug = propSlug ?? querySlug ?? "";
  const normalizedSlug = rawSlug ? String(rawSlug).toLowerCase().trim().replace(/\s+/g, "-") : "";

  const user = props.user ?? null;
  const activeStream = props.activeStream ?? null;

  const [subject, setSubject] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [newFiles, setNewFiles] = useState([]);
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);

  const itemRefs = useRef({});
  const isAdmin = user?.role === "admin";

  // -------------------- Helpers --------------------

  // ensureAttachmentUrl — если у вложения нет url, пытаемся сформировать из NEXT_PUBLIC_R2_PUBLIC_URL + key
  function ensureAttachmentUrl(a) {
    if (!a) return a;
    if (a.url) return a;
    const key = a.key || a.name;
    if (!key) return a;
    const base = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.NEXT_PUBLIC_R2_BASE || "";
    if (base) {
      return { ...a, url: `${base.replace(/\/$/, "")}/${encodeURIComponent(key)}` };
    }
    return a;
  }

  // Возвращает src для <img> — prefer key (proxy by key), fallback proxy by url, else empty string
  function imgSourceForAttachment(a) {
    if (!a) return "";
    if (a.key) return `/api/proxy-image?key=${encodeURIComponent(a.key)}`;
    if (a.url) return `/api/proxy-image?url=${encodeURIComponent(a.url)}`;
    return "";
  }

  // определяем, изображение ли это
  function isImageAttachment(a) {
    if (!a) return false;
    const t = (a.type || "").toLowerCase();
    if (t.startsWith("image/")) return true;
    const urlOrName = (a.url || a.name || "").toLowerCase();
    return /\.(jpe?g|png|webp|gif|avif|svg)$/.test(urlOrName);
  }

  // debug check: лог + вызов /api/check-image (не критично для UX)
  async function debugCheckAttachments(sampleNotes = []) {
    try {
      console.log("DEBUG: checking attachments for first few notes:", sampleNotes.slice(0, 3));
      for (const n of sampleNotes.slice(0, 3)) {
        console.log("NOTE", n.id, n.attachments);
        if (!Array.isArray(n.attachments) || n.attachments.length === 0) continue;
        const first = ensureAttachmentUrl(n.attachments[0]);
        const url = first?.url || null;
        console.log(" -> first (ensured):", first);
        if (!url) {
          console.warn(" -> no url for attachment. Maybe attachments only store key/name or R2 public base not provided.");
          continue;
        }
        try {
          const r = await fetch("/api/check-image?url=" + encodeURIComponent(url));
          const j = await r.json();
          console.log(" -> /api/check-image response for", url, j);
        } catch (err) {
          console.error(" -> failed to call /api/check-image:", err);
        }
      }
    } catch (err) {
      console.error("debugCheckAttachments error:", err);
    }
  }

  // -------------------- Load subject + notes --------------------
  useEffect(() => {
    if (!normalizedSlug || !activeStream?.id) {
      setSubject(null);
      setNotes([]);
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    (async () => {
      try {
        const { data: subjectData, error: subjErr } = await supabase
          .from("subjects")
          .select("id,name,slug,stream_id")
          .eq("slug", normalizedSlug)
          .maybeSingle();

        if (subjErr) {
          console.error("Supabase subject load error:", subjErr);
          if (!mounted) return;
          setSubject(null);
          setNotes([]);
          return;
        }

        if (!subjectData) {
          if (!mounted) return;
          setSubject(null);
          setNotes([]);
          return;
        }

        if (subjectData.stream_id !== activeStream.id) {
          console.warn("Subject stream_id mismatch:", { subjectStream: subjectData.stream_id, activeStream: activeStream.id });
          if (!mounted) return;
          setSubject(null);
          setNotes([]);
          return;
        }

        if (!mounted) return;
        setSubject(subjectData);

        const { data: notesData, error: notesErr } = await supabase
          .from("notes")
          .select("*")
          .eq("subject_id", subjectData.id)
          .order("created_at", { ascending: false });

        if (notesErr) {
          console.error("Supabase notes load error:", notesErr);
          if (!mounted) return;
          setNotes([]);
        } else {
          if (!mounted) return;
          const normalized = (notesData || []).map((n) => {
            const attachments = Array.isArray(n.attachments) ? n.attachments.map(ensureAttachmentUrl) : [];
            return { ...n, attachments };
          });
          setNotes(normalized);
          setTimeout(() => debugCheckAttachments(normalized), 200);
        }
      } catch (err) {
        console.error("Error loading subject or notes:", err);
        if (!mounted) return;
        setSubject(null);
        setNotes([]);
      } finally {
        if (!mounted) return;
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [normalizedSlug, activeStream]);

  // -------------------- Search --------------------
  useEffect(() => {
    if (!search.trim()) {
      setMatches([]);
      setMatchIndex(0);
      return;
    }
    const q = search.trim().toLowerCase();
    const found = notes
      .filter(
        (n) =>
          n.text_content?.toLowerCase().includes(q) ||
          (Array.isArray(n.attachments) &&
            n.attachments.some((a) => (a.name || "").toLowerCase().includes(q)))
      )
      .map((n) => n.id);

    setMatches(found);
    setMatchIndex(0);
    if (found.length > 0) setTimeout(() => scrollToId(found[0]), 50);
  }, [search, notes]);

  function scrollToId(id) {
    const el = itemRefs.current[id];
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  // -------------------- Add note (upload) --------------------
  async function addNoteFromModal(files, text) {
    if (!isAdmin) return;
    if (!text && (!files || files.length === 0)) return alert("Добавь текст или файлы!");
    if (!subject?.id || !activeStream?.id) return alert("Нет subject_id или stream_id");

    setLoading(true);
    try {
      let attachments = [];
      if (files && files.length > 0) attachments = await uploadFileToApi(files);

      const payload = {
        text_content: text || null,
        attachments,
        subject_id: subject.id,
        stream_id: activeStream.id,
      };

      const { data, error } = await supabase.from("notes").insert([payload]).select("*").single();
      if (error) throw error;

      const normalizedNote = { ...data, attachments: Array.isArray(data.attachments) ? data.attachments.map(ensureAttachmentUrl) : [] };
      setNotes((prev) => [normalizedNote, ...prev]);
      setShowAddModal(false);
      setNewFiles([]);
      setNewText("");
    } catch (err) {
      alert("Ошибка загрузки: " + (err.message || err));
      console.error("Add note error:", err);
    } finally {
      setLoading(false);
    }
  }

  const handleModalUpload = () => addNoteFromModal(newFiles, newText);

  // -------------------- Delete note --------------------
  async function deleteNote(note) {
    if (!isAdmin || !note?.id) return;
    if (!window.confirm("Удалить эту заметку навсегда?")) return;

    setLoading(true);
    try {
      const res = await fetch("/api/delete-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteId: note.id, attachments: note.attachments || [] }),
      });

      let payload;
      try {
        payload = await res.json();
      } catch (e) {
        const txt = await res.text().catch(() => "");
        throw new Error(txt || `HTTP ${res.status}`);
      }

      if (!res.ok) {
        const errMsg = payload?.error || payload?.details || JSON.stringify(payload) || `HTTP ${res.status}`;
        throw new Error(errMsg);
      }

      if (!payload.success) {
        throw new Error(payload.error || "Ошибка удаления");
      }

      setNotes((prev) => prev.filter((n) => n.id !== note.id));
    } catch (err) {
      console.error("Error deleting note (client):", err);
      alert("Ошибка при удалении заметки: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  }

  const isMatch = (id) => matches.includes(id);

  // -------------------- Render --------------------
  return (
    <div style={{ padding: 12, fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <button onClick={() => router.push(activeStream ? `/s/${activeStream.slug}/home` : "/home")} style={{ padding: "6px 10px" }}>
          ⬅ Назад
        </button>
        <h2 style={{ margin: 0 }}>{subject?.name ?? (loading ? "Загрузка..." : (rawSlug || "—"))}</h2>
        {isAdmin && activeStream && subject && (
          <div style={{ marginLeft: "auto" }}>
            <small>Поток: {activeStream.name}</small>
          </div>
        )}
      </div>

      <div style={{
        position: "sticky",
        top: 0,
        background: "#fff",
        zIndex: 60,
        padding: "10px 8px",
        borderBottom: "1px solid #e6e6e6",
        display: "flex",
        gap: 8,
        alignItems: "center",
        flexWrap: "wrap"
      }}>
        <input
          type="text"
          placeholder="🔍 Поиск по заметкам"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 220px", minWidth: 0, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button onClick={() => {
            if (!matches.length) return;
            setMatchIndex((prev) => {
              const next = (prev - 1 + matches.length) % matches.length;
              setTimeout(() => scrollToId(matches[next]), 50);
              return next;
            });
          }} style={{ padding: "8px 10px" }}>⟵</button>

          <div style={{ minWidth: 64, textAlign: "center" }}>{matches.length ? `${matchIndex + 1} / ${matches.length}` : "0 / 0"}</div>

          <button onClick={() => {
            if (!matches.length) return;
            setMatchIndex((prev) => {
              const next = (prev + 1) % matches.length;
              setTimeout(() => scrollToId(matches[next]), 50);
              return next;
            });
          }} style={{ padding: "8px 10px" }}>⟶</button>
        </div>

        {isAdmin && activeStream && subject && (
          <button onClick={() => setShowAddModal(true)} style={{ padding: "8px 12px", background: "#2b9bf4", color: "#fff", border: "none", borderRadius: 8 }}>
            Add +
          </button>
        )}
      </div>

      <div style={{ marginTop: 12 }}>
        {loading ? (
          <p>Загрузка…</p>
        ) : notes.length === 0 ? (
          <p>Заметок пока нет</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {notes.map((note) => {
              const matched = isMatch(note.id);
              const isCurrent = matches.length && matches[matchIndex] === note.id;

              const attachments = Array.isArray(note.attachments) ? note.attachments : [];
              const images = attachments.filter(isImageAttachment);
              const others = attachments.filter((a) => !isImageAttachment(a));

              return (
                <div key={note.id} ref={(el) => (itemRefs.current[note.id] = el)} style={{
                  padding: 10,
                  borderRadius: 10,
                  border: isCurrent ? "3px solid #4cafef" : matched ? "2px solid #ffd54f" : "1px solid #e6e6e6",
                  boxShadow: isCurrent ? "0 6px 18px rgba(76,175,239,0.12)" : "none",
                  background: "#fff",
                  position: "relative"
                }}>
                  {isAdmin && (
                    <button onClick={() => deleteNote(note)} title="Удалить заметку" style={{
                      position: "absolute",
                      right: 8,
                      top: 8,
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontSize: 18,
                      opacity: 0.8
                    }}>🗑</button>
                  )}

                  {images.length > 0 ? (
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ width: "100%", borderRadius: 10, overflow: "hidden", background: "#f7f7f7" }}>
                        {/* main image — through proxy */}
                        <img
                          src={imgSourceForAttachment(images[0])}
                          alt={images[0].name || "image"}
                          style={{ width: "100%", height: "auto", display: "block", objectFit: "cover" }}
                          loading="lazy"
                          onError={(e) => {
                            console.warn("Image failed to load (proxy):", e?.target?.src);
                            e.target.style.display = "none";
                          }}
                        />
                      </div>

                      {images.length > 1 && (
                        <div style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
                          gap: 8,
                          marginTop: 8
                        }}>
                          {images.slice(1).map((img, i) => (
                            <div key={i} style={{ borderRadius: 8, overflow: "hidden", background: "#f7f7f7" }}>
                              <img
                                src={imgSourceForAttachment(img)}
                                alt={img.name || `image-${i + 1}`}
                                style={{ width: "100%", height: 120, objectFit: "cover", display: "block" }}
                                loading="lazy"
                                onError={(e) => (e.target.style.display = "none")}
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : null}

                  {note.text_content && <p style={{ marginTop: images.length > 0 ? 6 : 8, whiteSpace: "pre-wrap", color: "#333" }}>{note.text_content}</p>}

                  {others.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                      {others.map((a, idx) => {
                        const filename = a.name || (a.url && a.url.split("/").pop()) || "file";
                        // link other files via proxy as well to avoid ORB
                        const downloadHref = a.key
                          ? `/api/proxy-image?key=${encodeURIComponent(a.key)}`
                          : (a.url ? `/api/proxy-image?url=${encodeURIComponent(a.url)}` : "#");

                        return (
                          <a
                            key={idx}
                            href={downloadHref}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "8px 10px",
                              borderRadius: 8,
                              textDecoration: "none",
                              background: "#fafafa",
                              border: "1px solid #eee",
                              color: "#333"
                            }}
                          >
                            <span style={{ fontSize: 18 }}>📄</span>
                            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1 }}>
                              <span style={{ fontSize: 14, fontWeight: 500 }}>{filename}</span>
                              {a.size ? <small style={{ color: "#666" }}>{Math.round(a.size / 1024)} KB</small> : null}
                            </div>
                          </a>
                        );
                      })}
                    </div>
                  )}

                  <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>{note.created_at ? new Date(note.created_at).toLocaleString() : ""}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {isAdmin && showAddModal && subject && activeStream && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 200, padding: 16
        }}>
          <div role="dialog" aria-modal="true" style={{ width: "100%", maxWidth: 640, background: "#fff", borderRadius: 12, padding: 16, boxSizing: "border-box", maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ marginTop: 0 }}>Добавить заметку — {subject?.name}</h3>
            <textarea placeholder="Текст заметки..." value={newText} onChange={(e) => setNewText(e.target.value)} style={{ width: "100%", minHeight: 80, padding: 8, borderRadius: 8, border: "1px solid #ddd" }} />
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
              <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setNewFiles(Array.from(e.target.files))} style={{ flex: "1 1 220px", minWidth: 0, maxWidth: "100%" }} aria-label="Выбрать файлы" />
              <div style={{ marginLeft: "auto", display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => setShowAddModal(false)} style={{ padding: "8px 12px" }}>Отмена</button>
                <button onClick={handleModalUpload} style={{ padding: "8px 12px", background: "#2b9bf4", color: "#fff", border: "none", borderRadius: 8 }}>Загрузить</button>
              </div>
            </div>
            {newFiles.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong>Файлы к загрузке:</strong>
                <ul>{newFiles.map((f, i) => <li key={i}>{f.name} ({Math.round((f.size || 0) / 1024)} KB)</li>)}</ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
