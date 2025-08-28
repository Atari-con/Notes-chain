import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  async function handleLogin(e) {
    e.preventDefault();
    setError(null);

    // авторизация
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      return;
    }

    // получаем профиль из таблицы profiles
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("email", email)
      .single();

    if (profileError) {
      setError("Не удалось получить профиль");
      return;
    }

    // передаем наверх, что юзер залогинен и какая у него роль
    if (onLogin) {
      onLogin({ email, role: profile.role });
    }
  }

  return (
    <div className="container">
      <h1 className="title">🔐 Вход</h1>
      <form onSubmit={handleLogin} className="login-form">
        <input
          type="email"
          placeholder="Твоя почта"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="input"
        />
        <input
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="input"
        />
        <button type="submit" className="menu-btn">Войти</button>
      </form>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

