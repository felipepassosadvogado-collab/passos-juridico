"use client";
// Chat da equipe: conversa geral e conversas diretas, com a janelinha flutuante em todas as telas.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataBR, dataHoraBR, iniciais } from "@/lib/formato";
import { hojeBR } from "@/lib/prazos";
import { mascaraCnj } from "@/lib/cnj";
import type { Mensagem } from "@/lib/tipos";

export type Conversa = { id: string; nome: string; sub: string };
export const idDm = (a: string, b: string) => "dm:" + [a, b].sort().join(":");

export function useChat() {
  const d = useDados(); const { mensagens, lidas, eu, equipe, sb, aviso, aplicar, marcarLidaLocal, v } = d;
  const convs = useMemo<Conversa[]>(() => [{ id: "geral", nome: "Equipe", sub: "Todos do escritório" },
    ...equipe.filter((p) => p.id !== eu.id && p.ativo).map((p) => ({ id: idDm(eu.id, p.id), nome: p.nome, sub: p.funcao || "Conversa direta" }))], [equipe, eu.id]);
  const todas = useMemo(() => [...mensagens.values()].sort((a, b) => a.em.localeCompare(b.em)), [mensagens, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const daConversa = (c: string) => todas.filter((m) => m.conversa === c);
  const naoLidas = (c: string) => todas.filter((m) => m.conversa === c && m.de !== eu.id && m.em > (lidas[c] || "")).length;
  const total = convs.reduce((s, c) => s + naoLidas(c.id), 0);
  const marcarLida = async (c: string) => {
    const ult = daConversa(c).slice(-1)[0]; if (!ult || (lidas[c] || "") >= ult.em) return;
    marcarLidaLocal(c, ult.em);
    await sb.from("mensagens_lidas").upsert({ usuario: eu.id, conversa: c, ate: ult.em }, { onConflict: "usuario,conversa" });
  };
  const enviar = async (c: string, texto: string) => {
    const t = texto.trim(); if (!t) return false;
    const { data, error } = await sb.from("mensagens").insert({ conversa: c, texto: t.slice(0, 4000) }).select().single();
    if (error) { aviso(msgErro(error, "A mensagem não foi enviada.")); return false; }
    aplicar("mensagens", data); return true;
  };
  return { convs, daConversa, naoLidas, total, marcarLida, enviar };
}

/** números de processo no texto viram links para a ficha */
function TextoComLinks({ t }: { t: string }) {
  const { processos } = useDados();
  const out: React.ReactNode[] = []; const re = /\b(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})\b/g; let i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    out.push(t.slice(i, m.index)); const d = m.slice(1).join("");
    out.push(processos.has(d) ? <Link key={m.index} className="reflink inl" href={"/processos/" + d}>{mascaraCnj(d)}</Link> : m[0]); i = m.index + m[0].length;
  }
  out.push(t.slice(i)); return <>{out}</>;
}

export function Bolhas({ msgs }: { msgs: Mensagem[] }) {
  const { eu, nome } = useDados(); let dia = ""; const hoje = hojeBR();
  return <>{msgs.flatMap((m) => {
    const d = new Date(m.em).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); const out: React.ReactNode[] = [];
    if (d !== dia) { dia = d; out.push(<div key={"d" + m.id} className="chat-dia">{d === hoje ? "Hoje" : dataBR(d)}</div>); }
    const meu = m.de === eu.id;
    out.push(<div key={m.id} className={"msg" + (meu ? " meu" : "")}>{!meu && <span className="avr sm">{iniciais(nome(m.de))}</span>}
      <div className="bolha">{!meu && <div className="mautor">{nome(m.de)}</div>}<div className="mtexto"><TextoComLinks t={m.texto} /></div><div className="mhora">{dataHoraBR(m.em).slice(11)}</div></div></div>);
    return out;
  })}</>;
}

export function Compositor({ conversa, placeholder, onEnviada }: { conversa: string; placeholder: string; onEnviada?: () => void }) {
  const { enviar } = useChat(); const [t, setT] = useState(""); const ref = useRef<HTMLTextAreaElement>(null);
  const ir = async () => { const x = t; setT(""); if (ref.current) ref.current.style.height = "auto"; if (!(await enviar(conversa, x))) setT(x); else onEnviada?.(); };
  return (
    <div className="chat-comp">
      <textarea ref={ref} rows={1} value={t} placeholder={placeholder} onChange={(e) => { setT(e.target.value); e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px"; }}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ir(); } }} />
      <button className="btn primary" onClick={ir}>Enviar</button>
    </div>
  );
}

/** fio de mensagens que desce sozinho para a última quando chega mensagem nova */
export function Fio({ conversa, vazio }: { conversa: string; vazio: string }) {
  const { daConversa, marcarLida } = useChat(); const msgs = daConversa(conversa);
  const ref = useRef<HTMLDivElement>(null); const noFundo = useRef(true);
  useLayoutEffect(() => { const f = ref.current; if (f && noFundo.current) f.scrollTop = f.scrollHeight; }, [msgs.length, conversa]);
  useEffect(() => { marcarLida(conversa); }, [conversa, msgs.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="chat-fio" ref={ref} onScroll={(e) => { const x = e.currentTarget; noFundo.current = x.scrollHeight - x.scrollTop - x.clientHeight < 60; }}>
      {msgs.length ? <Bolhas msgs={msgs} /> : <div className="empty">{vazio}</div>}
    </div>
  );
}

export function ChatFlutuante() {
  const pathname = usePathname(); const { convs, naoLidas, total, daConversa } = useChat(); const { eu } = useDados();
  const [aberto, setAberto] = useState(false); const [conv, setConv] = useState<string | null>(null);
  if (pathname.startsWith("/chat")) return null;
  const c = conv ? convs.find((x) => x.id === conv) : undefined;
  return (
    <div className="chat-flut">
      {aberto && <div className="cf-janela" role="dialog" aria-label="Chat">
        <header className="cf-topo">
          {c && <button className="icb" title="Voltar às conversas" onClick={() => setConv(null)}>‹</button>}
          <strong>{c ? c.nome : "Conversas"}</strong>
          <span style={{ marginLeft: "auto", display: "flex", gap: 2 }}>
            <Link className="icb" title="Abrir o chat em tela cheia" href={"/chat" + (c ? "?c=" + encodeURIComponent(c.id) : "")} onClick={() => setAberto(false)}>⤢</Link>
            <button className="icb" title="Minimizar" onClick={() => setAberto(false)}>–</button></span>
        </header>
        {c ? <><Fio conversa={c.id} vazio="Nenhuma mensagem ainda." /><Compositor conversa={c.id} placeholder="Mensagem…" /></> :
          <div className="cf-lista">{convs.map((x) => { const n = naoLidas(x.id); const ult = daConversa(x.id).slice(-1)[0];
            return <button key={x.id} className="chat-conv" onClick={() => setConv(x.id)}><span className="avr">{x.id === "geral" ? "#" : iniciais(x.nome)}</span>
              <span className="cc"><span className="cn">{x.nome}</span><span className="cs">{ult ? (ult.de === eu.id ? "Você: " : "") + ult.texto.slice(0, 50) : x.sub}</span></span>{n ? <span className="count hot">{n}</span> : null}</button>; })}</div>}
      </div>}
      <button className="cf-botao" title={aberto ? "Fechar o chat" : "Abrir o chat"} aria-label="Chat" onClick={() => setAberto(!aberto)}>
        <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 5.5A2 2 0 0 1 5.5 3.5h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-3.5 3v-3h0a2 2 0 0 1-2-2z" /></svg>
        {total > 0 && !aberto && <span className="count hot">{total}</span>}
      </button>
    </div>
  );
}
