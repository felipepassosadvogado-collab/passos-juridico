"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDados, useOpcoesEquipe, msgErro } from "@/lib/dados";
import { bancoCurto, dataBR, iniciais, nomeBonito, semAcento } from "@/lib/formato";
import { mascaraCnj, soDigitos } from "@/lib/cnj";
import { DICAS_ETAPA, DICAS_FASE, ETAPAS, FASES, faseCRM, sugerirFase } from "@/lib/regras";
import type { Tarefa } from "@/lib/tipos";
import { Coluna, ProxTarefa, useArrasto } from "@/components/crm";
import { useJanelas } from "@/components/janelas";
import { Avatar, Ic } from "@/components/ui";

function CRM() {
  const d = useDados(); const { processos, casos, tarefas, sb, aplicar, registrar, aviso, titular, nome, v } = d;
  const j = useJanelas(); const router = useRouter(); const sp = useSearchParams(); const ops = useOpcoesEquipe();
  const [q, setQ] = useState({ quadro: sp.get("caso") ? "pre" : "judicial", busca: "", banco: "", resp: "" });
  const [msg, setMsg] = useState(""); const [conf, setConf] = useState(false); const [ocupado, setOcupado] = useState(false);
  useEffect(() => { const c = sp.get("caso"); if (c) j.abrirCaso(c); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const proxima = useMemo(() => {
    const m = new Map<string, Tarefa>();
    for (const t of tarefas.values()) { if (t.status === "feito") continue; const k = t.processo_numero || "c:" + t.caso_id; const a = m.get(k); if (!a || (t.vencimento || "9") < (a.vencimento || "9")) m.set(k, t); }
    return m;
  }, [tarefas, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const filtra = <T,>(l: T[], nomeDe: (x: T) => string, bancoDe: (x: T) => string | null, respDe: (x: T) => string | null, numDe: (x: T) => string) => {
    const n = semAcento(q.busca), dg = soDigitos(q.busca);
    return l.filter((x) => (!q.banco || bancoCurto(bancoDe(x)) === q.banco) && (!q.resp || respDe(x) === q.resp) && (!n || semAcento(nomeDe(x)).includes(n) || (dg.length >= 4 && numDe(x).includes(dg))));
  };
  const bancos = [...new Set([...[...processos.values()].map((p) => bancoCurto(p.banco)), ...[...casos.values()].map((c) => bancoCurto(c.banco))])].filter((x) => x && x !== "—").sort();
  const moverProc = async (n: string, fase: string) => {
    const p = processos.get(n); if (!p || faseCRM(p.fase) === fase) return;
    const { data, error } = await sb.from("processos").update({ fase: fase || null }).eq("numero", n).select().single();
    if (error) { aviso(msgErro(error)); return; } aplicar("processos", data); registrar({ processo_numero: n, tipo: "fase", dados: { fase: fase || "Sem fase" } });
  };
  const moverCaso = async (id: string, etapa: string) => {
    const c = casos.get(id); if (!c || c.etapa === etapa) return;
    if (etapa === "Protocolado" && !c.processo_numero) { j.abrirCaso(id); aviso("Para marcar como protocolado, cadastre o processo pela ficha do atendimento."); return; }
    const { data, error } = await sb.from("casos").update({ etapa }).eq("id", id).select().single();
    if (error) { aviso(msgErro(error)); return; } aplicar("casos", data); registrar({ caso_id: id, tipo: "fase", dados: { fase: etapa } });
    if (etapa === "Elaboração da inicial" && ![...tarefas.values()].some((t) => t.caso_id === id && t.status !== "feito" && /inicial/i.test(t.descricao))) { j.abrirCaso(id, true); aviso("Crie a tarefa de elaboração da inicial."); }
  };
  const arrastou = useArrasto((id, col) => { if (col.startsWith("j:")) moverProc(id, col.slice(2)); else if (col.startsWith("p:")) moverCaso(id, col.slice(2)); });
  const semFase = [...processos.values()].filter((p) => !faseCRM(p.fase) && sugerirFase(p));
  const sugerir = async () => {
    if (!conf) { setConf(true); setMsg(`${semFase.length} processos sem fase têm sugestão pelo juízo, classe ou último ato. Clique de novo em “Sugerir fases automaticamente” para aplicar. Os demais continuam em “A classificar”.`); return; }
    setConf(false); setMsg(""); setOcupado(true); let k = 0;
    try { for (const p of semFase) { const f = sugerirFase(p); const { data } = await sb.from("processos").update({ fase: f }).eq("numero", p.numero).select().single(); if (data) { aplicar("processos", data); registrar({ processo_numero: p.numero, tipo: "fase", dados: { fase: f + " (sugestão automática)" } }); k++; } } aviso(k + " processos classificados."); }
    finally { setOcupado(false); }
  };
  const av = (id?: string | null) => id ? <Avatar id={id} pequeno /> : null;
  const mover = (atual: string, opcoes: [string, string][], onMover: (v: string) => void) =>
    <select className="kmove" aria-label="Mover para" value="" onClick={(e) => e.stopPropagation()} onChange={(e) => onMover(e.target.value)}><option value="">Mover para…</option>{opcoes.map(([k, t]) => <option key={k} value={k} disabled={k === atual}>{t}</option>)}</select>;
  let quadro;
  if (q.quadro === "judicial") {
    const procs = filtra([...processos.values()].filter((p) => faseCRM(p.fase) !== "Encerrado" || q.busca), (p) => p.cliente_nome, (p) => p.banco, (p) => p.responsavel, (p) => p.numero);
    const cols: [string, string][] = [["", "A classificar"], ...FASES.filter((f) => f !== "Encerrado" || q.busca).map((f) => [f, f] as [string, string])];
    const grupos = new Map(cols.map(([k]) => [k, [] as typeof procs]));
    for (const p of procs) { const f = faseCRM(p.fase); (grupos.get(grupos.has(f) ? f : "") || []).push(p); }
    quadro = <div className="kanban">{cols.map(([k, t]) => <Coluna key={k} chave={"j:" + k} titulo={t} dica={DICAS_FASE[k]} cartoes={(grupos.get(k) || []).sort((a, b) => (b.ultima_data || "").localeCompare(a.ultima_data || "")).map((p) => (
      <article key={p.numero} className="kcard" data-id={p.numero} tabIndex={0} onClick={() => { if (!arrastou.current) j.abrirProcesso(p.numero); }}>
        <div className="kc1">{nomeBonito(p.cliente_nome || "—")}</div><div className="kc2">x {bancoCurto(p.banco)}{p.orgao ? " · " + p.orgao : ""}</div>
        <div className="kc3"><span className="mono">{p.mascara}</span>{av(p.responsavel)}</div>
        <ProxTarefa t={proxima.get(p.numero)} />{mover(faseCRM(p.fase), [...cols, ["Encerrado", "Encerrado"]], (f) => moverProc(p.numero, f))}</article>))} />)}</div>;
  } else {
    const cs = filtra([...casos.values()], (c) => c.nome, (c) => c.banco, (c) => c.responsavel, (c) => c.processo_numero || "");
    const grupos = new Map(ETAPAS.map((e) => [e, [] as typeof cs])); for (const c of cs) (grupos.get(c.etapa) || grupos.get(ETAPAS[0])!).push(c);
    quadro = <>{!casos.size && <div className="banner">Nenhum atendimento ainda. Clique em “Novo atendimento” para cadastrar o primeiro caso, antes de virar processo.</div>}
      <div className="kanban">{ETAPAS.map((e) => <Coluna key={e} chave={"p:" + e} titulo={e} dica={DICAS_ETAPA[e]} cartoes={(grupos.get(e) || []).sort((a, b) => b.criado_em.localeCompare(a.criado_em)).map((c) => (
        <article key={c.id} className="kcard" data-id={c.id} tabIndex={0} onClick={() => { if (!arrastou.current) j.abrirCaso(c.id); }}>
          <div className="kc1">{nomeBonito(c.nome || "—")}</div><div className="kc2">x {c.banco ? bancoCurto(c.banco) : "banco a definir"}{c.contratos ? " · " + c.contratos : ""}</div>
          <div className="kc3">{c.processo_numero ? <span className="mono">{mascaraCnj(c.processo_numero)}</span> : <span className="muted">desde {dataBR(c.criado_em.slice(0, 10))}</span>}{av(c.responsavel)}</div>
          <ProxTarefa t={proxima.get("c:" + c.id)} />{mover(c.etapa, ETAPAS.map((x) => [x, x]), (x) => moverCaso(c.id, x))}</article>))} />)}</div></>;
  }
  return (
    <>
      <div className="pg-title"><h2>CRM</h2><span className="muted">{q.quadro === "pre" ? "Do primeiro atendimento ao protocolo" : "Andamento judicial por fase"}</span></div>
      <div className="toolbar">
        <div className="seg" role="tablist">{([["pre", "Pré-processual"], ["judicial", "Judicial"]] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={q.quadro === k} onClick={() => setQ({ ...q, quadro: k })}>{t}</button>)}</div>
        {q.quadro === "pre" && <button className="btn primary" onClick={() => j.abrirCaso("novo")}>Novo atendimento</button>}
        <label className="tb">{Ic.busca}<input type="search" placeholder="Buscar cliente ou nº" value={q.busca} onChange={(e) => setQ({ ...q, busca: e.target.value })} /></label>
        <label className="tb">{Ic.filtro}<select value={q.banco} onChange={(e) => setQ({ ...q, banco: e.target.value })}><option value="">Todos os bancos</option>{bancos.map((b) => <option key={b}>{b}</option>)}</select></label>
        <label className="tb">{Ic.filtro}<select value={q.resp} onChange={(e) => setQ({ ...q, resp: e.target.value })}><option value="">Todos os responsáveis</option>{ops.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></label>
        {q.quadro === "judicial" && titular && semFase.length > 0 && <button className="btn ghost" disabled={ocupado} onClick={sugerir}>{ocupado ? "Classificando…" : "Sugerir fases automaticamente"}</button>}
      </div>
      {msg && <div className="banner">{msg}</div>}
      {quadro}
    </>
  );
}
export default function Pagina() { return <Suspense><CRM /></Suspense>; }
