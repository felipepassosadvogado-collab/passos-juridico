"use client";
import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseNavegador } from "@/lib/supabase/client";

// Link do e-mail de convite ou de nova senha. O Supabase pode mandar a sessão de três jeitos:
// no fragmento (#access_token=…), como ?token_hash=… ou como ?code=…. Os três são tratados aqui.
export default function Confirmar() {
  const [erro, setErro] = useState("");
  useEffect(() => {
    (async () => {
      const q = new URLSearchParams(window.location.search);
      const h = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const sb = supabaseNavegador();
      const falha = h.get("error_description") || q.get("error_description");
      if (falha) { setErro(/expired|invalid/i.test(falha) ? "Este link já foi usado ou expirou." : "O link não funcionou."); return; }
      let error: unknown = null;
      if (h.get("access_token") && h.get("refresh_token")) {
        ({ error } = await sb.auth.setSession({ access_token: h.get("access_token")!, refresh_token: h.get("refresh_token")! }));
      } else if (q.get("token_hash") && q.get("type")) {
        ({ error } = await sb.auth.verifyOtp({ token_hash: q.get("token_hash")!, type: q.get("type") as EmailOtpType }));
      } else if (q.get("code")) {
        ({ error } = await sb.auth.exchangeCodeForSession(q.get("code")!));
      } else {
        const { data } = await sb.auth.getSession();
        if (!data.session) error = new Error("sem sessão");
      }
      if (error) { setErro("Este link já foi usado ou expirou."); return; }
      window.history.replaceState(null, "", "/auth/confirmar");
      window.location.replace("/auth/nova-senha");
    })();
  }, []);
  return (
    <div className="login"><div className="caixa">
      {erro ? <>
        <h1 style={{ fontSize: 26 }}>Link inválido</h1>
        <div className="banner erro">{erro}</div>
        <div className="muted" style={{ fontSize: 14 }}>Na tela de entrada, use <b>Esqueci a senha</b> com o seu e-mail para receber um link novo.</div>
        <a className="btn primary" href="/login">Ir para a entrada</a>
      </> : <h1 style={{ fontSize: 24 }}>Confirmando…</h1>}
    </div></div>
  );
}
