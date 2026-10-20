"use client";
import { useState } from "react";
import { supabaseNavegador } from "@/lib/supabase/client";

export default function NovaSenha() {
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const [enviando, setEnviando] = useState(false);
  async function salvar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget); const s = String(f.get("s") || ""), s2 = String(f.get("s2") || "");
    if (s.length < 10) return setMsg({ t: "Use pelo menos 10 caracteres.", ok: false });
    if (s !== s2) return setMsg({ t: "As duas senhas não são iguais.", ok: false });
    setEnviando(true);
    const { error } = await supabaseNavegador().auth.updateUser({ password: s });
    setEnviando(false);
    if (error) return setMsg({ t: "Não foi possível salvar. Abra o link do e-mail de novo.", ok: false });
    window.location.href = "/";
  }
  return (
    <div className="login"><form className="caixa" onSubmit={salvar}>
      <h1 style={{ fontSize: 28 }}>Crie sua senha</h1>
      <label className="f">Nova senha<input name="s" type="password" autoComplete="new-password" required /></label>
      <label className="f">Repita a senha<input name="s2" type="password" autoComplete="new-password" required /></label>
      {msg && <div className={"banner " + (msg.ok ? "ok" : "erro")}>{msg.t}</div>}
      <button className="btn primary" disabled={enviando}>{enviando ? "Salvando…" : "Salvar e entrar"}</button>
    </form></div>
  );
}
