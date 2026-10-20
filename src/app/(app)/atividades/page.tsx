"use client";
import { useMemo, useState } from "react";
import { useDados, useOpcoesEquipe } from "@/lib/dados";
import { dataBR, semAcento } from "@/lib/formato";
import { hojeBR } from "@/lib/prazos";
import { soDigitos } from "@/lib/cnj";
import { STATUS_NOME } from "@/lib/regras";
import { TabelaTarefas, usePartes } from "@/components/tarefas";
import { useJanelas } from "@/components/janelas";
import { Ic, baixar } from "@/components/ui";

const TIT: Record<string, string> = { abertos: "Em aberto", correcao: "Em correção", marcadas: "Importantes e urgentes", vencidas: "Vencidas", feitas: "Cumpridas" };

export default function Atividades() {
  const { tarefas, eu, processos, nome, pronto, v } = useDados(); const ops = useOpcoesEquipe(); const partes = usePartes(); const j = useJanelas();
  const [f, setF] = useState({ q: "", resp: "", st: "abertos", ord: "fatal" });
  const l = useMemo(() => {
    const hoje = hojeBR();
    let x = [...tarefas.values()].filter((t) => f.st === "abertos" ? t.status !== "feito" : f.st === "correcao" ? ["revisao", "ajustes", "aprovada"].includes(t.status)
      : f.st === "marcadas" ? t.status !== "feito" && (t.importante || t.urgente) : f.st === "vencidas" ? t.status !== "feito" && !!t.vencimento && t.vencimento < hoje : t.status === "feito");
    if (f.resp === "meus") x = x.filter((t) => t.responsavel === eu.id); else if (f.resp === "none") x = x.filter((t) => !t.responsavel); else if (f.resp) x = x.filter((t) => t.responsavel === f.resp);
    if (f.q) { const q = semAcento(f.q), qd = soDigitos(f.q); x = x.filter((t) => { const p = partes(t); return semAcento(t.descricao + " " + p.cli + " " + p.reus.join(" ")).includes(q) || (qd.length >= 4 && (t.processo_numero || "").includes(qd)); }); }
    const by: Record<string, (a: typeof x[0], b: typeof x[0]) => number> = {
      fatal: (a, b) => (f.st === "feitas" ? (b.feito_em || "").localeCompare(a.feito_em || "") : (a.vencimento || "9").localeCompare(b.vencimento || "9")),
      cliente: (a, b) => partes(a).cli.localeCompare(partes(b).cli), recentes: (a, b) => b.criado_em.localeCompare(a.criado_em),
    };
    return x.sort((a, b) => (+(b.urgente && b.importante) - +(a.urgente && a.importante)) || by[f.ord](a, b));
  }, [tarefas, f, eu.id, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const exportar = () => {
    const esc = (s: unknown) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
    const linhas = [["Tarefa", "Cliente", "Réus", "Processo", "Prazo fatal", "Responsável", "Situação", "Importante", "Urgente"].map(esc).join(";")];
    for (const t of l) { const p = t.processo_numero ? processos.get(t.processo_numero) : undefined; const pt = partes(t);
      linhas.push([t.descricao, pt.cli, (p?.reus || []).join(" / "), p?.mascara || "", dataBR(t.vencimento), nome(t.responsavel), STATUS_NOME[t.status], t.importante ? "sim" : "", t.urgente ? "sim" : ""].map(esc).join(";")); }
    baixar("atividades-" + hojeBR() + ".csv", "﻿" + linhas.join("\r\n"), "text/csv;charset=utf-8");
  };
  return (
    <>
      <div className="pg-title"><h2>Atividades</h2><span className="muted">{l.length} · {TIT[f.st]}</span></div>
      <div className="toolbar">
        <button className="btn primary" onClick={() => j.novaTarefa()}>Nova tarefa</button>
        <label className="tb">{Ic.busca}<input type="search" placeholder="Buscar" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} /></label>
        <label className="tb">{Ic.filtro}<select value={f.st} onChange={(e) => setF({ ...f, st: e.target.value })}>{Object.entries(TIT).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label className="tb">{Ic.filtro}<select value={f.resp} onChange={(e) => setF({ ...f, resp: e.target.value })}><option value="">Todos os responsáveis</option><option value="meus">Minhas</option>
          {ops.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}<option value="none">Sem responsável</option></select></label>
        <label className="tb">{Ic.ordem}<select value={f.ord} onChange={(e) => setF({ ...f, ord: e.target.value })}><option value="fatal">Ordenar: {f.st === "feitas" ? "conclusão" : "prazo fatal"}</option><option value="cliente">Ordenar: cliente</option><option value="recentes">Ordenar: mais recentes</option></select></label>
        <button className="btn ghost" onClick={exportar}>{Ic.exportar}Exportar</button>
      </div>
      <section className="panel">{pronto ? <TabelaTarefas lista={l} /> : <div className="empty">Carregando…</div>}</section>
    </>
  );
}
