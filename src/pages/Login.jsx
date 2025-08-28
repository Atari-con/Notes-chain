import { useState } from "react";
import { supabase } from "../supabaseClient";

export default function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [isRegister, setIsRegister] = useState(false); // режим: вход или регистрация

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);

    if (isRegister) {
      // 🔹 Регистрация
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      // Создаём запись в profiles
      await supabase.from("profiles").insert([{ email, role: "user" }]);

      alert("Проверь почту — подтверждение отправлено!");
    } else {
      // 🔹 Вход
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError(error.message);
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("email", email)
        .single();

      if (profileError) {
        setError("Не удалось получить профиль");
        return;
      }

      if (onLogin) {
        onLogin({ email, role: profile.role });
      }
    }
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
        <button type="submit" className="menu-btn">
          {isRegister ? "Зарегистрироваться" : "Войти"}
        </button>
      </form>

      <button
        className="link-btn"
        onClick={() => setIsRegister(!isRegister)}
      >
        {isRegister ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Зарегистрироваться"}
      </button>

      {error && <p className="error">{error}</p>}
    </div>
  );
}

