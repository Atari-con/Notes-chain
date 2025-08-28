import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { supabase } from "./supabaseClient";
import Home from "./pages/Home.jsx";
import Subject from "./pages/Subject.jsx";
import Login from "./pages/Login.jsx";

export default function App() {
  const [session, setSession] = useState(null);
  const [userData, setUserData] = useState(null); // email + role

  useEffect(() => {
    // Проверяем активную сессию
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);

      if (session?.user?.email) {
        fetchProfile(session.user.email);
      }
    });

    // Подписка на изменения авторизации
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);

        if (session?.user?.email) {
          fetchProfile(session.user.email);
        } else {
          setUserData(null);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function fetchProfile(email) {
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("role")
      .eq("email", email)
      .single();

    if (!error && profile) {
      setUserData({ email, role: profile.role });
    }
  }

  return (


    <Routes>
      {!userData ? (
      <Route path="*" element={<Login onLogin={setUserData} />} />
  ) : (
    <>
      <Route path="/" element={<Home user={userData} />} />
      <Route path="/s/:subjectName" element={<Subject user={userData} />} />
    </>
  )}
     </Routes>


  );
}


