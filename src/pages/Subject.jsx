import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { uploadFileToApi } from "../utils/uploadFile";

export default function Subject({ user, activeStream }) {
  const { subjectSlug } = useParams();
  const navigate = useNavigate();

  // нормализуем slug: lowercase + replace spaces -> '-' + trim
  const normalizedSlug = subjectSlug
    ? String(subjectSlug).toLowerCase().trim().replace(/\s+/g, "-")
    : "";

  const [subject, setSubject] = useState(null);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [newFiles, setNewFiles] = useState([]); // храню массив File
  const [search, setSearch] = useState("");

  const [matches, setMatches] = useState([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);

  const itemRefs = useRef({});
  const isAdmin = user?.role === "admin";

  // загрузка предмета + заметок
  useEffect(() => {
    if (activeStream?.id && normalizedSlug) loadNotes();
    else {
      setSubject(null);
      setNotes([]);
      setLoading(false);
    }
    // eslint-disable-next-line
  }, [normalizedSlug, activeStream]);

  useEffect(() => {
    if (!search || !search.trim()) {
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

  async function loadNotes() {
    setLoading(true);
    if (!activeStream?.id || !normalizedSlug) {
      setNotes([]);
      setSubject(null);
      setLoading(false);
      return;
    }

    // 1) получаем subject по slug (и можно раскомментировать stream_id фильтр, когда нужно)
    const { data: subjectData, error: subjError } = await supabase
      .from("subjects")
      .select("id,name,slug,stream_id")
      .eq("slug", normalizedSlug)
      // .eq("stream_id", activeStream.id) // временно можно убрать, если slug уникален
      .single();

    console.log("subjectSlug", subjectSlug, "normalizedSlug", normalizedSlug, "stream_id", activeStream?.id);
    console.log("subjectData", subjectData, "subjError", subjError);

    if (subjError || !subjectData) {
      console.error("Ошибка загрузки предмета:", subjError);
      setSubject(null);
      setNotes([]);
      setLoading(false);
      return;
    }

    setSubject(subjectData);

    // 2) получаем заметки
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("subject_id", subjectData.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Ошибка загрузки заметок:", error);
      setNotes([]);
    } else {
      setNotes(data || []);
    }

    setLoading(false);
  }

  function scrollToId(id) {
    const el = itemRefs.current[id];
    if (el?.scrollIntoView) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function nextMatch() {
    if (!matches.length) return;
    setMatchIndex((prev) => {
      const next = (prev + 1) % matches.length;
      setTimeout(() => scrollToId(matches[next]), 50);
      return next;
    });
  }

  function prevMatch() {
    if (!matches.length) return;
    setMatchIndex((prev) => {
      const next = (prev - 1 + matches.length) % matches.length;
      setTimeout(() => scrollToId(matches[next]), 50);
      return next;
    });
  }

  async function deleteNote(note) {
    if (!isAdmin) return;
    if (!note?.id) return;
    if (!window.confirm("Удалить эту заметку навсегда?")) return;

    setLoading(true);
    const { error } = await supabase.from("notes").delete().eq("id", note.id);
    if (error) console.error("Delete error:", error);
    setNotes((prev) => prev.filter((n) => n.id !== note.id));
    setLoading(false);
  }

  async function addNoteFromModal(files, text) {
    if (!isAdmin) return;
    if (!text && (!files || files.length === 0)) {
      alert("Добавь текст или файлы!");
      return;
    }
    if (!subject?.id) {
      alert("Не определён subject_id");
      return;
    }
    if (!activeStream?.id) {
      alert("Не выбран поток");
      return;
    }

    setLoading(true);

    try {
      // 1) загружаем файлы (если есть)
      let attachments = [];
      if (files && files.length > 0) {
        // uploadFileToApi ожидает File[] или FileList и возвращает массив meta-объектов
        const uploaded = await uploadFileToApi(files);
        // uploaded — уже [{name,url,key,type,size}, ...]
        attachments = uploaded;
      }

      // 2) формируем полезную нагрузку и логируем её для отладки
      const payload = {
        text_content: text || null,
        attachments: attachments.length ? attachments : [], // всегда массив
        subject_id: subject.id,
        stream_id: activeStream.id,
      };

      console.log("Payload before insert:", payload);

      const { data, error } = await supabase
        .from("notes")
        .insert([payload])
        .select("*")
        .single();

      if (error) {
        console.error("Ошибка добавления заметки:", error);
        alert("Ошибка записи в базу: " + (error.message || JSON.stringify(error)));
      } else {
        setNotes((prev) => [data, ...prev]);
        setShowAddModal(false);
        setNewFiles([]);
        setNewText("");
      }
    } catch (e) {
      console.error("Ошибка в addNoteFromModal:", e);
      alert("Ошибка загрузки/сохранения: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  async function handleModalUpload() {
    await addNoteFromModal(newFiles, newText);
  }

  const isMatch = (id) => matches.includes(id);

  return (
    <div style={{ padding: 12, fontFamily: "sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <button onClick={() => navigate("/")} style={{ padding: "6px 10px" }}>⬅ Назад</button>
        <h2 style={{ margin: 0 }}>{subject?.name || subjectSlug}</h2>
        {isAdmin && activeStream && (
          <div style={{ marginLeft: "auto" }}>
            <small>Поток: {activeStream.name}</small>
          </div>
        )}
      </div>

      {/* Tools */}
      <div style={{
        position: "sticky", top: 0, background: "#fff", zIndex: 60,
        padding: "10px 8px", borderBottom: "1px solid #e6e6e6",
        display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap"
      }}>
        <input type="text" placeholder="🔍 Поиск по заметкам" value={search} onChange={(e) => setSearch(e.target.value)}
          style={{ flex: "1 1 220px", minWidth: 0, padding: "8px 10px", borderRadius: 8, border: "1px solid #ddd" }} />

        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          <button onClick={prevMatch} style={{ padding: "8px 10px" }}>⟵</button>
          <div style={{ minWidth: 64, textAlign: "center" }}>{matches.length ? `${matchIndex + 1} / ${matches.length}` : "0 / 0"}</div>
          <button onClick={nextMatch} style={{ padding: "8px 10px" }}>⟶</button>
        </div>

        {/* показываем кнопку Add + ТОЛЬКО если subject загружен */}
        {isAdmin && activeStream && subject && (
          <button onClick={() => setShowAddModal(true)} style={{ padding: "8px 12px", background: "#2b9bf4", color: "#fff", border: "none", borderRadius: 8 }}>
            Add +
          </button>
        )}
      </div>

      {/* Feed */}
      <div style={{ marginTop: 12 }}>
        {loading ? <p>Загрузка…</p> : notes.length === 0 ? <p>Заметок пока нет</p> :
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {notes.map((note) => {
              const matched = isMatch(note.id);
              const isCurrent = matches.length && matches[matchIndex] === note.id;
              return (
                <div key={note.id} ref={(el) => (itemRefs.current[note.id] = el)}
                  style={{
                    padding: 10, borderRadius: 10,
                    border: isCurrent ? "3px solid #4cafef" : matched ? "2px solid #ffd54f" : "1px solid #e6e6e6",
                    boxShadow: isCurrent ? "0 6px 18px rgba(76,175,239,0.12)" : "none",
                    background: "#fff", position: "relative"
                  }}>
                  {isAdmin && <button onClick={() => deleteNote(note)} title="Удалить заметку" style={{ position: "absolute", right: 8, top: 8, background: "transparent", border: "none", cursor: "pointer", fontSize: 18, opacity: 0.8 }}>🗑</button>}

                  {Array.isArray(note.attachments) && note.attachments.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 8 }}>
                      {note.attachments.map((a, idx) => (
                        <div key={idx} style={{ borderRadius: 8, overflow: 'hidden', background: '#f7f7f7', padding: 6 }}>
                          {a.type && a.type.includes('pdf') ? (
                            <a href={a.url} target="_blank" rel="noreferrer">📄 {a.name}</a>
                          ) : (
                            <img src={a.url} alt={a.name} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: 6 }} onError={(e) => e.target.style.display = 'none'} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {note.text_content && <p style={{ marginTop: 8, whiteSpace: "pre-wrap", color: "#333" }}>{note.text_content}</p>}

                  <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>{new Date(note.created_at).toLocaleString()}</div>
                </div>
              )
            })}
          </div>
        }
      </div>

      {/* Modal add */}
      {isAdmin && showAddModal && (
        <div onClick={(e) => { if (e.target === e.currentTarget) setShowAddModal(false); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 16 }}>
          <div role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: 640, background: '#fff', borderRadius: 12, padding: 16, boxSizing: 'border-box', maxHeight: '90vh', overflowY: 'auto' }}>
            <h3 style={{ marginTop: 0 }}>Добавить заметку — {subject?.name || subjectSlug}</h3>

            <textarea placeholder="Текст заметки..." value={newText} onChange={(e) => setNewText(e.target.value)} style={{ width: '100%', minHeight: 80, padding: 8, borderRadius: 8, border: '1px solid #ddd' }} />

            <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
              <input type="file" accept="image/*,application/pdf" multiple onChange={(e) => setNewFiles(Array.from(e.target.files))}
                style={{ flex: '1 1 220px', minWidth: 0, maxWidth: '100%' }} aria-label="Выбрать файлы" />

              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={() => setShowAddModal(false)} style={{ padding: '8px 12px' }}>Отмена</button>
                <button onClick={handleModalUpload} style={{ padding: '8px 12px', background: '#2b9bf4', color: '#fff', border: 'none', borderRadius: 8 }}>Загрузить</button>
              </div>
            </div>

            {newFiles && newFiles.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <strong>Файлы к загрузке:</strong>
                <ul>
                  {newFiles.map((f, i) => <li key={i}>{f.name} ({Math.round((f.size || 0) / 1024)} KB)</li>)}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}





