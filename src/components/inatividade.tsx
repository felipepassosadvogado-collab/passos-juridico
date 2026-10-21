"use client";
// Sai do sistema depois de 30 minutos sem uso (mouse, teclado, rolagem, toque), com aviso 1 minuto antes.
// O último uso fica guardado no navegador e vale para todas as abas; se o site ficou fechado por mais de
// 30 minutos, ao abrir de novo pede o login.
import { useEffect, useRef, useState } from "react";
import { useDados } from "@/lib/dados";

const LIMITE = 30 * 60 * 1000, AVISO = 60 * 1000, CHAVE = "passos:ultimo-uso";
const ler = (): number | null => { try { const v = localStorage.getItem(CHAVE); return v ? +v : null; } catch { return null; } };
const gravar = (t: number) => { try { localStorage.setItem(CHAVE, String(t)); } catch { /* sem armazenamento */ } };
export const limparUso = () => { try { localStorage.removeItem(CHAVE); } catch { /* sem armazenamento */ } };

export function Inatividade() {
  const { sb } = useDados();
  const ultimo = useRef(Date.now()); const saindo = useRef(false);
  const [resta, setResta] = useState<number | null>(null);

  useEffect(() => {
    const sair = async () => {
      if (saindo.current) return; saindo.current = true; limparUso();
      try { await sb.auth.signOut(); } catch { /* segue */ }
      try { await fetch("/auth/sair", { method: "POST", redirect: "manual" }); } catch { /* segue */ }
      window.location.href = "/login?erro=inatividade";
    };
    const salvo = ler();
    if (salvo && Date.now() - salvo > LIMITE) { sair(); return; }
    ultimo.current = Date.now(); gravar(ultimo.current);

    let gravado = 0;
    const uso = () => { const t = Date.now(); ultimo.current = t; if (t - gravado > 10000) { gravado = t; gravar(t); } };
    const ev = ["mousemove", "mousedown", "keydown", "wheel", "scroll", "touchstart"] as const;
    for (const e of ev) window.addEventListener(e, uso, { passive: true, capture: true });
    const tique = () => {
      const t = Math.max(ultimo.current, ler() || 0); ultimo.current = t; // outra aba pode ter sido usada
      const r = LIMITE - (Date.now() - t);
      if (r <= 0) sair(); else setResta(r <= AVISO ? Math.ceil(r / 1000) : null);
    };
    const iv = setInterval(tique, 1000);
    const vis = () => { if (document.visibilityState === "visible") tique(); };
    document.addEventListener("visibilitychange", vis);
    return () => { for (const e of ev) window.removeEventListener(e, uso, { capture: true }); clearInterval(iv); document.removeEventListener("visibilitychange", vis); };
  }, [sb]);

  if (resta == null) return null;
  return (
    <div className="modal-bg" style={{ zIndex: 200 }} role="alertdialog" aria-label="Sair por inatividade">
      <div className="modal" style={{ maxWidth: 420, height: "auto" }}>
        <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 12, padding: 22 }}>
          <strong style={{ fontSize: 17 }}>Você ainda está aí?</strong>
          <div className="muted">Por segurança, o sistema sai sozinho depois de 30 minutos sem uso. Saindo em <b style={{ color: "var(--fg)" }}>{resta}s</b>.</div>
          <div className="tools" style={{ justifyContent: "flex-end" }}>
            <button className="btn primary" autoFocus onClick={() => { ultimo.current = Date.now(); gravar(ultimo.current); setResta(null); }}>Continuar conectado</button>
          </div>
        </div>
      </div>
    </div>
  );
}
