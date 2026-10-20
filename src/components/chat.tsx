"use client";
// Chat da equipe: conversa geral e conversas diretas, com a janelinha flutuante em todas as telas.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { bancoCurto, dataBR, dataHoraBR, iniciais, nomeBonito, semAcento } from "@/lib/formato";
import { reduzir } from "@/lib/leitura";
import { soDigitos } from "@/lib/cnj";
import { hojeBR } from "@/lib/prazos";
import { mascaraCnj } from "@/lib/cnj";
import type { Mensagem } from "@/lib/tipos";
import { useJanelas } from "./janelas";
import { Avatar } from "./ui";

export type Conversa = { id: string; nome: string; sub: string };
export const outroDaDm = (c: string, eu: string) => c.slice(3).split(":").find((x) => x !== eu) || null;
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
  const enviar = async (c: string, texto: string, arquivos: File[] = []) => {
    const t = texto.trim(); if (!t && !arquivos.length) return false;
    const linhas: Record<string, unknown>[] = [];
    try {
      for (const f of arquivos.slice(0, 6)) {
        const img = /^image\//.test(f.type); const blob = img && !/gif/.test(f.type) ? await reduzir(f, 2000) : f;
        const ext = img ? (blob.type === "image/jpeg" ? "jpg" : (f.name.split(".").pop() || "png")) : (f.name.split(".").pop() || "bin");
        const caminho = `chat/${c.replace(/[^\w-]/g, "_")}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ext.toLowerCase()}`;
        const up = await sb.storage.from("documentos").upload(caminho, blob, { contentType: blob.type || f.type || undefined });
        if (up.error) throw new Error(/size|large/i.test(up.error.message) ? f.name + " passa de 20 MB." : "Não consegui enviar " + f.name + ".");
        linhas.push({ conversa: c, texto: "", anexo: caminho, anexo_nome: f.name.slice(0, 200), anexo_tipo: blob.type || f.type || null });
      }
    } catch (e) { aviso((e as Error).message); return false; }
    if (linhas.length) linhas[0].texto = t.slice(0, 4000); else linhas.push({ conversa: c, texto: t.slice(0, 4000) });
    const { data, error } = await sb.from("mensagens").insert(linhas).select();
    if (error) { aviso(/anexo/.test(error.message) ? "Falta instalar a etapa 7 (0006_chat_anexos.sql) no Supabase." : msgErro(error, "A mensagem não foi enviada.")); return false; }
    for (const m of data || []) aplicar("mensagens", m); return true;
  };
  return { convs, daConversa, naoLidas, total, marcarLida, enviar };
}

const RE_PROC = /@?\b(\d{7})-?(\d{2})\.?(\d{4})\.?(\d)\.?(\d{2})\.?(\d{4})\b/g;
/** números de processo no texto (citados com @ ou não) viram um cartãozinho que abre o processo */
function TextoComLinks({ t }: { t: string }) {
  const { processos } = useDados(); const j = useJanelas();
  const out: React.ReactNode[] = []; const re = new RegExp(RE_PROC.source, "g"); let i = 0, m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    out.push(t.slice(i, m.index)); const d = m.slice(1).join(""); const p = processos.get(d);
    out.push(p ? <button key={m.index} className="chip-proc" title={"Abrir o processo " + mascaraCnj(d)} onClick={() => j.abrirProcesso(d)}>
      <span className="cp-ic" aria-hidden="true">⚖</span><span className="cp-n">{nomeBonito(p.cliente_nome || "Processo")}</span><span className="cp-s">x {bancoCurto(p.banco)} · {mascaraCnj(d)}</span></button> : m[0]);
    i = m.index + m[0].length;
  }
  out.push(t.slice(i)); return <>{out}</>;
}
/** prévia curta (lista de conversas): troca o número pelo nome do cliente */
export function useResumoMsg() {
  const { processos } = useDados();
  return (m: Pick<Mensagem, "texto" | "anexo" | "anexo_tipo">) => {
    const t = (m.texto || "").replace(new RegExp(RE_PROC.source, "g"), (x, ...g) => { const p = processos.get(g.slice(0, 6).join("")); return p ? "📁 " + nomeBonito(p.cliente_nome || "") : x; });
    return t || (m.anexo ? (/^image/.test(m.anexo_tipo || "") ? "📷 Imagem" : "📎 Arquivo") : "");
  };
}

const urls = new Map<string, { u: string; ate: number }>();
function Anexo({ m }: { m: Mensagem }) {
  const { sb } = useDados(); const [u, setU] = useState<string | null>(urls.get(m.anexo!)?.u || null);
  useEffect(() => {
    const c = urls.get(m.anexo!); if (c && c.ate > Date.now()) { setU(c.u); return; }
    sb.storage.from("documentos").createSignedUrl(m.anexo!, 3600).then(({ data }: { data: { signedUrl: string } | null }) => { if (data?.signedUrl) { urls.set(m.anexo!, { u: data.signedUrl, ate: Date.now() + 50 * 60000 }); setU(data.signedUrl); } });
  }, [m.anexo, sb]);
  const img = /^image\//.test(m.anexo_tipo || "");
  if (img) return <a className="m-img" href={u || "#"} target="_blank" rel="noopener noreferrer" title="Abrir a imagem">{u ? <img src={u} alt={m.anexo_nome || "imagem"} loading="lazy" /> : <span className="m-img-ph">carregando…</span>}</a>;
  return <a className="m-arq" href={u || "#"} target="_blank" rel="noopener noreferrer"><span className="ext">{(m.anexo_nome?.split(".").pop() || "").toUpperCase()}</span>{m.anexo_nome || "arquivo"}</a>;
}

export function Bolhas({ msgs }: { msgs: Mensagem[] }) {
  const { eu, nome } = useDados(); let dia = ""; const hoje = hojeBR();
  return <>{msgs.flatMap((m) => {
    const d = new Date(m.em).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }); const out: React.ReactNode[] = [];
    if (d !== dia) { dia = d; out.push(<div key={"d" + m.id} className="chat-dia">{d === hoje ? "Hoje" : dataBR(d)}</div>); }
    const meu = m.de === eu.id;
    out.push(<div key={m.id} className={"msg" + (meu ? " meu" : "")}>{!meu && <Avatar id={m.de} pequeno />}
      <div className="bolha">{!meu && <div className="mautor">{nome(m.de)}</div>}{m.anexo && <Anexo m={m} />}{m.texto && <div className="mtexto"><TextoComLinks t={m.texto} /></div>}<div className="mhora">{dataHoraBR(m.em).slice(11)}</div></div></div>);
    return out;
  })}</>;
}

/** o trecho depois de "@" que está sendo digitado (até 4 palavras), ou um número de processo em digitação */
function termoMencao(antes: string): { ini: number; q: string } | null {
  const m = /(?:^|[\s(])@([^\s@]*(?: [^\s@]+){0,3})$/.exec(antes);
  if (m) return { ini: antes.length - m[1].length - 1, q: m[1] };
  const n = /(?:^|\s)(\d[\d.-]{4,24})$/.exec(antes);
  if (n && soDigitos(n[1]).length >= 5 && soDigitos(n[1]).length < 20) return { ini: antes.length - n[1].length, q: n[1] };
  return null;
}

export function Compositor({ conversa, placeholder, onEnviada }: { conversa: string; placeholder: string; onEnviada?: () => void }) {
  const { enviar } = useChat(); const { processos, v } = useDados();
  const [t, setT] = useState(""); const ref = useRef<HTMLTextAreaElement>(null); const arq = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]); const [enviando, setEnviando] = useState(false);
  const [men, setMen] = useState<{ ini: number; fim: number; q: string } | null>(null); const [sel, setSel] = useState(0);
  const sugestoes = useMemo(() => {
    if (!men) return [];
    const q = semAcento(men.q.trim()), dg = soDigitos(men.q);
    const l = [...processos.values()].filter((p) => (q.length >= 2 && semAcento(p.cliente_nome || "").includes(q)) || (dg.length >= 4 && p.numero.includes(dg)) || (!q && !dg));
    return l.sort((a, b) => (a.cliente_nome || "").localeCompare(b.cliente_nome || "")).slice(0, 7);
  }, [men, processos, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const altura = () => { const e = ref.current; if (e) { e.style.height = "auto"; e.style.height = Math.min(e.scrollHeight, 160) + "px"; } };
  const olhar = (valor: string, cursor: number) => { const r = termoMencao(valor.slice(0, cursor)); setMen(r ? { ini: r.ini, fim: cursor, q: r.q } : null); setSel(0); };
  const escolher = (numero: string) => {
    if (!men) return; const p = processos.get(numero); if (!p) return;
    const ins = "@" + p.mascara + " "; const novo = t.slice(0, men.ini) + ins + t.slice(men.fim);
    setT(novo); setMen(null);
    requestAnimationFrame(() => { const e = ref.current; if (e) { e.focus(); const c = men.ini + ins.length; e.setSelectionRange(c, c); altura(); } });
  };
  const citados = useMemo(() => { const out: string[] = []; const re = new RegExp(RE_PROC.source, "g"); let m; while ((m = re.exec(t))) { const d = m.slice(1).join(""); if (processos.has(d) && !out.includes(d)) out.push(d); } return out; }, [t, processos]);
  const anexar = (l: File[]) => { const ok = l.filter((f) => /^image\//.test(f.type) || /pdf|word|sheet|excel|text/.test(f.type)); if (ok.length < l.length) { /* tipos não aceitos ficam de fora */ } setFiles((x) => [...x, ...ok].slice(0, 6)); };
  const ir = async () => {
    if (enviando) return; const x = t; const fs = files; if (!x.trim() && !fs.length) return;
    setEnviando(true); setT(""); setFiles([]); setMen(null); if (ref.current) ref.current.style.height = "auto";
    const ok = await enviar(conversa, x, fs); setEnviando(false);
    if (!ok) { setT(x); setFiles(fs); } else onEnviada?.();
  };
  return (
    <div className="chat-comp-w" onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) e.preventDefault(); }} onDrop={(e) => { if (e.dataTransfer.files.length) { e.preventDefault(); anexar(Array.from(e.dataTransfer.files)); } }}>
      {men && sugestoes.length > 0 && <div className="mencao" role="listbox" aria-label="Processos">
        <div className="mencao-h">{men.q ? "Processos" : "Digite o nome do cliente ou o número"}</div>
        {sugestoes.map((p, i) => <button key={p.numero} role="option" aria-selected={i === sel} className={i === sel ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); escolher(p.numero); }} onMouseEnter={() => setSel(i)}>
          <span className="mn">{nomeBonito(p.cliente_nome || "—")}</span><span className="ms">x {bancoCurto(p.banco)} · <span className="mono">{p.mascara}</span></span></button>)}
      </div>}
      {(citados.length > 0 || files.length > 0) && <div className="comp-extra">
        {citados.map((d) => { const p = processos.get(d)!; return <span key={d} className="pill acc">⚖ {nomeBonito(p.cliente_nome || "")}</span>; })}
        {files.map((f, i) => <span key={i} className="comp-arq">{/^image\//.test(f.type) ? <img src={URL.createObjectURL(f)} alt="" /> : <span className="ext">{(f.name.split(".").pop() || "").toUpperCase()}</span>}
          <span className="an">{f.name}</span><button className="icb" title="Tirar" aria-label={"Tirar " + f.name} onClick={() => setFiles(files.filter((_, j) => j !== i))}>✕</button></span>)}
      </div>}
      <div className="chat-comp">
        <button className="icb" title="Anexar imagem ou arquivo (ou cole um print com Ctrl+V)" aria-label="Anexar" onClick={() => arq.current?.click()}>
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 9.5l-5.8 5.8a3.6 3.6 0 0 1-5.1-5.1l6.4-6.4a2.4 2.4 0 0 1 3.4 3.4l-6.3 6.3a1.2 1.2 0 0 1-1.7-1.7l5.7-5.7"/></svg></button>
        <button className="icb" title="Citar um processo (ou digite @ e o nome do cliente)" aria-label="Citar processo" onClick={() => { const e = ref.current; const c = e?.selectionStart ?? t.length; const pre = c > 0 && !/\s/.test(t[c - 1]) ? " @" : "@"; const novo = t.slice(0, c) + pre + t.slice(c); setT(novo); requestAnimationFrame(() => { if (e) { e.focus(); const k = c + pre.length; e.setSelectionRange(k, k); olhar(novo, k); } }); }}>@</button>
        <input ref={arq} type="file" hidden multiple accept="image/*,application/pdf,.docx,.xlsx" onChange={(e) => { anexar(Array.from(e.target.files || [])); e.target.value = ""; }} />
        <textarea ref={ref} rows={1} value={t} placeholder={placeholder}
          onChange={(e) => { setT(e.target.value); altura(); olhar(e.target.value, e.target.selectionStart); }}
          onClick={(e) => olhar(t, e.currentTarget.selectionStart)} onBlur={() => setTimeout(() => setMen(null), 150)}
          onPaste={(e) => { const fs = Array.from(e.clipboardData.files || []); if (fs.length) { e.preventDefault(); anexar(fs); } }}
          onKeyDown={(e) => {
            if (men && sugestoes.length) {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((sel + 1) % sugestoes.length); return; }
              if (e.key === "ArrowUp") { e.preventDefault(); setSel((sel - 1 + sugestoes.length) % sugestoes.length); return; }
              if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); escolher(sugestoes[sel].numero); return; }
              if (e.key === "Escape") { e.preventDefault(); setMen(null); return; }
            }
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ir(); }
          }} />
        <button className="btn primary" disabled={enviando} onClick={ir}>{enviando ? "Enviando…" : "Enviar"}</button>
      </div>
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
  const pathname = usePathname(); const { convs, naoLidas, total, daConversa } = useChat(); const { eu } = useDados(); const resumo = useResumoMsg();
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
            return <button key={x.id} className="chat-conv" onClick={() => setConv(x.id)}>{x.id === "geral" ? <span className="avr">#</span> : <Avatar id={outroDaDm(x.id, eu.id)} nome={x.nome} />}
              <span className="cc"><span className="cn">{x.nome}</span><span className="cs">{ult ? (ult.de === eu.id ? "Você: " : "") + resumo(ult).slice(0, 50) : x.sub}</span></span>{n ? <span className="count hot">{n}</span> : null}</button>; })}</div>}
      </div>}
      <button className="cf-botao" title={aberto ? "Fechar o chat" : "Abrir o chat"} aria-label="Chat" onClick={() => setAberto(!aberto)}>
        <svg viewBox="0 0 20 20" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3.5 5.5A2 2 0 0 1 5.5 3.5h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-3.5 3v-3h0a2 2 0 0 1-2-2z" /></svg>
        {total > 0 && !aberto && <span className="count hot">{total}</span>}
      </button>
    </div>
  );
}
