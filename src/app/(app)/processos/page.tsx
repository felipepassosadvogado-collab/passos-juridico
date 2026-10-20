"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useDados } from "@/lib/dados";
import { bancoCurto, dataBR, nomeBonito, semAcento } from "@/lib/formato";
import { situacaoPrazo } from "@/lib/prazos";
import { soDigitos } from "@/lib/cnj";
import { FASES, faseCRM } from "@/lib/regras";
import { useJanelas } from "@/components/janelas";
import { Ic } from "@/components/ui";

export default function Processos() {
  const { processos, tarefas, v } = useDados(); const j = useJanelas(); const router = useRouter();
  const [q, setQ] = useState(""); const [banco, setBanco] = useState(""); const [fase, setFase] = useState("");
  const todos = useMemo(() => [...processos.values()], [processos, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const bancos = useMemo(() => [...new Set(todos.map((p) => bancoCurto(p.banco)))].sort(), [todos]);
  const prox = useMemo(() => { const m: Record<string, string> = {}; for (const t of tarefas.values()) if (t.status !== "feito" && t.processo_numero && t.vencimento && (!m[t.processo_numero] || t.vencimento < m[t.processo_numero])) m[t.processo_numero] = t.vencimento; return m; }, [tarefas, v]); // eslint-disable-line react-hooks/exhaustive-deps
  let l = todos;
  if (q) { const n = semAcento(q), d = soDigitos(q); l = l.filter((p) => semAcento(p.cliente_nome + " " + (p.banco || "") + " " + (p.orgao || "")).includes(n) || (d.length >= 4 && p.numero.includes(d))); }
  if (banco) l = l.filter((p) => bancoCurto(p.banco) === banco);
  if (fase) l = l.filter((p) => faseCRM(p.fase) === (fase === "none" ? "" : fase));
  l = [...l].sort((a, b) => (b.ultima_data || "").localeCompare(a.ultima_data || ""));
  return (
    <>
      <div className="head"><div><h2>Processos</h2><div className="sub">{l.length} de {processos.size}</div></div>
        <div className="tools"><Link className="btn primary" href="/processos/novo">Novo processo</Link>
          <input type="search" placeholder="Cliente, banco ou nº" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar processo" />
          <select value={banco} onChange={(e) => setBanco(e.target.value)} aria-label="Réu"><option value="">Todos os réus</option>{bancos.map((b) => <option key={b}>{b}</option>)}</select>
          <select value={fase} onChange={(e) => setFase(e.target.value)} aria-label="Fase"><option value="">Todas as fases</option><option value="none">Sem fase definida</option>{FASES.map((f) => <option key={f}>{f}</option>)}</select></div></div>
      {!processos.size ? <div className="panel"><div className="empty"><strong>Nenhum processo ainda.</strong>Importe os dados do painel antigo (Importar dados) ou aguarde a busca do DJEN.</div></div> :
        <div className="panel tscroll"><table className="grid"><thead><tr><th>Cliente</th><th>Réu</th><th>Processo</th><th>Fase</th><th>Último ato</th><th>Prazo</th><th /></tr></thead>
          <tbody>{l.slice(0, 400).map((p) => { const pr = prox[p.numero]; const s = situacaoPrazo(pr); return (
            <tr key={p.numero} className="click" onClick={() => j.abrirProcesso(p.numero)}>
              <td><div style={{ fontWeight: 600 }}>{nomeBonito(p.cliente_nome) || "—"}</div><div className="s">{p.orgao || ""}</div></td>
              <td>{bancoCurto(p.banco)}</td><td className="mono">{p.mascara}</td>
              <td>{faseCRM(p.fase) ? <span className="pill acc">{faseCRM(p.fase)}</span> : <span className="muted">—</span>}</td>
              <td><div>{p.ultimo_ato || "—"}</div><div className="s mono">{dataBR(p.ultima_data)}</div></td>
              <td>{pr && <span className={"pill " + s.cor}>{s.texto}</span>}</td>
              <td><button className="btn ghost" title="Criar tarefa" onClick={(e) => { e.stopPropagation(); j.novaTarefa(p.numero); }}>{Ic.tarefa}Tarefa</button></td>
            </tr>); })}</tbody></table></div>}
      {l.length > 400 && <div className="muted">Mostrando os 400 mais recentes. Use a busca para encontrar os demais.</div>}
    </>
  );
}
