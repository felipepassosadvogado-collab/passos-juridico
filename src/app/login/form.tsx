"use client";
import { useActionState, useState } from "react";
import { entrar, esqueciSenha } from "./acoes";

export function FormLogin({ de }: { de: string }) {
  const [esqueci, setEsqueci] = useState(false);
  const [st, acao, enviando] = useActionState(entrar, null);
  const [st2, acao2, enviando2] = useActionState(esqueciSenha, null);
  if (esqueci) return (
    <form action={acao2} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label className="f">E-mail<input name="email" type="email" autoComplete="email" required /></label>
      {st2?.erro && <div className="banner erro">{st2.erro}</div>}
      {st2?.ok && <div className="banner ok">{st2.ok}</div>}
      <button className="btn primary" disabled={enviando2}>{enviando2 ? "Enviando…" : "Enviar link"}</button>
      <button type="button" className="btn ghost" onClick={() => setEsqueci(false)}>Voltar</button>
    </form>
  );
  return (
    <form action={acao} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <input type="hidden" name="de" value={de} />
      <label className="f">E-mail<input name="email" type="email" autoComplete="email" required /></label>
      <label className="f">Senha<input name="senha" type="password" autoComplete="current-password" required /></label>
      {st?.erro && <div className="banner erro">{st.erro}</div>}
      <button className="btn primary" disabled={enviando}>{enviando ? "Entrando…" : "Entrar"}</button>
      <button type="button" className="btn ghost" onClick={() => setEsqueci(true)}>Esqueci a senha</button>
    </form>
  );
}
