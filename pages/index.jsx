// pages/index.jsx
import { useState } from "react";
import { useRouter } from "next/router";
import { supabase } from "../utils/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [isRegister, setIsRegister] = useState(false);
  const router = useRouter();

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (isRegister) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) return setError(error.message);

      await supabase
        .from("profiles")
        .insert([{ id: data.user?.id, email, role: "viewer", stream_id: null }])
        .throwOnError();

      alert("Проверь почту — подтверждение отправлено!");
      return;
    }

    // --- Авторизация ---
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return setError(error.message);

    // --- Загружаем профиль пользователя ---
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, stream_id")
      .eq("id", data.user.id)
      .single();

    // --- Если админ ---
    if (profile?.role === "admin") {
      return router.push("/s/kbtusize/home"); // можешь указать дефолтный поток админа
    }

    // --- Если обычный пользователь ---
    if (profile?.stream_id) {
      const { data: stream } = await supabase
        .from("streams")
        .select("slug")
        .eq("id", profile.stream_id)
        .single();

      if (stream?.slug) return router.push(`/s/${stream.slug}/home`);
    }

    // Если нет потока
    return router.push("/no-stream");
  }

  return (
    <div className="container">
      <h1 className="title">{isRegister ? "📝 Регистрация" : "🔐 Вход"}</h1>
      <form onSubmit={handleSubmit} className="login-form">
        <input
          type="email"
          placeholder="Твоя почта"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" className="menu-btn">
          {isRegister ? "Зарегистрироваться" : "Войти"}
        </button>
      </form>
      <button className="link-btn" onClick={() => setIsRegister(!isRegister)}>
        {isRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
      </button>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
