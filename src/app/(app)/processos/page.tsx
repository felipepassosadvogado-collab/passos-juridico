"use client";
import { teclado } from "@/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef } from "react";
import { Paginacao, useFiltroUrl, usePaginacao } from "@/components/paginacao";
import { useDados } from "@/lib/dados";
import { bancoCurto, dataBR, nomeBonito, semAcento } from "@/lib/formato";
import { situacaoPrazo } from "@/lib/prazos";
import { soDigitos } from "@/lib/cnj";
import { faseCRM } from "@/lib/regras";
import { useColunas } from "@/components/colunasCrm";
import { useJanelas } from "@/components/janelas";
import { Ic } from "@/components/ui";

export default function Processos() {
  const { processos, tarefas, v } = useDados(); const j = useJanelas(); const router = useRouter(); const FASES = useColunas().fases;
  // busca e filtros ficam no endereço: voltar ou recarregar a página mantém o que estava escolhido
  const [q, setQ] = useFiltroUrl("q"); const [banco, setBanco] = useFiltroUrl("reu"); const [fase, setFase] = useFiltroUrl("fase"); const topo = useRef<HTMLDivElement>(null);
  const todos = useMemo(() => [...processos.values()], [processos, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const bancos = useMemo(() => [...new Set(todos.map((p) => bancoCurto(p.banco)))].sort(), [todos]);
  const prox = useMemo(() => { const m: Record<string, string> = {}; for (const t of tarefas.values()) if (t.status !== "feito" && t.processo_numero && t.vencimento && (!m[t.processo_numero] || t.vencimento < m[t.processo_numero])) m[t.processo_numero] = t.vencimento; return m; }, [tarefas, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const l = useMemo(() => {
    let x = todos;
    if (q) { const n = semAcento(q), d = soDigitos(q); x = x.filter((p) => semAcento(p.cliente_nome + " " + (p.banco || "") + " " + (p.orgao || "")).includes(n) || (d.length >= 4 && p.numero.includes(d))); }
    if (banco) x = x.filter((p) => bancoCurto(p.banco) === banco);
    if (fase) x = x.filter((p) => faseCRM(p.fase) === (fase === "none" ? "" : fase));
    return [...x].sort((a, b) => (b.ultima_data || "").localeCompare(a.ultima_data || ""));
  }, [todos, q, banco, fase]);
  const pg = usePaginacao("processos", l.length, [q, banco, fase].join("|"));
  const filtrando = !!(q || banco || fase);
  return (
    <>
      <div className="head"><div><h2>Processos</h2><div className="sub" aria-live="polite">{filtrando ? `${l.length} de ${processos.size} com esses filtros` : `${processos.size} processos`}</div></div>
        <div className="tools"><button className="btn primary" onClick={() => j.novoProcesso()}>Novo processo</button>
          <input type="search" placeholder="Cliente, banco ou nº" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar processo" />
          <select value={banco} onChange={(e) => setBanco(e.target.value)} aria-label="Réu"><option value="">Todos os réus</option>{bancos.map((b) => <option key={b}>{b}</option>)}</select>
          <select value={fase} onChange={(e) => setFase(e.target.value)} aria-label="Fase"><option value="">Todas as fases</option><option value="none">Sem fase definida</option>{FASES.map((f) => <option key={f}>{f}</option>)}</select></div></div>
      {!processos.size ? <div className="panel"><div className="empty"><strong>Nenhum processo ainda.</strong>Importe os dados do painel antigo (Importar dados) ou aguarde a busca do DJEN.</div></div> :
        !l.length ? <div className="panel"><div className="empty"><strong>Nenhum processo com esses filtros.</strong><button className="btn" style={{ marginTop: 8 }} onClick={() => { setQ(""); setBanco(""); setFase(""); }}>Limpar busca e filtros</button></div></div> :
        <><div className="panel tscroll" ref={topo} tabIndex={-1} aria-label="Tabela de processos"><table className="grid"><caption className="sr-only">Processos{filtrando ? " filtrados" : ""}, página {pg.pagina} de {pg.paginas}. Enter abre o processo.</caption><thead><tr><th>Cliente</th><th>Réu</th><th>Processo</th><th>Fase</th><th>Último ato</th><th>Prazo</th><th /></tr></thead>
          <tbody>{l.slice(pg.ini, pg.fim).map((p) => { const pr = prox[p.numero]; const s = situacaoPrazo(pr); return (
            <tr key={p.numero} className="click" onClick={() => j.abrirProcesso(p.numero)} {...teclado(() => j.abrirProcesso(p.numero))}>
              <td><div style={{ fontWeight: 600 }}>{nomeBonito(p.cliente_nome) || "—"}</div><div className="s">{p.orgao || ""}</div></td>
              <td>{bancoCurto(p.banco)}</td><td className="mono">{p.mascara}</td>
              <td>{faseCRM(p.fase) ? <span className="pill acc">{faseCRM(p.fase)}</span> : <span className="muted">—</span>}</td>
              <td><div>{p.ultimo_ato || "—"}</div><div className="s mono">{dataBR(p.ultima_data)}</div></td>
              <td>{pr && <span className={"pill " + s.cor}>{s.texto}</span>}</td>
              <td><button className="btn ghost" title="Criar tarefa" onClick={(e) => { e.stopPropagation(); j.novaTarefa(p.numero); }}>{Ic.tarefa}Tarefa</button></td>
            </tr>); })}</tbody></table></div>
        <Paginacao p={pg} rotulo="processos" alvo={topo} /></>}
    </>
  );
}
