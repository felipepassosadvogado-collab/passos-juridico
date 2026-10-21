"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDados } from "@/lib/dados";
import { dataBR, dataHoraBR, nomeBonito } from "@/lib/formato";
import { diferencaDias, hojeBR } from "@/lib/prazos";
import { atoPub, ehAgenda } from "@/lib/regras";
import { CaixaAgenda } from "@/components/agenda";
import { ListaEnxuta, TabelaTarefas } from "@/components/tarefas";
import { BotaoDjen } from "@/components/djen";
import { useJanelas } from "@/components/janelas";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

function Painel() {
  const { tarefas, caixa, notificacoes, avisos, processos, eu, sb, aplicar, nome, v } = useDados(); const j = useJanelas(); const router = useRouter();
  const sp = useSearchParams(); const corrigirId = sp.get("corrigir");
  useEffect(() => { if (corrigirId) setTimeout(() => ir("sec-corrigir"), 120); }, [corrigirId]);
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
  return (
    <>
      <div className="head"><div><h2>Olá, {eu.nome.split(/[\s.]/)[0]}</h2><div className="sub">{dia.charAt(0).toUpperCase() + dia.slice(1)} · o que está com você e com a equipe</div></div><div className="tools"><BotaoDjen /></div></div>
      <div className="stats">
        <Link className="stat" href="/publicacoes"><span className="n">{x.cx.length}</span><span className="l">intimações para ler</span></Link>
        <button className={"stat" + (x.venc ? " late" : "")} onClick={() => ir("sec-minhas")}><span className="n">{x.minhas.length}</span><span className="l">{x.venc ? `${x.minhas.length} minhas, ${x.venc} vencendo ou vencidas` : "tarefas minhas em aberto"}</span></button>
        <button className={"stat" + (x.eqVenc ? " late" : "")} onClick={() => ir("sec-equipe")}><span className="n">{x.equipe.length}</span><span className="l">{x.eqVenc ? `prazos da equipe na semana, ${x.eqVenc} vencendo ou vencidos` : "prazos da equipe nos próximos 7 dias"}</span></button>
        <button className="stat" onClick={() => ir("sec-corrigir")}><span className="n">{x.corrigir.length}</span><span className="l">peças para eu corrigir</span></button>
      </div>
      <div className="pcols"><div className="pcol">
      <CaixaAgenda />
      {x.nl.length > 0 && <section className="panel"><div className="ph"><h3>Avisos novos</h3><span className="count hot">{x.nl.length}</span></div>
        <div className="rows">{x.nl.slice(0, 8).map((n) => (
          <div key={n.id} className="row click" onClick={() => { lida(n.id); if (n.processo_numero) j.abrirProcesso(n.processo_numero, n.tarefa_id ? { aba: "tarefas", alvo: "tar-" + n.tarefa_id } : undefined); else if (n.caso_id) j.abrirCaso(n.caso_id); }}>
            <span className="pill ok">{n.tipo === "protocolo" ? "protocolo" : n.tipo === "tarefa" ? "tarefa" : "aviso"}</span>
            <div className="main"><div className="t">{n.texto}</div><div className="s">{[nomeBonito(n.processo_numero ? processos.get(n.processo_numero)?.cliente_nome || "" : ""), "de " + nome(n.de), dataHoraBR(n.em)].filter(Boolean).join(" · ")}</div></div>
            <button className="btn ghost" onClick={(e) => { e.stopPropagation(); lida(n.id); }}>Lido</button></div>))}</div></section>}
      <section className="panel"><div className="ph"><h3>1. Ler intimações</h3><Link className="btn ghost" href="/publicacoes">Abrir a caixa</Link></div>
        {x.cx.length ? <div className="rows">{x.cx.slice(0, 8).map((c) => { const p = processos.get(c.processo_numero); return (
          <div key={c.id} className="row click" onClick={() => j.abrirPub(c.id)}><span className="pill acc">{dataBR(c.data).slice(0, 5)}</span>
            <div className="main"><div className="t">{nomeBonito(p?.cliente_nome || "") || p?.mascara}</div><div className="s">{atoPub(c)} · {c.orgao || ""}{c.analise ? " · já analisada" : ""}</div></div><span className="mono muted">{p?.mascara}</span></div>); })}
          {x.cx.length > 8 && <div className="row"><span /><div className="s">e mais {x.cx.length - 8} na caixa</div><span /></div>}</div>
          : <div className="empty"><strong>Nenhuma intimação para ler.</strong>A caixa está em dia.</div>}</section>
      </div><div className="pcol">
      <section className="panel" id="sec-corrigir"><div className="ph"><h3>2. Corrigir peças da equipe</h3><span className="muted" style={{ fontSize: 12 }}>enviadas para você revisar</span></div>
        {x.corrigir.length ? <ListaEnxuta key={corrigirId || "c"} lista={x.corrigir} abrirId={corrigirId} /> : <div className="empty"><strong>Nada esperando sua correção.</strong>Quando alguém enviar uma peça para você revisar, ela aparece aqui com o arquivo anexado.</div>}</section>
      <section className="panel" id="sec-minhas"><div className="ph"><h3>3. Cumprir minhas tarefas</h3><span className="muted" style={{ fontSize: 12 }}>criadas por você ou pela equipe</span></div>
        {x.minhas.length ? <ListaEnxuta lista={x.minhas} /> : <div className="empty"><strong>Nenhuma tarefa sua em aberto.</strong>Quando alguém criar uma tarefa com você como responsável, ela aparece aqui.</div>}</section>
      <section className="panel" id="sec-flag"><div className="ph"><h3>4. Importantes e urgentes</h3><span className="muted" style={{ fontSize: 12 }}>de toda a equipe</span></div>
        {x.flag.length ? <div>{x.q.filter(([, l]) => l.length).map(([tit, l, dica]) => <div key={tit} className="quad"><div className="qh"><strong>{tit}</strong><span className="muted"> · {dica} · {l.length}</span></div><ListaEnxuta lista={l} limite={5} /></div>)}</div>
          : <div className="empty"><strong>Nenhuma tarefa marcada.</strong>Ao criar ou editar uma tarefa, marque “Importante” e/ou “Urgente” para ela aparecer aqui.</div>}</section>
      </div></div>
      <section className="panel" id="sec-equipe"><div className="ph"><h3>5. Prazos da equipe</h3><span className="muted" style={{ fontSize: 12 }}>vencidos, de hoje e dos próximos 7 dias, de todos</span><Link className="btn ghost" href="/agenda?modo=lista" style={{ marginLeft: "auto" }}>Ver todos</Link></div>
        {x.equipe.length ? <TabelaTarefas lista={x.equipe} /> : <div className="empty"><strong>Nada vencido nem vencendo nesta semana.</strong></div>}</section>
    </>
  );
}
export default function Pagina() { return <Suspense><Painel /></Suspense>; }
