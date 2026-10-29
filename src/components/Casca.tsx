"use client";
import { AlertaDjen } from "./djen";
// Casca do sistema: menu lateral com contadores, barra superior com busca, sino e "Adicionar".
import { useWaConversas } from "@/components/whatsapp";
import { Inatividade, limparUso } from "@/components/inatividade";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDados } from "@/lib/dados";
import { bancoCurto, dataHoraBR, iniciais, nomeBonito, semAcento } from "@/lib/formato";
import { hojeBR } from "@/lib/prazos";
import { soDigitos } from "@/lib/cnj";
import { useJanelas } from "./janelas";
import { Avatar } from "./ui";
import { useChat, ChatFlutuante } from "./chat";

const I = (d: string) => <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
const ICONES: Record<string, string> = {
  "/whatsapp": '<path d="M3.2 16.8l1-3.3A7 7 0 1 1 7 16.1z"/><path d="M7.6 6.9c.2-.4.5-.4.8-.4h.4c.2 0 .4.1.5.4l.6 1.4c.1.2 0 .5-.1.6l-.5.6c.5 1 1.3 1.8 2.3 2.3l.6-.5c.2-.1.4-.2.6-.1l1.4.6c.3.1.4.3.4.5v.4c0 .3 0 .6-.4.8-.6.4-1.4.5-2.1.2a8 8 0 0 1-4.7-4.7c-.3-.7-.2-1.5.2-2.1z"/>',
  "/": '<rect x="3" y="3" width="6" height="6" rx="1.5"/><rect x="11" y="3" width="6" height="6" rx="1.5"/><rect x="3" y="11" width="6" height="6" rx="1.5"/><rect x="11" y="11" width="6" height="6" rx="1.5"/>',
  "/agenda": '<rect x="3" y="4" width="14" height="13" rx="2"/><path d="M3 8h14M7 2.5v3M13 2.5v3"/><path d="M6.5 11h2M11.5 11h2M6.5 14h2"/>',
  "/meus": '<circle cx="8" cy="7" r="3"/><path d="M2.5 16.5c.8-2.8 3-4.2 5.5-4.2 1.3 0 2.5.4 3.4 1.1"/><path d="M12.5 15l2 2 3.5-4"/>',
  "/publicacoes": '<path d="M3 11l2-6.5h10L17 11v4.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 11h4l1 2h4l1-2h4"/>',
  "/atividades": '<rect x="3" y="3" width="14" height="14" rx="2.5"/><path d="M6.5 10l2.5 2.5 4.5-5"/>',
  "/gestao": '<path d="M3 16.5h14"/><path d="M5.5 13.5V9.5M10 13.5V5.5M14.5 13.5V8"/>',
  "/chat": '<path d="M3.5 5.5A2 2 0 0 1 5.5 3.5h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-3.5 3v-3h0a2 2 0 0 1-2-2z"/>',
  "/crm": '<rect x="2.5" y="3" width="4" height="14" rx="1.2"/><rect x="8" y="3" width="4" height="9" rx="1.2"/><rect x="13.5" y="3" width="4" height="11.5" rx="1.2"/>',
  "/processos": '<path d="M2.5 6V15a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V8a1.5 1.5 0 0 0-1.5-1.5H10L8.5 4.5H4A1.5 1.5 0 0 0 2.5 6z"/>',
  "/clientes": '<circle cx="7.5" cy="7" r="2.8"/><path d="M2.5 16c.6-2.6 2.6-4 5-4s4.4 1.4 5 4"/><circle cx="14" cy="7.5" r="2.2"/><path d="M14.5 12c1.6.3 2.7 1.5 3 3.5"/>',
  "/equipe": '<circle cx="10" cy="7" r="3"/><path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"/>',
  "/configuracoes": '<circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1L4.7 4.7"/>',
  "/importar": '<path d="M10 3v10M6 9l4 4 4-4"/><path d="M3.5 14.5v2h13v-2"/>',
};

function Menu() {
  const p = usePathname(); const { tarefas, caixa, processos, clientes, notificacoes, avisos, eu, titular, v } = useDados(); const { total } = useChat(); const wa = useWaConversas();
  const c = useMemo(() => {
    const hoje = hojeBR(); const abertas = [...tarefas.values()].filter((t) => t.status !== "feito");
    const minhas = abertas.filter((t) => t.responsavel === eu.id || (t.status === "revisao" && t.revisor === eu.id));
    return {
      abertas: abertas.length, vencidas: abertas.some((t) => t.vencimento && t.vencimento <= hoje),
      meus: minhas.length + caixa.size + [...notificacoes.values()].filter((n) => !n.lida).length,
      meusHot: minhas.some((t) => t.vencimento && t.vencimento <= hoje),
    };
  }, [tarefas, caixa, notificacoes, avisos, eu.id, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const itens: [string, string, number?, boolean?][] = [
    ["/whatsapp", "WhatsApp", wa.naoLidas, true],
    ["/", "Painel", c.meus, c.meusHot], ["/agenda", "Agenda", c.abertas, c.vencidas], ["/publicacoes", "Publicações", caixa.size, caixa.size > 0],
    ...(titular ? [["/gestao", "Gestão"] as [string, string]] : []),
    ["/chat", "Chat", total, true], ["/crm", "CRM"], ["/processos", "Processos", processos.size], ["/clientes", "Clientes", clientes.size],
  ];
  const adm: [string, string][] = [["/equipe", "Equipe"], ...(titular ? [["/configuracoes", "Configurações"], ["/importar", "Importar dados"]] as [string, string][] : [])];
  const ativo = (h: string) => (h === "/" ? p === "/" : p.startsWith(h));
  const item = ([h, t, n, hot]: [string, string, number?, boolean?]) => (
    <Link key={h} href={h} aria-current={ativo(h) ? "page" : undefined} title={t} aria-label={t + (n ? `, ${n}` : "")}>{I(ICONES[h])}<span className="lbl">{t}</span>
      {n !== undefined && <span className={"count" + (hot ? " hot" : "") + (n ? "" : " zero")} data-curto={n > 99 ? "99+" : String(n)}>{n}</span>}</Link>
  );
  return <nav className="rail" aria-label="Seções">{itens.map(item)}<div className="sep" />{adm.map(item)}</nav>;
}

type Achado = { chave: string; tipo: "cliente" | "processo"; id: string; t: string; s: string[] };
const ICB = {
  pessoa: '<circle cx="10" cy="7" r="3.2"/><path d="M3.8 17c.8-3.2 3.3-5 6.2-5s5.4 1.8 6.2 5"/>',
  pasta: '<path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3.6l1.6 2h6.8a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z"/>',
  novoProc: '<path d="M2.5 5.5a1.5 1.5 0 0 1 1.5-1.5h3.6l1.6 2h6.8a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H4a1.5 1.5 0 0 1-1.5-1.5z"/><path d="M10 9v5M7.5 11.5h5"/>',
  inicial: '<path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5V6h3.5M7.5 10h5M7.5 13h5"/>',
  claude: '<path d="M10 2.5l1.7 5 5.3.1-4.2 3.2 1.5 5.1L10 12.9l-4.3 3 1.5-5.1L3 7.6l5.3-.1z"/>',
  tarefa: '<rect x="3.5" y="3.5" width="13" height="13" rx="2.5"/><path d="M7 10l2.2 2.2L13.5 8"/>',
};
/** destaca no texto o trecho pesquisado (sem ligar para acento e maiúsculas) */
function Marca({ txt, q }: { txt: string; q: string }) {
  if (q.length < 2) return <>{txt}</>;
  const i = semAcento(txt).indexOf(q); if (i < 0) return <>{txt}</>;
  return <>{txt.slice(0, i)}<mark className="gmark">{txt.slice(i, i + q.length)}</mark>{txt.slice(i + q.length)}</>;
}

function Busca() {
  const { clientes, processos } = useDados(); const router = useRouter(); const j = useJanelas();
  const [q, setQ] = useState(""); const [aberta, setAberta] = useState(false); const [sel, setSel] = useState(0); const [aba, setAba] = useState<"tudo" | "cliente" | "processo">("tudo");
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement as HTMLElement)?.tagName || "")) { e.preventDefault(); ref.current?.focus(); } };
    document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k);
  }, []);
  const n = semAcento(q.trim()), d = soDigitos(q);
  const todos = useMemo(() => {
    const out: Achado[] = []; if (n.length < 2 && d.length < 4) return out;
    const porCli = new Map<string, number>(); for (const p of processos.values()) if (p.cliente_id) porCli.set(p.cliente_id, (porCli.get(p.cliente_id) || 0) + 1);
    let nc = 0;
    for (const c of clientes.values()) {
      if (!(semAcento(c.nome).includes(n) || (d.length >= 4 && (soDigitos(c.cpf).includes(d) || soDigitos(c.telefone).includes(d))))) continue;
      const np = porCli.get(c.id) || 0;
      out.push({ chave: "c" + c.id, tipo: "cliente", id: c.id, t: nomeBonito(c.nome), s: [[c.cpf, c.telefone].filter(Boolean).join(" · "), np ? np + (np === 1 ? " processo" : " processos") : "sem processo"].filter(Boolean) });
      if (++nc >= 30) break;
    }
    let npr = 0;
    for (const p of processos.values()) {
      if (!(semAcento(p.cliente_nome).includes(n) || (d.length >= 4 && p.numero.includes(d)))) continue;
      out.push({ chave: "p" + p.numero, tipo: "processo", id: p.numero, t: nomeBonito(p.cliente_nome || "—") + " x " + bancoCurto(p.banco), s: [p.mascara, p.orgao || ""].filter(Boolean) });
      if (++npr >= 30) break;
    }
    return out;
  }, [n, d, clientes, processos]);
  const nCli = todos.filter((x) => x.tipo === "cliente").length, nProc = todos.length - nCli;
  const res = aba === "tudo" ? todos : todos.filter((x) => x.tipo === aba);
  const fechar = () => { setAberta(false); setQ(""); ref.current?.blur(); };
  const ir = (x: Achado) => { fechar(); if (x.tipo === "processo") j.abrirProcesso(x.id); else router.push("/clientes/" + x.id); };
  const acoes = (x: Achado): [string, string, () => void][] => {
    if (x.tipo === "cliente") return [
      ["Novo processo para este cliente", ICB.novoProc, () => j.novoProcesso({ clienteId: x.id })],
      ["Petição (inicial ou intermediária)", ICB.inicial, () => j.abrirInicial({ clienteId: x.id })],
    ];
    return [
      ["Petição intermediária (o Claude redige neste processo)", ICB.claude, () => j.gerarPeca({ numero: x.id })],
      ["Nova tarefa neste processo", ICB.tarefa, () => j.novaTarefa(x.id)],
    ];
  };
  return (
    <div className="gsearch" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setAberta(false); }}>
      {I('<circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/>')}
      <input ref={ref} type="search" placeholder="Digite / para pesquisar" aria-label="Pesquisar clientes e processos" autoComplete="off" value={q}
        onChange={(e) => { setQ(e.target.value); setAberta(true); setSel(0); }} onFocus={() => setAberta(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") { setAberta(false); ref.current?.blur(); }
          if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, res.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
          if (e.key === "Enter" && res[sel]) ir(res[sel]);
        }} />
      {aberta && todos.length > 0 && <div className="gres" onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("input")) e.preventDefault(); }}>
        <div className="gabas" role="tablist">
          {([["tudo", "Tudo", todos.length], ["cliente", "Clientes", nCli], ["processo", "Processos", nProc]] as const).map(([k, rot, c]) =>
            <button key={k} role="tab" aria-selected={aba === k} className={"gaba" + (aba === k ? " on" : "")} disabled={!c} onClick={() => { setAba(k); setSel(0); }}>{rot} <span className="gcnt">{c}</span></button>)}
        </div>
        <div className="glista">{res.map((x, i) => (
          <div key={x.chave} className={"gr" + (i === sel ? " sel" : "")} role="button" tabIndex={-1} onMouseEnter={() => setSel(i)} onClick={() => ir(x)}>
            <span className={"gic " + x.tipo} aria-hidden="true">{I(x.tipo === "cliente" ? ICB.pessoa : ICB.pasta)}</span>
            <span className="gtx"><span className="grt"><Marca txt={x.t} q={n} /></span>{x.s.map((l, k) => <span key={k} className="grs">{l}</span>)}</span>
            <span className="gacoes">{acoes(x).map(([tit, ic, f]) => <button key={tit} className="gac" title={tit} aria-label={tit} onClick={(e) => { e.stopPropagation(); fechar(); f(); }}>{I(ic)}</button>)}</span>
          </div>))}</div>
      </div>}
    </div>
  );
}

function Sino() {
  const d = useDados(); const { notificacoes, tarefas, caixa, eu, processos, sb, aplicar, nome, v } = d; const router = useRouter(); const j = useJanelas();
  const [aberto, setAberto] = useState(false); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!aberto) return; const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, [aberto]);
  const corrigir = useMemo(() => [...tarefas.values()].filter((t) => t.status === "revisao" && t.revisor === eu.id).sort((a, b) => (a.vencimento || "9").localeCompare(b.vencimento || "9")), [tarefas, eu.id, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const avs = useMemo(() => [...notificacoes.values()].filter((n) => !(n.tipo === "correcao" && n.tarefa_id && tarefas.get(n.tarefa_id)?.status === "revisao")).sort((a, b) => b.em.localeCompare(a.em)), [notificacoes, tarefas, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const nl = avs.filter((n) => !n.lida);
  const total = nl.length + caixa.size + corrigir.length;
  const lida = async (ids: string[]) => { if (!ids.length) return; const { data } = await sb.from("notificacoes").update({ lida: true }).in("id", ids).select(); for (const x of data || []) aplicar("notificacoes", x); };
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button className="icb" title={total ? `Avisos: ${total} pendente(s)` : "Avisos"} aria-label={total ? `Avisos, ${total} pendente(s)` : "Avisos, nada pendente"} aria-haspopup="true" aria-expanded={aberto} onClick={() => setAberto(!aberto)} onKeyDown={(e) => { if (e.key === "Escape") setAberto(false); }}>{I('<path d="M5 13.5V9a5 5 0 0 1 10 0v4.5l1.5 1.5h-13z"/><path d="M8.5 17a1.5 1.5 0 0 0 3 0"/>')}{total > 0 && <span className="count hot" aria-hidden="true">{total}</span>}</button>
      {aberto && <div className="addmenu notif" onKeyDown={(e) => { if (e.key === "Escape") setAberto(false); }}>
        <div className="nh"><strong>Avisos</strong>{nl.length > 0 && <button className="reflink" onClick={() => lida(nl.map((n) => n.id))}>Marcar todos como lidos</button>}</div>
        {corrigir.length > 0 && <><div className="nsec">Petições para corrigir ({corrigir.length})</div>
          {corrigir.slice(0, 8).map((t) => { const p = t.processo_numero ? processos.get(t.processo_numero) : undefined;
            return <button key={t.id} onClick={() => { setAberto(false); router.push("/?corrigir=" + t.id); }}><span className="nt"><span className="dot laranja" />{t.descricao}</span>
              <span className="ns">{[nomeBonito(p?.cliente_nome || ""), "de " + nome(t.responsavel), t.enviado_em ? dataHoraBR(t.enviado_em) : ""].filter(Boolean).join(" · ")}</span></button>; })}</>}
        {caixa.size > 0 && <><div className="nsec">Publicações</div><button onClick={() => { setAberto(false); router.push("/publicacoes"); }}><span className="nt">{caixa.size} {caixa.size === 1 ? "publicação para ler" : "publicações para ler"}</span><span className="ns">Caixa de publicações do DJEN</span></button></>}
        {avs.length > 0 && <div className="nsec">Avisos</div>}
        {avs.slice(0, 15).map((n) => (
          <button key={n.id} className={n.lida ? "lida" : ""} onClick={() => {
            setAberto(false); if (!n.lida) lida([n.id]);
            if (n.processo_numero) j.abrirProcesso(n.processo_numero, n.tarefa_id ? { aba: "tarefas", alvo: "tar-" + n.tarefa_id } : undefined); else if (n.caso_id) j.abrirCaso(n.caso_id); else if (n.tipo === "whatsapp") router.push("/whatsapp"); else if (n.tipo === "djen") router.push("/processos");
          }}><span className="nt">{!n.lida && <span className="dot" />}{n.texto}</span>
            <span className="ns">{[nomeBonito(n.processo_numero ? processos.get(n.processo_numero)?.cliente_nome || "" : ""), nome(n.de), dataHoraBR(n.em)].filter(Boolean).join(" · ")}</span></button>))}
        {!avs.length && !caixa.size && !corrigir.length && <div className="muted" style={{ padding: "10px 12px" }}>Nenhum aviso.</div>}
      </div>}
    </div>
  );
}

function Adicionar() {
  const [aberto, setAberto] = useState(false); const router = useRouter(); const j = useJanelas(); const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!aberto) return; const f = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); }; document.addEventListener("mousedown", f); return () => document.removeEventListener("mousedown", f); }, [aberto]);
  return (
    <div className="addwrap" ref={ref}>
      <button className="btn primary" aria-haspopup="true" aria-expanded={aberto} aria-label="Adicionar: nova tarefa, agendamento, processo ou cliente" title="Criar uma tarefa, um agendamento, um processo ou um cliente" onClick={() => setAberto(!aberto)} onKeyDown={(e) => { if (e.key === "Escape") setAberto(false); }}><span className="rot">Adicionar <span aria-hidden="true">▾</span></span><span className="mais-ic" aria-hidden="true">+</span></button>
      {aberto && <div className="addmenu" onKeyDown={(e) => { if (e.key === "Escape") setAberto(false); }}>
        <button onClick={() => { setAberto(false); j.novaTarefa(); }}>Nova tarefa</button>
        <button onClick={() => { setAberto(false); j.agendarAto(); }}>Agendar audiência / coleta</button>
        <button onClick={() => { setAberto(false); j.novoProcesso(); }}>Novo processo</button>
        <button onClick={() => { setAberto(false); j.novoCliente(); }}>Novo cliente</button>
      </div>}
    </div>
  );
}

function InfoDjen() {
  const { config } = useDados(); const u = config.djen?.ultimaBusca as string | undefined;
  return <span className="syncinfo" title={config.djen?.ultimoErro ? "Última tentativa falhou: " + config.djen.ultimoErro : "Última busca no DJEN"}>DJEN: {u ? dataHoraBR(u).slice(0, 5) + " " + dataHoraBR(u).slice(11) : "—"}{config.djen?.ultimoErro ? " ⚠" : ""}</span>;
}

/** botão que liga/desliga uma classe no <html> (menu recolhido, tema claro) e diz ao leitor de tela o estado atual */
function BotaoAlterna({ classe, chave, valores, className, rotulo, expandido, children }: { classe: string; chave: string; valores: [string, string]; className: string; rotulo: (ligado: boolean) => string; expandido?: boolean; children: React.ReactNode }) {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(document.documentElement.classList.contains(classe)); }, [classe]);
  const r = rotulo(on);
  return <button className={className} title={r} aria-label={r} {...(expandido ? { "aria-expanded": !on } : { "aria-pressed": on })}
    onClick={() => { const v = document.documentElement.classList.toggle(classe); setOn(v); try { localStorage.setItem(chave, v ? valores[1] : valores[0]); } catch { /* sem armazenamento */ } }}>{children}</button>;
}

export function Casca({ children }: { children: React.ReactNode }) {
  const { eu, pronto, erroCarga } = useDados(); const p = usePathname();
  const cheio = p.startsWith("/crm") || p.startsWith("/chat") || p.startsWith("/whatsapp");
  return (
    <>
      <Menu />
      <div className="railtop">
          <BotaoAlterna classe="rail-fechado" chave="menu" valores={["aberto", "recolhido"]} className="icb railtoggle"
            rotulo={(on) => (on ? "Mostrar o menu lateral" : "Recolher o menu lateral")} expandido>
            {I('<rect x="3" y="4" width="14" height="12" rx="2"/><path d="M8 4v12"/>')}</BotaoAlterna>
          <Link href="/" className="logo" aria-label="Passos Advocacia: ir para o Painel" title="Ir para o Painel"><img src="/marca/fp.png" alt="" width={40} height={35} /><span className="logotxt"><span className="t1">PASSOS</span><span className="t2">ADVOCACIA</span></span></Link>
      </div>
      <div className="col">
        <header className="topbar">
          <Busca />
          <div className="tright">
            <InfoDjen />
            <BotaoAlterna classe="claro" chave="tema" valores={["escuro", "claro"]} className="icb" rotulo={(on) => (on ? "Mudar para o tema escuro" : "Mudar para o tema claro")}>{I('<path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z"/>')}</BotaoAlterna>
            <Sino />
            <Adicionar />
            <span className="ola"><Avatar id={eu.id} /><span className="nome">Olá, <b>{eu.nome.split(/[\s.]/)[0]}</b></span></span>
            <form action="/auth/sair" method="post" onSubmit={limparUso}><button className="btn ghost" title="Sair do sistema">Sair</button></form>
          </div>
        </header>
        <main><div className={"wrap" + (cheio ? " cheio" : "")}><AlertaDjen />
          {erroCarga && <div className="banner erro">{erroCarga}</div>}
          {pronto ? children : <div className="empty"><strong>Carregando os dados do escritório…</strong>Leva poucos segundos.</div>}
        </div></main>
      </div>
      <ChatFlutuante />
      <Inatividade />
    </>
  );
}
