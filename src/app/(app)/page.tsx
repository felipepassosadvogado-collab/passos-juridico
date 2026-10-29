"use client";
import { teclado } from "@/components/ui";
import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDados } from "@/lib/dados";
import { dataBR, dataHoraBR, nomeBonito, semAcento } from "@/lib/formato";
import { diferencaDias, hojeBR } from "@/lib/prazos";
import { atoPub, ehAgenda } from "@/lib/regras";
import { CaixaAgenda } from "@/components/agenda";
import { ListaEnxuta, TabelaTarefas } from "@/components/tarefas";
import { BotaoDjen } from "@/components/djen";
import { useJanelas } from "@/components/janelas";

type Cheia = "" | "minhas" | "corrigir" | "agenda" | "flag";
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const CAIXAS: Record<string, string> = { "sec-agenda": "Audiências e coletas", "sec-avisos": "Avisos novos", "sec-intimacoes": "Ler intimações", "sec-corrigir": "Corrigir peças da equipe", "sec-minhas": "Cumprir minhas tarefas", "sec-flag": "Importantes e urgentes", "sec-equipe": "Prazos da equipe" };
const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

function Painel() {
  const { tarefas, caixa, notificacoes, avisos, processos, eu, sb, aplicar, nome, v } = useDados(); const j = useJanelas(); const router = useRouter();
  const sp = useSearchParams(); const corrigirId = sp.get("corrigir");
  useEffect(() => { if (corrigirId) setTimeout(() => ir("sec-corrigir"), 120); }, [corrigirId]);
  // "Cumprir minhas tarefas" aberto na tela inteira (fica lembrado neste navegador)
  const abriuCorr = useRef(""); const [caixaCheia, setCaixaCheia] = useState<Cheia>(""); const [filtro, setFiltro] = useState("");
  useEffect(() => { try { const v = localStorage.getItem("painel.cheia"); if (v === "minhas" || v === "corrigir" || v === "agenda" || v === "flag") setCaixaCheia(v); } catch { /* sem armazenamento */ } }, []);
  const cheia = (v: Cheia) => { setCaixaCheia(v); setFiltro(""); try { localStorage.setItem("painel.cheia", v); } catch { /* sem armazenamento */ } window.scrollTo({ top: 0 }); };
  // caixas minimizadas no Painel (ficam lembradas neste navegador)
  const [rec, setRec] = useState<string[]>([]);
  useEffect(() => { try { const l = JSON.parse(localStorage.getItem("painel.recolhidas") || "[]"); if (Array.isArray(l)) setRec(l.map(String)); } catch { /* sem armazenamento */ } }, []);
  const gravarRec = (l: string[]) => { setRec(l); try { localStorage.setItem("painel.recolhidas", JSON.stringify(l)); } catch { /* sem armazenamento */ } };
  const recolher = (id: string) => gravarRec(rec.includes(id) ? rec.filter((x) => x !== id) : [...rec, id]);
  const cls = (id: string) => "panel" + (rec.includes(id) ? " recolhida" : "");
  const BtnRec = ({ id, n, auto }: { id: string; n?: number; auto?: boolean }) => (
    <button className="btn ghost rec-btn" style={auto ? { marginLeft: "auto" } : undefined} onClick={() => recolher(id)} aria-expanded={!rec.includes(id)} aria-controls={id}
      aria-label={(rec.includes(id) ? "Expandir a caixa " : "Minimizar a caixa ") + (CAIXAS[id] || "") + (rec.includes(id) && n ? `, ${n} item(ns)` : "")}
      title={rec.includes(id) ? "Mostrar o conteúdo desta caixa" : "Esconder o conteúdo desta caixa (fica lembrado neste navegador)"}>
      {rec.includes(id) ? <>{n != null && n > 0 && <span className="count" aria-hidden="true">{n}</span>}<span aria-hidden="true">▸</span> Expandir</> : <><span aria-hidden="true">▾</span> Minimizar</>}</button>);
  const vai = (id: string) => { if (rec.includes(id)) gravarRec(rec.filter((x) => x !== id)); setTimeout(() => ir(id), 30); };
  const partesTxt = (t: { processo_numero: string | null; caso_id: string | null; descricao: string; tipo: string | null }) => semAcento([t.descricao, t.tipo, t.processo_numero ? processos.get(t.processo_numero)?.cliente_nome : ""].join(" ")).toLowerCase();
  const x = useMemo(() => {
    const t = hojeBR(); const abertas = [...tarefas.values()].filter((y) => y.status !== "feito");
    const minhas = abertas.filter((y) => y.responsavel === eu.id);
    const flag = abertas.filter((y) => y.importante || y.urgente);
    return {
      minhas, flag, venc: minhas.filter((y) => y.vencimento && y.vencimento <= t).length,
      corrigir: abertas.filter((y) => y.status === "revisao" && y.revisor === eu.id),
      q: [["Importante e urgente", flag.filter((y) => y.importante && y.urgente), "Fazer primeiro"], ["Urgente", flag.filter((y) => y.urgente && !y.importante), "Resolver logo, pode delegar"], ["Importante", flag.filter((y) => y.importante && !y.urgente), "Planejar com calma"]] as [string, typeof abertas, string][],
      cx: [...caixa.values()].sort((a, b) => a.data.localeCompare(b.data)),
      nl: [...notificacoes.values()].filter((n) => !n.lida && !(n.tipo === "correcao" && n.tarefa_id && tarefas.get(n.tarefa_id)?.status === "revisao")).sort((a, b) => b.em.localeCompare(a.em)),
      equipe: abertas.filter((y) => y.vencimento && diferencaDias(y.vencimento, t) <= 7).sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || "")),
      eqVenc: abertas.filter((y) => y.vencimento && y.vencimento <= t).length,
    };
  }, [tarefas, caixa, notificacoes, avisos, eu.id, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const dia = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
  const lida = async (id: string) => { const { data } = await sb.from("notificacoes").update({ lida: true }).eq("id", id).select().single(); if (data) aplicar("notificacoes", data); };
  if (caixaCheia) {
    if (corrigirId && abriuCorr.current !== corrigirId) { abriuCorr.current = corrigirId; setTimeout(() => j.abrirTarefa(corrigirId), 0); }
    const q = semAcento(filtro.trim()).toLowerCase();
    const ordena = (l: typeof x.minhas) => [...l].sort((a, b) => (a.vencimento || "9").localeCompare(b.vencimento || "9")).filter((t) => !q || partesTxt(t).includes(q));
    const tit = { minhas: "Cumprir minhas tarefas", corrigir: "Corrigir peças da equipe", agenda: "Audiências e coletas", flag: "Importantes e urgentes" }[caixaCheia];
    const sub = caixaCheia === "corrigir" ? `${x.corrigir.length} ${x.corrigir.length === 1 ? "peça enviada" : "peças enviadas"} para você revisar`
      : caixaCheia === "minhas" ? `${x.minhas.length} em aberto${x.venc ? ` · ${x.venc} vencendo ou vencidas` : ""}`
      : caixaCheia === "flag" ? `${x.flag.length} marcadas, de toda a equipe` : "de toda a equipe";
    const vazio = (base: number, msg: string) => <div className="empty"><strong>{base ? "Nada com esse filtro." : msg}</strong></div>;
    return (
      <>
        <div className="head"><div><h2>{tit}</h2><div className="sub">{sub} · no Painel</div></div>
          <div className="tools">{caixaCheia !== "agenda" && <input className="gs-busca" value={filtro} placeholder="Filtrar por cliente ou tarefa" onChange={(e) => setFiltro(e.target.value)} />}
            <button className="btn" onClick={() => cheia("")} title="Sair da tela inteira e voltar ao Painel completo"><span aria-hidden="true">⤡</span> Voltar ao Painel</button></div></div>
        {caixaCheia === "agenda" ? <CaixaAgenda />
          : caixaCheia === "flag" ? (x.flag.length ? x.q.filter(([, l]) => l.length).map(([t, l, dica]) => { const f = ordena(l as typeof x.minhas); return (
            <section key={t as string} className="panel"><div className="ph"><h3>{t as string}</h3><span className="muted" style={{ fontSize: 12 }}>{dica as string} · {f.length}</span></div>
              {f.length ? <TabelaTarefas lista={f} limite={1000} /> : vazio(1, "")}</section>); }) : <section className="panel">{vazio(0, "Nenhuma tarefa marcada como importante ou urgente.")}</section>)
          : (() => { const base = caixaCheia === "corrigir" ? x.corrigir : x.minhas; const f = ordena(base); return (
            <section className="panel" id={caixaCheia === "corrigir" ? "sec-corrigir" : "sec-minhas"}>
              {f.length ? <TabelaTarefas lista={f} limite={1000} /> : vazio(base.length, caixaCheia === "corrigir" ? "Nada esperando sua correção." : "Nenhuma tarefa sua em aberto.")}</section>); })()}
      </>
    );
  }

  return (
    <>
      <div className="head"><div><h2>Olá, {eu.nome.split(/[\s.]/)[0]}</h2><div className="sub">{dia.charAt(0).toUpperCase() + dia.slice(1)} · o que está com você e com a equipe</div></div><div className="tools"><BotaoDjen /></div></div>
      <div className="stats">
        <Link className="stat" href="/publicacoes"><span className="n">{x.cx.length}</span><span className="l">intimações para ler</span></Link>
        <button className={"stat" + (x.venc ? " late" : "")} onClick={() => vai("sec-minhas")}><span className="n">{x.minhas.length}</span><span className="l">{x.venc ? `${x.minhas.length} minhas, ${x.venc} vencendo ou vencidas` : "tarefas minhas em aberto"}</span></button>
        <button className={"stat" + (x.eqVenc ? " late" : "")} onClick={() => vai("sec-equipe")}><span className="n">{x.equipe.length}</span><span className="l">{x.eqVenc ? `prazos da equipe na semana, ${x.eqVenc} vencendo ou vencidos` : "prazos da equipe nos próximos 7 dias"}</span></button>
        <button className="stat" onClick={() => vai("sec-corrigir")}><span className="n">{x.corrigir.length}</span><span className="l">peças para eu corrigir</span></button>
      </div>
      <div className="pcols"><div className="pcol">
      <CaixaAgenda onAbrir={() => cheia("agenda")} recolhida={rec.includes("sec-agenda")} onRecolher={() => recolher("sec-agenda")} />
      {x.nl.length > 0 && <section className={cls("sec-avisos")} id="sec-avisos"><div className="ph"><h3>Avisos novos</h3><span className="count hot">{x.nl.length}</span><BtnRec id="sec-avisos" auto /></div>
        <div className="rows">{x.nl.slice(0, 8).map((n) => (
          <div key={n.id} className="row click" {...teclado(() => { lida(n.id); if (n.processo_numero) j.abrirProcesso(n.processo_numero, n.tarefa_id ? { aba: "tarefas", alvo: "tar-" + n.tarefa_id } : undefined); else if (n.caso_id) j.abrirCaso(n.caso_id); })} onClick={() => { lida(n.id); if (n.processo_numero) j.abrirProcesso(n.processo_numero, n.tarefa_id ? { aba: "tarefas", alvo: "tar-" + n.tarefa_id } : undefined); else if (n.caso_id) j.abrirCaso(n.caso_id); }}>
            <span className="pill ok">{n.tipo === "protocolo" ? "protocolo" : n.tipo === "tarefa" ? "tarefa" : "aviso"}</span>
            <div className="main"><div className="t">{n.texto}</div><div className="s">{[nomeBonito(n.processo_numero ? processos.get(n.processo_numero)?.cliente_nome || "" : ""), "de " + nome(n.de), dataHoraBR(n.em)].filter(Boolean).join(" · ")}</div></div>
            <button className="btn ghost" title="Marcar este aviso como lido, sem abrir" aria-label="Marcar este aviso como lido" onClick={(e) => { e.stopPropagation(); lida(n.id); }}>Lido</button></div>))}</div></section>}
      <section className={cls("sec-intimacoes")} id="sec-intimacoes"><div className="ph"><h3>1. Ler intimações</h3><Link className="btn ghost" style={{ marginLeft: "auto" }} href="/publicacoes" title="Ir para Publicações, onde as intimações são lidas" aria-label="Abrir a caixa de intimações (Publicações)">Abrir a caixa</Link><BtnRec id="sec-intimacoes" n={x.cx.length} /></div>
        {x.cx.length ? <div className="rows">{x.cx.slice(0, 8).map((c) => { const p = processos.get(c.processo_numero); return (
          <div key={c.id} className="row click" onClick={() => j.abrirPub(c.id)} {...teclado(() => j.abrirPub(c.id))}><span className="pill acc">{dataBR(c.data).slice(0, 5)}</span>
            <div className="main"><div className="t">{nomeBonito(p?.cliente_nome || "") || p?.mascara}</div><div className="s">{atoPub(c)} · {c.orgao || ""}{c.analise ? " · já analisada" : ""}</div></div><span className="mono muted">{p?.mascara}</span></div>); })}
          {x.cx.length > 8 && <div className="row"><span /><div className="s">e mais {x.cx.length - 8} na caixa</div><span /></div>}</div>
          : <div className="empty"><strong>Nenhuma intimação para ler.</strong>A caixa está em dia.</div>}</section>
      </div><div className="pcol">
      <section className={cls("sec-corrigir")} id="sec-corrigir"><div className="ph"><h3>2. Corrigir peças da equipe</h3><span className="muted" style={{ fontSize: 12 }}>enviadas para você revisar</span><button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => cheia("corrigir")} title="Abrir as peças para corrigir na tela inteira" aria-label="Abrir a caixa Corrigir peças da equipe em tela inteira"><span aria-hidden="true">⤢</span> Abrir caixa</button><BtnRec id="sec-corrigir" n={x.corrigir.length} /></div>
        {x.corrigir.length ? <ListaEnxuta key={corrigirId || "c"} lista={x.corrigir} abrirId={corrigirId} /> : <div className="empty"><strong>Nada esperando sua correção.</strong>Quando alguém enviar uma peça para você revisar, ela aparece aqui com o arquivo anexado.</div>}</section>
      <section className={cls("sec-minhas")} id="sec-minhas"><div className="ph"><h3>3. Cumprir minhas tarefas</h3><span className="muted" style={{ fontSize: 12 }}>criadas por você ou pela equipe</span><button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => cheia("minhas")} title="Abrir as suas tarefas na tela inteira" aria-label="Abrir a caixa Cumprir minhas tarefas em tela inteira"><span aria-hidden="true">⤢</span> Abrir caixa</button><BtnRec id="sec-minhas" n={x.minhas.length} /></div>
        {x.minhas.length ? <ListaEnxuta lista={x.minhas} /> : <div className="empty"><strong>Nenhuma tarefa sua em aberto.</strong>Quando alguém criar uma tarefa com você como responsável, ela aparece aqui.</div>}</section>
      <section className={cls("sec-flag")} id="sec-flag"><div className="ph"><h3>4. Importantes e urgentes</h3><span className="muted" style={{ fontSize: 12 }}>de toda a equipe</span><button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => cheia("flag")} title="Abrir na tela inteira" aria-label="Abrir a caixa Importantes e urgentes em tela inteira"><span aria-hidden="true">⤢</span> Abrir caixa</button><BtnRec id="sec-flag" n={x.flag.length} /></div>
        {x.flag.length ? <div>{x.q.filter(([, l]) => l.length).map(([tit, l, dica]) => <div key={tit} className="quad"><div className="qh"><strong>{tit}</strong><span className="muted"> · {dica} · {l.length}</span></div><ListaEnxuta lista={l} limite={5} /></div>)}</div>
          : <div className="empty"><strong>Nenhuma tarefa marcada.</strong>Ao criar ou editar uma tarefa, marque “Importante” e/ou “Urgente” para ela aparecer aqui.</div>}</section>
      </div></div>
      <section className={cls("sec-equipe")} id="sec-equipe"><div className="ph"><h3>5. Prazos da equipe</h3><span className="muted" style={{ fontSize: 12 }}>vencidos, de hoje e dos próximos 7 dias, de todos</span><Link className="btn ghost" href="/agenda?modo=lista" style={{ marginLeft: "auto" }} title="Ver todos os prazos da equipe na Agenda, em lista" aria-label="Ver todos os prazos da equipe na Agenda">Ver todos</Link><BtnRec id="sec-equipe" n={x.equipe.length} /></div>
        {x.equipe.length ? <TabelaTarefas lista={x.equipe} /> : <div className="empty"><strong>Nada vencido nem vencendo nesta semana.</strong></div>}</section>
    </>
  );
}
export default function Pagina() { return <Suspense><Painel /></Suspense>; }
