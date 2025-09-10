import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Home from "./pages/Home.jsx";
import Subject from "./pages/Subject.jsx";
import Login from "./pages/Login.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [userData, setUserData] = useState(null); // {email, role, stream_id}
  const [streams, setStreams] = useState([]);
  const [activeStream, setActiveStream] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user?.email) fetchProfile(session.user.email);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);
        if (session?.user?.email) fetchProfile(session.user.email);
        else {
          setUserData(null);
          setActiveStream(null);
        }
      }
    );

    return () => subscription.unsubscribe();
    // eslint-disable-next-line
  }, []);

  async function fetchProfile(email) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role, stream_id")
      .eq("email", email)
      .single();

    if (!error && profile) {
      const u = { email, role: profile.role, stream_id: profile.stream_id };
      setUserData(u);

      // load streams list
      const { data: allStreams } = await supabase
        .from("streams")
        .select("id, name, slug")
        .order("name", { ascending: true });

      setStreams(allStreams || []);

      if (u.role === "admin") {
        // admin default: their stream if set else first
        const chosen = allStreams?.find(s => s.id === u.stream_id) || allStreams?.[0] || null;
        setActiveStream(chosen);
      } else {
        // viewer: assigned stream only
        const assigned = allStreams?.find(s => s.id === u.stream_id) || null;
        setActiveStream(assigned);
      }
    }
  }

  return (
    <Routes>
      {!userData ? (
        <Route path="*" element={<Login onLogin={setUserData} />} />
      ) : (
        <>
          <Route path="/" element={
            <Home user={userData} streams={streams} activeStream={activeStream} setActiveStream={setActiveStream} />
          } />
          <Route path="/s/:subjectSlug" element={
            <Subject user={userData} activeStream={activeStream} setActiveStream={setActiveStream} />
          } />
        </>
      )}
    </Routes>
  );
}



