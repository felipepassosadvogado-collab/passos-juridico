"use client";
import { useMemo, useState } from "react";
import { useDados } from "@/lib/dados";
import { dataBR, dataHoraBR } from "@/lib/formato";
import { dataValida, diferencaDias, hojeBR, isoData, paraData, situacaoPrazo, somaDias } from "@/lib/prazos";
import type { Tarefa } from "@/lib/tipos";
import { DetalheTarefa, usePartes } from "@/components/tarefas";
import { Avatar, ChipResp, Ic } from "@/components/ui";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const diaLocal = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : "");
type G = { modo: "dia" | "mes" | "ano"; ref: string; pessoa: string; lista: "pend" | "atras" | "conc" };

function periodo(g: G) {
  const d = paraData(g.ref); const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (g.modo === "dia") return { ini: g.ref, fim: g.ref, rot: d.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }) };
  if (g.modo === "mes") return { ini: isoData(new Date(Date.UTC(y, m, 1))), fim: isoData(new Date(Date.UTC(y, m + 1, 0))), rot: MESES[m] + " de " + y };
  return { ini: y + "-01-01", fim: y + "-12-31", rot: "Ano de " + y };
}
function mover(g: G, s: number): string {
  const d = paraData(g.ref);
  if (g.modo === "dia") return isoData(somaDias(d, s));
  if (g.modo === "mes") return isoData(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + s, 1)));
  return isoData(new Date(Date.UTC(d.getUTCFullYear() + s, 0, 1)));
}
function numeros(ts: Tarefa[], ini: string, fim: string, t0: string) {
  const pend = ts.filter((t) => t.status !== "feito" && t.vencimento && t.vencimento >= ini && t.vencimento <= fim);
  const atras = pend.filter((t) => t.vencimento! < t0);
  const conc = ts.filter((t) => t.status === "feito" && ((x) => x >= ini && x <= fim)(diaLocal(t.feito_em)));
  const venceram = ts.filter((t) => t.vencimento && t.vencimento >= ini && t.vencimento <= fim && t.vencimento < t0);
  const ok = venceram.filter((t) => t.status === "feito" && diaLocal(t.feito_em) <= t.vencimento!);
  return { pend, atras, conc, venceram, taxa: venceram.length ? Math.round((ok.length / venceram.length) * 100) : null };
}

function Grafico({ ts, ini, fim, modo }: { ts: Tarefa[]; ini: string; fim: string; modo: "mes" | "ano" }) {
  const chaves: string[] = [];
  if (modo === "mes") { let d = paraData(ini); while (isoData(d) <= fim) { chaves.push(isoData(d)); d = somaDias(d, 1); } } else for (let m = 1; m <= 12; m++) chaves.push(ini.slice(0, 4) + "-" + String(m).padStart(2, "0"));
  const k = (x: string) => (modo === "mes" ? x : x.slice(0, 7)); const t0 = hojeBR();
  const conc: Record<string, number> = Object.fromEntries(chaves.map((c) => [c, 0])), venc: Record<string, number> = Object.fromEntries(chaves.map((c) => [c, 0]));
  for (const t of ts) { if (t.status === "feito") { const c = k(diaLocal(t.feito_em)); if (c in conc) conc[c]++; } else if (t.vencimento && t.vencimento < t0) { const c = k(t.vencimento); if (c in venc) venc[c]++; } }
  const max = Math.max(1, ...chaves.map((c) => Math.max(conc[c], venc[c]))); const W = Math.max(520, chaves.length * 26), H = 180, pb = 26, pt = 12, pl = 28;
  const bw = (W - pl) / chaves.length; const y = (v: number) => H - pb - (v / max) * (H - pb - pt); const passo = max <= 5 ? 1 : Math.ceil(max / 4);
  const grades = []; for (let v = 0; v <= max; v += passo) grades.push(v);
  return (
    <section className="panel"><div className="ph"><h3>{modo === "mes" ? "Dia a dia" : "Mês a mês"}</h3><span className="legenda"><span className="lg ok">Concluídas</span><span className="lg late">Vencidas sem cumprir</span></span></div>
      <div className="tscroll" style={{ padding: "12px 16px" }}><div className="gchart">
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={"Tarefas concluídas e vencidas por " + (modo === "mes" ? "dia" : "mês")}>
          {grades.map((v) => <g key={v}><line x1={pl} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{v}</text></g>)}
          {chaves.map((c, i) => { const x0 = pl + i * bw + bw * 0.15, w = Math.max(3, (bw * 0.7 - 2) / 2); const rot = modo === "mes" ? dataBR(c) : MESES[+c.slice(5, 7) - 1] + " " + c.slice(0, 4);
            const lbl = modo === "mes" ? (+c.slice(8, 10) % 5 === 1 || chaves.length < 12 ? c.slice(8, 10) : "") : MESES[+c.slice(5, 7) - 1].slice(0, 3);
            return <g key={c}>
              {conc[c] > 0 && <rect x={x0} y={y(conc[c])} width={w} height={H - pb - y(conc[c])} rx="2" fill="var(--ok)"><title>{rot}: {conc[c]} concluída(s)</title></rect>}
              {venc[c] > 0 && <rect x={x0 + w + 2} y={y(venc[c])} width={w} height={H - pb - y(venc[c])} rx="2" fill="var(--late)"><title>{rot}: {venc[c]} vencida(s) sem cumprir</title></rect>}
              {lbl && <text x={pl + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{lbl}</text>}</g>; })}
        </svg></div></div></section>
  );
}

export default function Gestao() {
  const { tarefas, equipe, titular, nome, v } = useDados(); const partes = usePartes();
  const [g, setG] = useState<G>({ modo: "dia", ref: hojeBR(), pessoa: "", lista: "pend" });
  const [aberta, setAberta] = useState<string | null>(null);
  const per = periodo(g); const t0 = hojeBR();
  const todas = useMemo(() => [...tarefas.values()], [tarefas, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const ts = g.pessoa ? todas.filter((t) => t.responsavel === g.pessoa) : todas;
  const N = numeros(ts, per.ini, per.fim, t0);
  if (!titular) return <div className="empty">A tela de Gestão é do titular do escritório.</div>;
  const linhas = equipe.filter((p) => !g.pessoa || p.id === g.pessoa).map((p) => {
    const tsP = todas.filter((t) => t.responsavel === p.id); const n = numeros(tsP, per.ini, per.fim, t0);
    return { id: p.id, n, abertas: tsP.filter((t) => t.status !== "feito").length, correcao: tsP.filter((t) => ["revisao", "ajustes"].includes(t.status)).length };
  }).filter((x) => x.n.pend.length || x.n.conc.length || x.n.venceram.length || x.abertas);
  const tile = (n: number | string, l: string, cls: string, alvo: G["lista"]) => <button className={"stat" + (cls ? " " + cls : "") + (g.lista === alvo ? " sel" : "")} onClick={() => setG({ ...g, lista: alvo })}><span className="n">{n}</span><span className="l">{l}</span></button>;
  const lista = g.lista === "conc" ? [...N.conc].sort((a, b) => (a.feito_em || "").localeCompare(b.feito_em || "")) : g.lista === "atras" ? N.atras : N.pend;
  const tit = { pend: "Pendentes com prazo no período", atras: "Vencidas e não cumpridas", conc: "Concluídas no período" }[g.lista];
  return (
    <>
      <div className="pg-title"><h2>Gestão</h2><span className="muted">Cumprimento das tarefas da equipe</span></div>
      <div className="toolbar">
        <div className="seg" role="tablist">{([["dia", "Dia"], ["mes", "Mês"], ["ano", "Ano"]] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={g.modo === k} onClick={() => setG({ ...g, modo: k })}>{t}</button>)}</div>
        <div className="per"><button className="icb" title="Anterior" onClick={() => setG({ ...g, ref: mover(g, -1) })}>‹</button>
          {g.modo === "dia" ? <input type="date" value={g.ref} onChange={(e) => dataValida(e.target.value) && setG({ ...g, ref: e.target.value })} />
            : g.modo === "mes" ? <input type="month" value={g.ref.slice(0, 7)} onChange={(e) => e.target.value && setG({ ...g, ref: e.target.value + "-01" })} />
              : <span className="per-rot">{g.ref.slice(0, 4)}</span>}
          <button className="icb" title="Próximo" onClick={() => setG({ ...g, ref: mover(g, 1) })}>›</button>
          <button className="btn ghost" onClick={() => setG({ ...g, ref: hojeBR() })}>Hoje</button></div>
        <label className="tb">{Ic.filtro}<select value={g.pessoa} onChange={(e) => setG({ ...g, pessoa: e.target.value })}><option value="">Toda a equipe</option>{equipe.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>
      </div>
      <div className="muted" style={{ marginTop: -8 }}>{per.rot.charAt(0).toUpperCase() + per.rot.slice(1)}{g.pessoa ? " · " + nome(g.pessoa) : ""}</div>
      <div className="stats">
        {tile(N.pend.length, g.modo === "dia" ? "pendentes com prazo neste dia" : "pendentes com prazo no período", "", "pend")}
        {tile(N.atras.length, "já vencidas e não cumpridas", N.atras.length ? "late" : "", "atras")}
        {tile(N.conc.length, "concluídas no período", "", "conc")}
        {tile(N.taxa == null ? "—" : N.taxa + "%", "cumpridas dentro do prazo", N.taxa != null && N.taxa < 80 ? "soon" : "", "conc")}
      </div>
      <section className="panel tscroll"><div className="ph"><h3>Por pessoa</h3><span className="muted" style={{ fontSize: 12 }}>clique numa linha para ver só aquela pessoa</span></div>
        {linhas.length ? <table className="grid gtab"><thead><tr>{["Responsável", "Pendentes no período", "Vencidas sem cumprir", "Concluídas no período", "No prazo", "Total em aberto", "Em correção"].map((t) => <th key={t}>{t}</th>)}</tr></thead>
          <tbody>{linhas.map(({ id, n, abertas, correcao }) => <tr key={id} className="click" onClick={() => setG({ ...g, pessoa: g.pessoa === id ? "" : id })}>
            <td><ChipResp id={id} /></td><td className="num">{n.pend.length}</td><td className={"num" + (n.atras.length ? " fatal" : "")}>{n.atras.length}</td><td className="num">{n.conc.length}</td>
            <td>{n.taxa == null ? <span className="muted">—</span> : <span className={"pill " + (n.taxa >= 90 ? "ok" : n.taxa >= 70 ? "soon" : "late")}>{n.taxa}%</span>}</td>
            <td className="num">{abertas}</td><td className="num">{correcao || "—"}</td></tr>)}</tbody></table> : <div className="empty">Nenhuma tarefa no período.</div>}
      </section>
      {g.modo !== "dia" && <Grafico ts={ts} ini={per.ini} fim={per.fim} modo={g.modo} />}
      <section className="panel"><div className="ph"><h3>{tit}</h3><span className="muted" style={{ fontSize: 12 }}>{lista.length} {lista.length === 1 ? "tarefa" : "tarefas"}</span></div>
        {lista.length ? <div className="lx">{lista.slice(0, 400).flatMap((t) => {
          const exp = aberta === t.id; const fd = diaLocal(t.feito_em); const conc = g.lista === "conc"; const atrasada = conc && t.vencimento && fd > t.vencimento;
          const [cls, txt] = conc ? [atrasada ? "late" : "ok", atrasada ? `concluída ${diferencaDias(fd, t.vencimento!)} dia(s) após o prazo` : "concluída no prazo"] : [situacaoPrazo(t.vencimento).cor, situacaoPrazo(t.vencimento).texto];
          return [<div key={t.id} className="lx-row g" tabIndex={0} role="button" onClick={() => setAberta(exp ? null : t.id)}>
            <Avatar id={t.responsavel} pequeno /><div className="lx-main"><div className="lx-t">{t.descricao}</div><div className="lx-s">{[nome(t.responsavel), partes(t).cli].filter(Boolean).join(" · ")}</div></div>
            <span className={"lx-prazo " + cls}><span className="lx-data">{conc ? dataHoraBR(t.feito_em) : t.vencimento ? dataBR(t.vencimento) : "sem prazo"}</span><span className="lx-rel">{conc ? "prazo " + dataBR(t.vencimento) + " · " + txt : txt}</span></span></div>,
          exp ? <div key={t.id + "d"} className="lx-det"><DetalheTarefa t={t} /></div> : null];
        })}</div> : <div className="empty">Nada aqui.</div>}
      </section>
    </>
  );
}
