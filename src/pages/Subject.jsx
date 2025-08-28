import { useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient";

export default function Subject({ user }) {
  const { subjectName } = useParams();
  const navigate = useNavigate();

  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newText, setNewText] = useState("");
  const [newFile, setNewFile] = useState(null);
  const [search, setSearch] = useState("");
  const [subjectId, setSubjectId] = useState(null);

  const [matches, setMatches] = useState([]);
  const [matchIndex, setMatchIndex] = useState(0);
  const [showAddModal, setShowAddModal] = useState(false);

  const itemRefs = useRef({});
  const isAdmin = user?.role === "admin"; // роль должна приходить из profiles

  useEffect(() => {
    loadNotes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectName]);

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
          n.image_url?.toLowerCase().includes(q)
      )
      .map((n) => n.id);

    setMatches(found);
    setMatchIndex(0);

    if (found.length > 0) {
      setTimeout(() => scrollToId(found[0]), 50);
    }
  }, [search, notes]);

  async function loadNotes() {
    setLoading(true);

    const { data: subjectData, error: subjError } = await supabase
      .from("subjects")
      .select("id")
      .eq("name", subjectName)
      .single();

    if (subjError || !subjectData) {
      console.error("Ошибка загрузки предмета:", subjError);
      setLoading(false);
      return;
    }

    setSubjectId(subjectData.id);

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
    if (el?.scrollIntoView) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
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

  // удаление заметки
  async function deleteNote(note) {
    if (!isAdmin) return;
    if (!note?.id) return;
    if (!window.confirm("Удалить эту заметку навсегда?")) return;

    setLoading(true);

    try {
      const url = note.image_url || "";
      const marker = "/notes-photos/";
      if (url.includes(marker)) {
        let path = url.split(marker)[1].split("?")[0];
        path = decodeURIComponent(path);
        await supabase.storage.from("notes-photos").remove([path]);
      }
    } catch (e) {
      console.warn("Не удалось определить путь файла:", e);
    }

    await supabase.from("notes").delete().eq("id", note.id);
    setNotes((prev) => prev.filter((n) => n.id !== note.id));

    setLoading(false);
  }

  async function addNoteFromModal(file, text) {
    if (!isAdmin) return;
    if (!file || !text) {
      alert("Добавь и фото, и текст!");
      return;
    }
    if (!subjectId) {
      alert("Не определён subject_id");
      return;
    }

    setLoading(true);

    const fileName = `${Date.now()}_${Math.random().toString(36).slice(2)}_${file.name}`;
    const path = `${subjectId}/${fileName}`;

    const { error: fileError } = await supabase.storage
      .from("notes-photos")
      .upload(path, file);

    if (fileError) {
      console.error("Ошибка загрузки файла:", fileError);
      alert("Ошибка загрузки файла");
      setLoading(false);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("notes-photos")
      .getPublicUrl(path);

    const fileUrl = publicUrlData.publicUrl;

    const { data, error } = await supabase.from("notes").insert([
      {
        text_content: text,
        image_url: fileUrl,
        subject_id: subjectId,
      },
    ]).select("*").single();

    if (error) {
      console.error("Ошибка добавления заметки:", error);
      alert("Ошибка записи в базу");
    } else {
      setNotes((prev) => [data, ...prev]);
      setShowAddModal(false);
      setNewFile(null);
      setNewText("");
    }

    setLoading(false);
  }

  async function handleModalUpload() {
    await addNoteFromModal(newFile, newText);
  }

  const isMatch = (id) => matches.includes(id);

  return (
    <div style={{ padding: 12, fontFamily: "sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <button onClick={() => navigate("/")} style={{ padding: "6px 10px" }}>
          ⬅ Назад
        </button>
        <h2 style={{ margin: 0 }}>{subjectName}</h2>
      </div>

      {/* Tools */}
      <div
        style={{
          position: "sticky",
          top: 0,
          background: "#fff",
          zIndex: 60,
          padding: "10px 8px",
          borderBottom: "1px solid #e6e6e6",
          display: "flex",
          gap: 8,
          alignItems: "center",
        }}
      >
        <input
          type="text"
          placeholder="🔍 Поиск по заметкам"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: "8px 10px",
            borderRadius: 8,
            border: "1px solid #ddd",
          }}
        />

        {/* Навигация по совпадениям */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={prevMatch} style={{ padding: "8px 10px" }}>⟵</button>
          <div style={{ minWidth: 64, textAlign: "center" }}>
            {matches.length ? `${matchIndex + 1} / ${matches.length}` : "0 / 0"}
          </div>
          <button onClick={nextMatch} style={{ padding: "8px 10px" }}>⟶</button>
        </div>

        {isAdmin && (
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              padding: "8px 12px",
              background: "#2b9bf4",
              color: "#fff",
              border: "none",
              borderRadius: 8,
            }}
          >
            Add +
          </button>
        )}
      </div>

      {/* Лента */}
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
              return (
                <div
                  key={note.id}
                  ref={(el) => (itemRefs.current[note.id] = el)}
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    border: isCurrent
                      ? "3px solid #4cafef"
                      : matched
                      ? "2px solid #ffd54f"
                      : "1px solid #e6e6e6",
                    boxShadow: isCurrent ? "0 6px 18px rgba(76,175,239,0.12)" : "none",
                    background: "#fff",
                    position: "relative",
                  }}
                >
                  {isAdmin && (
                    <button
                      onClick={() => deleteNote(note)}
                      title="Удалить заметку"
                      style={{
                        position: "absolute",
                        right: 8,
                        top: 8,
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 18,
                        opacity: 0.8,
                      }}
                    >
                      🗑
                    </button>
                  )}

                  {note.image_url && (
                    <img
                      src={note.image_url}
                      alt="note"
                      style={{ width: "100%", borderRadius: 8 }}
                      onError={(e) => {
                        e.target.style.display = "none";
                      }}
                    />
                  )}
                  {note.text_content && (
                    <p style={{ marginTop: 8, whiteSpace: "pre-wrap", color: "#333" }}>
                      {note.text_content}
                    </p>
                  )}
                  <div style={{ fontSize: 12, color: "#777", marginTop: 6 }}>
                    {new Date(note.created_at).toLocaleString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Модалка добавления */}
      {isAdmin && showAddModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 200,
            padding: 16,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 640,
              background: "#fff",
              borderRadius: 12,
              padding: 16,
            }}
          >
            <h3 style={{ marginTop: 0 }}>Добавить заметку — {subjectName}</h3>

            <textarea
              placeholder="Текст заметки..."
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              style={{
                width: "100%",
                minHeight: 80,
                padding: 8,
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            />

            <div style={{ marginTop: 10, display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setNewFile(e.target.files?.[0] || null)}
              />
              <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                <button onClick={() => setShowAddModal(false)} style={{ padding: "8px 12px" }}>
                  Отмена
                </button>
                <button
                  onClick={handleModalUpload}
                  style={{
                    padding: "8px 12px",
                    background: "#2b9bf4",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                  }}
                >
                  Загрузить
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



