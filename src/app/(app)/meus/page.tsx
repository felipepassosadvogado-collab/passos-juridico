"use client";
import Link from "next/link";
import { Suspense, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDados } from "@/lib/dados";
import { dataBR, dataHoraBR, nomeBonito } from "@/lib/formato";
import { diferencaDias, hojeBR } from "@/lib/prazos";
import { atoPub } from "@/lib/regras";
import { ListaEnxuta } from "@/components/tarefas";
import { useJanelas } from "@/components/janelas";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const ir = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

function Meus() {
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
      pend: [...avisos.values()].filter((a) => a.status !== "avisado").sort((a, b) => (a.data_evento || "9").localeCompare(b.data_evento || "9")),
    };
  }, [tarefas, caixa, notificacoes, avisos, eu.id, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const lida = async (id: string) => { const { data } = await sb.from("notificacoes").update({ lida: true }).eq("id", id).select().single(); if (data) aplicar("notificacoes", data); };
  return (
    <>
      <div className="head"><div><h2>Meus expedientes</h2><div className="sub">O que está com {eu.nome.split(/[\s.]/)[0]} hoje</div></div></div>
      <div className="stats">
        <Link className="stat" href="/publicacoes"><span className="n">{x.cx.length}</span><span className="l">intimações para ler</span></Link>
        <button className={"stat" + (x.venc ? " late" : "")} onClick={() => ir("sec-minhas")}><span className="n">{x.minhas.length}</span><span className="l">{x.venc ? `${x.minhas.length} minhas, ${x.venc} vencendo ou vencidas` : "tarefas minhas em aberto"}</span></button>
        <button className="stat late" onClick={() => ir("sec-flag")}><span className="n">{x.q[0][1].length}</span><span className="l">importantes e urgentes</span></button>
        <button className="stat" onClick={() => ir("sec-corrigir")}><span className="n">{x.corrigir.length}</span><span className="l">peças para eu corrigir</span></button>
      </div>
      {x.nl.length > 0 && <section className="panel"><div className="ph"><h3>Avisos novos</h3><span className="count hot">{x.nl.length}</span></div>
        <div className="rows">{x.nl.slice(0, 8).map((n) => (
          <div key={n.id} className="row click" onClick={() => { lida(n.id); if (n.processo_numero) router.push("/processos/" + n.processo_numero); else if (n.caso_id) j.abrirCaso(n.caso_id); }}>
            <span className="pill ok">{n.tipo === "protocolo" ? "protocolo" : n.tipo === "tarefa" ? "tarefa" : "aviso"}</span>
            <div className="main"><div className="t">{n.texto}</div><div className="s">{[nomeBonito(n.processo_numero ? processos.get(n.processo_numero)?.cliente_nome || "" : ""), "de " + nome(n.de), dataHoraBR(n.em)].filter(Boolean).join(" · ")}</div></div>
            <button className="btn ghost" onClick={(e) => { e.stopPropagation(); lida(n.id); }}>Lido</button></div>))}</div></section>}
      <section className="panel"><div className="ph"><h3>Clientes para avisar</h3><span className="muted" style={{ fontSize: 12 }}>perícias, audiências e coletas marcadas</span></div>
        {x.pend.length ? <div className="rows">{x.pend.map((a) => { const p = processos.get(a.processo_numero); const dias = a.data_evento ? diferencaDias(a.data_evento, hojeBR()) : null;
          return <div key={a.id} className="row click" onClick={() => j.abrirAviso(a.id)}>
            <div className="date">{a.data_evento ? <><b>{a.data_evento.slice(8, 10)}</b>{MES[+a.data_evento.slice(5, 7) - 1]}</> : "—"}</div>
            <div className="main"><div className="t">{nomeBonito(p?.cliente_nome || "—")}</div><div className="s">{[a.tipo_evento || "Ato a definir", (a.hora || "").slice(0, 5), a.local].filter(Boolean).join(" · ")}</div></div>
            <span className={"pill " + (dias != null && dias <= 3 ? "late" : "soon")}>{dias == null ? "sem data" : dias < 0 ? "já passou" : dias === 0 ? "é hoje" : "em " + dias + " dias"}</span></div>; })}</div>
          : <div className="empty">Nenhum cliente esperando aviso.</div>}</section>
      <section className="panel"><div className="ph"><h3>1. Ler intimações</h3><Link className="btn ghost" href="/publicacoes">Abrir a caixa</Link></div>
        {x.cx.length ? <div className="rows">{x.cx.slice(0, 8).map((c) => { const p = processos.get(c.processo_numero); return (
          <div key={c.id} className="row click" onClick={() => j.abrirPub(c.id)}><span className="pill acc">{dataBR(c.data).slice(0, 5)}</span>
            <div className="main"><div className="t">{nomeBonito(p?.cliente_nome || "") || p?.mascara}</div><div className="s">{atoPub(c)} · {c.orgao || ""}{c.analise ? " · já analisada" : ""}</div></div><span className="mono muted">{p?.mascara}</span></div>); })}
          {x.cx.length > 8 && <div className="row"><span /><div className="s">e mais {x.cx.length - 8} na caixa</div><span /></div>}</div>
          : <div className="empty"><strong>Nenhuma intimação para ler.</strong>A caixa está em dia.</div>}</section>
      <section className="panel" id="sec-corrigir"><div className="ph"><h3>2. Corrigir peças da equipe</h3><span className="muted" style={{ fontSize: 12 }}>enviadas para você revisar</span></div>
        {x.corrigir.length ? <ListaEnxuta key={corrigirId || "c"} lista={x.corrigir} abrirId={corrigirId} /> : <div className="empty"><strong>Nada esperando sua correção.</strong>Quando alguém enviar uma peça para você revisar, ela aparece aqui com o arquivo anexado.</div>}</section>
      <section className="panel" id="sec-minhas"><div className="ph"><h3>3. Cumprir minhas tarefas</h3><span className="muted" style={{ fontSize: 12 }}>criadas por você ou pela equipe</span></div>
        {x.minhas.length ? <ListaEnxuta lista={x.minhas} /> : <div className="empty"><strong>Nenhuma tarefa sua em aberto.</strong>Quando alguém criar uma tarefa com você como responsável, ela aparece aqui.</div>}</section>
      <section className="panel" id="sec-flag"><div className="ph"><h3>4. Importantes e urgentes</h3><span className="muted" style={{ fontSize: 12 }}>de toda a equipe</span></div>
        {x.flag.length ? <div>{x.q.filter(([, l]) => l.length).map(([tit, l, dica]) => <div key={tit} className="quad"><div className="qh"><strong>{tit}</strong><span className="muted"> · {dica} · {l.length}</span></div><ListaEnxuta lista={l} limite={5} /></div>)}</div>
          : <div className="empty"><strong>Nenhuma tarefa marcada.</strong>Ao criar ou editar uma tarefa, marque “Importante” e/ou “Urgente” para ela aparecer aqui.</div>}</section>
    </>
  );
}
export default function Pagina() { return <Suspense><Meus /></Suspense>; }
