// pages/s/[streamSlug]/home.jsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../utils/supabaseClient";

export default function StreamHome() {
  const router = useRouter();
  const { streamSlug } = router.query;

  const [userProfile, setUserProfile] = useState(null);
  const [activeStream, setActiveStream] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [allStreams, setAllStreams] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- загрузка пользователя и потоков ---
  useEffect(() => {
    if (!streamSlug) return;

    (async () => {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return router.push("/");
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      setUserProfile(profile || null);

      // --- если админ, загружаем все потоки ---
      let streams = [];
      if (profile?.role === "admin") {
        const { data: all } = await supabase.from("streams").select("id,name,slug").order("name");
        streams = all || [];
        setAllStreams(streams);
      }

      // --- загружаем поток по slug ---
      const { data: stream } = await supabase
        .from("streams")
        .select("id,slug,name")
        .eq("slug", streamSlug)
        .maybeSingle();

      if (!stream) {
        setActiveStream(null);
        setSubjects([]);
        setLoading(false);
        return;
      }

      // --- если пользователь обычный и пытается открыть чужой поток ---
      if (profile?.role !== "admin" && profile?.stream_id && profile.stream_id !== stream.id) {
        const { data: ownStream } = await supabase
          .from("streams")
          .select("slug")
          .eq("id", profile.stream_id)
          .single();
        if (ownStream?.slug) return router.push(`/s/${ownStream.slug}/home`);
      }

      setActiveStream(stream);

      // --- загрузка предметов ---
      const { data: subjectsData } = await supabase
        .from("subjects")
        .select("id,name,slug")
        .eq("stream_id", stream.id)
        .order("name");

      setSubjects(subjectsData || []);
      setLoading(false);
    })();
  }, [streamSlug]);

  // --- обработка смены потока админом ---
  const handleChangeStream = (e) => {
    const selectedSlug = e.target.value;
    if (selectedSlug) {
      router.push(`/s/${selectedSlug}/home`);
    }
  };

  if (loading) return <p>Загрузка…</p>;
  if (!userProfile) return null;
  if (!activeStream) return <p>Поток не найден</p>;

  return (
    <div className="container">
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 12 }}>
        <h1 className="title">📚 {activeStream.name}</h1>

        {/* Меню админа */}
        {userProfile.role === "admin" && allStreams.length > 0 && (
          <select value={activeStream.slug} onChange={handleChangeStream}>
            {allStreams.map((s) => (
              <option key={s.id} value={s.slug}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {subjects.length === 0 ? (
        <p>Пока нет предметов в этом потоке</p>
      ) : (
        <div className="menu">
          {subjects.map((s) => (
            <button
              key={s.id}
              className="menu-btn"
              onClick={() => router.push(`/s/${activeStream.slug}/${s.slug}`)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

