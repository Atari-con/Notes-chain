// pages/s/[streamSlug]/[subjectSlug].jsx
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../../../utils/supabaseClient";
import Subject from "../../../components/Subject";

export default function SubjectPage() {
  const router = useRouter();
  const { streamSlug, subjectSlug } = router.query;

  const [userProfile, setUserProfile] = useState(null);
  const [activeStream, setActiveStream] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!streamSlug || !subjectSlug) return;

    (async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push("/");

      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();
      setUserProfile(profile || null);

      // load stream by slug
      const { data: stream } = await supabase.from("streams").select("id,slug,name").eq("slug", streamSlug).maybeSingle();
      if (!stream) {
        setActiveStream(null);
        setLoading(false);
        return;
      }

      // if not admin and user's stream != requested stream -> redirect to own stream
      if (profile?.role !== "admin" && profile?.stream_id && profile.stream_id !== stream.id) {
        const { data: ownStream } = await supabase.from("streams").select("slug").eq("id", profile.stream_id).single();
        if (ownStream?.slug) return router.push(`/s/${ownStream.slug}/home`);
      }

      setActiveStream(stream);
      setLoading(false);
    })();
  }, [streamSlug, subjectSlug]);

  if (loading) return <p>Загрузка…</p>;
  if (!userProfile) return null;
  if (!activeStream) return <p>Поток не найден</p>;

  return <Subject user={userProfile} activeStream={activeStream} subjectSlug={subjectSlug} />;
}

