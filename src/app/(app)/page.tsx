"use client";
import Link from "next/link";
import { useMemo } from "react";
import { useDados } from "@/lib/dados";
import { dataBR, nomeBonito } from "@/lib/formato";
import { diferencaDias, hojeBR } from "@/lib/prazos";
import { atoPub } from "@/lib/regras";
import { TabelaTarefas } from "@/components/tarefas";
import { useJanelas } from "@/components/janelas";
import { BotaoDjen } from "@/components/djen";

export default function Hoje() {
  const { tarefas, caixa, processos, v } = useDados(); const j = useJanelas();
  const { late, hj, sem } = useMemo(() => {
    const t = hojeBR(); const abertas = [...tarefas.values()].filter((x) => x.status !== "feito").sort((a, b) => (a.vencimento || "9").localeCompare(b.vencimento || "9"));
    return { late: abertas.filter((x) => x.vencimento && x.vencimento < t), hj: abertas.filter((x) => x.vencimento === t), sem: abertas.filter((x) => x.vencimento && x.vencimento > t && diferencaDias(x.vencimento, t) <= 7) };
  }, [tarefas, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const cx = [...caixa.values()].sort((a, b) => b.data.localeCompare(a.data)).slice(0, 5);
  const dia = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" });
  return (
    <>
      <div className="head"><div><h2>Hoje</h2><div className="sub">{dia.charAt(0).toUpperCase() + dia.slice(1)}</div></div><div className="tools"><BotaoDjen /></div></div>
      <div className="stats">
        <Link className="stat late" href="/atividades"><span className="n">{late.length}</span><span className="l">prazos vencidos</span></Link>
        <Link className="stat soon" href="/atividades"><span className="n">{hj.length}</span><span className="l">vencem hoje</span></Link>
        <Link className="stat" href="/atividades"><span className="n">{sem.length}</span><span className="l">nos próximos 7 dias</span></Link>
        <Link className="stat" href="/publicacoes"><span className="n">{caixa.size}</span><span className="l">publicações para triar</span></Link>
      </div>
      <section className="panel"><div className="ph"><h3>Prazos que pedem atenção</h3><Link className="btn ghost" href="/atividades">Ver todos</Link></div>
        {late.length + hj.length + sem.length ? <TabelaTarefas lista={[...late, ...hj, ...sem]} /> : <div className="empty"><strong>Nada vencido nem vencendo nesta semana.</strong>Os prazos aparecem aqui quando alguém cria uma tarefa a partir de uma publicação.</div>}
      </section>
      <section className="panel"><div className="ph"><h3>Publicações novas</h3><Link className="btn ghost" href="/publicacoes">Abrir caixa</Link></div>
        {cx.length ? <div className="rows">{cx.map((c) => { const p = processos.get(c.processo_numero); return (
          <div key={c.id} className="row click" onClick={() => j.abrirPub(c.id)}><span className="pill acc">{dataBR(c.data).slice(0, 5)}</span>
            <div className="main"><div className="t">{nomeBonito(p?.cliente_nome || "") || p?.mascara}</div><div className="s">{atoPub(c)} · {c.orgao || ""}</div></div><span className="mono muted">{p?.mascara}</span></div>); })}</div>
          : <div className="empty"><strong>Caixa vazia.</strong>As publicações novas do DJEN entram aqui sozinhas, três vezes por dia nos dias úteis.</div>}
      </section>
    </>
  );
}
