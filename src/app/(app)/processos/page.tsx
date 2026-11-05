"use client";
import { teclado } from "@/components/ui";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { Paginacao, useFiltroUrl, usePaginacao } from "@/components/paginacao";
import { todas, useDados } from "@/lib/dados";
import { datasDeProtocolo, type EventoMin, type Protocolo, type PubMin } from "@/lib/relatorioCrm";
import { PERIODOS, cidadesDeOrigem, intervalo, protocoladoEm, resumirProtocolos, type ProcProt } from "@/lib/protocolos";
import { Janela, baixar } from "@/components/ui";
import { bancoCurto, dataBR, nomeBonito, semAcento } from "@/lib/formato";
import { hojeBR, situacaoPrazo } from "@/lib/prazos";
import { soDigitos } from "@/lib/cnj";
import { faseCRM } from "@/lib/regras";
import { useColunas } from "@/components/colunasCrm";
import { useJanelas } from "@/components/janelas";
import { Ic } from "@/components/ui";

export default function Processos() {
  const { processos, tarefas, casos, eu, sb, v } = useDados(); const j = useJanelas(); const router = useRouter(); const FASES = useColunas().fases;
  // busca e filtros ficam no endereço: voltar ou recarregar a página mantém o que estava escolhido
  const [q, setQ] = useFiltroUrl("q"); const [banco, setBanco] = useFiltroUrl("reu"); const [fase, setFase] = useFiltroUrl("fase"); const topo = useRef<HTMLDivElement>(null);
  // data do protocolo da inicial (a mesma do relatório do CRM): só carrega o histórico quando alguém filtra por ela ou pede o relatório
  const [per, setPer] = useFiltroUrl("protocolo"); const [deU, setDe] = useFiltroUrl("de"); const [ateU, setAte] = useFiltroUrl("ate");
  const [hist, setHist] = useState<{ pubs: PubMin[]; eventos: EventoMin[] } | null>(null); const [erroHist, setErroHist] = useState(""); const [relat, setRelat] = useState(false);
  const precisaDatas = !!per || relat;
  useEffect(() => {
    if (!precisaDatas || hist) return;
    (async () => {
      try {
        const [pubs, eventos] = await Promise.all([todas(() => sb.from("publicacoes").select("processo_numero,data,tipo_com").order("id")), todas(() => sb.from("eventos").select("processo_numero,caso_id,tipo,dados,em").eq("tipo", "fase").order("id"))]);
        setHist({ pubs: pubs as PubMin[], eventos: eventos as EventoMin[] });
      } catch (e) { setErroHist("Não consegui carregar o histórico das publicações (" + ((e as Error).message || "erro") + "). As datas usam só as tarefas de protocolo e o nº CNJ."); setHist({ pubs: [], eventos: [] }); }
    })();
  }, [precisaDatas, hist]); // eslint-disable-line react-hooks/exhaustive-deps
  const prot = useMemo(() => hist ? datasDeProtocolo([...processos.values()], [...tarefas.values()], [...casos.values()], hist.pubs, hist.eventos) : null, [hist, processos, tarefas, casos, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const faixa = intervalo(per, hojeBR(), deU, ateU);
  const todos = useMemo(() => [...processos.values()], [processos, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const cidadeDe = useMemo(() => cidadesDeOrigem(todos), [todos]); // a origem é aprendida de todos os processos, não só dos filtrados
  const bancos = useMemo(() => [...new Set(todos.map((p) => bancoCurto(p.banco)))].sort(), [todos]);
  const prox = useMemo(() => { const m: Record<string, string> = {}; for (const t of tarefas.values()) if (t.status !== "feito" && t.processo_numero && t.vencimento && (!m[t.processo_numero] || t.vencimento < m[t.processo_numero])) m[t.processo_numero] = t.vencimento; return m; }, [tarefas, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const l = useMemo(() => {
    let x = todos;
    if (q) { const n = semAcento(q), d = soDigitos(q); x = x.filter((p) => semAcento(p.cliente_nome + " " + (p.banco || "") + " " + (p.orgao || "")).includes(n) || (d.length >= 4 && p.numero.includes(d))); }
    if (banco) x = x.filter((p) => bancoCurto(p.banco) === banco);
    if (fase) x = x.filter((p) => faseCRM(p.fase) === (fase === "none" ? "" : fase));
    if (per && prot && (faixa.de || faixa.ate)) {
      x = x.filter((p) => protocoladoEm(prot.get(p.numero), faixa.de, faixa.ate));
      return [...x].sort((a, b) => (prot.get(b.numero)?.data || "").localeCompare(prot.get(a.numero)?.data || "") || a.cliente_nome.localeCompare(b.cliente_nome));
    }
    return [...x].sort((a, b) => (b.ultima_data || "").localeCompare(a.ultima_data || ""));
  }, [todos, q, banco, fase, per, prot, faixa.de, faixa.ate]);
  const pg = usePaginacao("processos", l.length, [q, banco, fase, per, faixa.de, faixa.ate].join("|"));
  const filtrando = !!(q || banco || fase || per);
  const carregandoDatas = !!per && !prot;
  const rotPer = per === "periodo" ? (faixa.de || faixa.ate ? `Protocolados ${faixa.de ? "de " + dataBR(faixa.de) : ""}${faixa.ate ? " até " + dataBR(faixa.ate) : ""}` : "Escolha as datas") : PERIODOS.find(([k]) => k === per)?.[1] || "";
  const dataProt = (pr?: Protocolo) => !pr ? "—" : pr.precisao === "ano" ? pr.data.slice(0, 4) : dataBR(pr.data) + (pr.precisao === "aprox" ? "*" : "");
  return (
    <>
      <div className="head"><div><h2>Processos</h2><div className="sub" aria-live="polite">{carregandoDatas ? "Carregando as datas de protocolo…" : filtrando ? `${l.length} de ${processos.size} com esses filtros${per && rotPer ? " · " + rotPer.toLowerCase() + (per !== "periodo" && faixa.de ? ` (${dataBR(faixa.de)} a ${dataBR(faixa.ate)})` : "") : ""}` : `${processos.size} processos`}</div></div>
        <div className="tools"><button className="btn primary" onClick={() => j.novoProcesso()}>Novo processo</button>
          <input type="search" placeholder="Cliente, banco ou nº" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar processo" />
          <select value={banco} onChange={(e) => setBanco(e.target.value)} aria-label="Réu"><option value="">Todos os réus</option>{bancos.map((b) => <option key={b}>{b}</option>)}</select>
          <select value={fase} onChange={(e) => setFase(e.target.value)} aria-label="Fase"><option value="">Todas as fases</option><option value="none">Sem fase definida</option>{FASES.map((f) => <option key={f}>{f}</option>)}</select>
          <select value={per} onChange={(e) => setPer(e.target.value)} aria-label="Data do protocolo">{PERIODOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          {per === "periodo" && <><input type="date" aria-label="Protocolados a partir de" value={deU} onChange={(e) => setDe(e.target.value)} /><input type="date" aria-label="Protocolados até" value={ateU} onChange={(e) => setAte(e.target.value)} /></>}
          <button className="btn" title="PDF com quantos processos foram protocolados, em quais cidades e varas e em que mês, com os filtros da tela" onClick={() => setRelat(true)}>Relatório de protocolos (PDF)</button></div></div>
      {erroHist && <div className="banner">{erroHist}</div>}
      {relat && <RelatorioProtocolos onFechar={() => setRelat(false)} lista={l} prot={prot} titulo={per ? rotPer + (per !== "periodo" && faixa.de ? ` (${dataBR(faixa.de)} a ${dataBR(faixa.ate)})` : "") : "Todos os processos"}
        cidadeDe={cidadeDe} filtros={[banco ? "Réu: " + banco : "", fase ? "Fase: " + (fase === "none" ? "sem fase definida" : fase) : "", q ? "Busca: " + q : ""].filter(Boolean)} emitidoPor={eu.nome} />}
      {!processos.size ? <div className="panel"><div className="empty"><strong>Nenhum processo ainda.</strong>Importe os dados do painel antigo (Importar dados) ou aguarde a busca do DJEN.</div></div> :
        !l.length ? <div className="panel"><div className="empty"><strong>Nenhum processo com esses filtros.</strong><button className="btn" style={{ marginTop: 8 }} onClick={() => { setQ(""); setBanco(""); setFase(""); setPer(""); setDe(""); setAte(""); }}>Limpar busca e filtros</button></div></div> :
        <><div className="panel tscroll" ref={topo} tabIndex={-1} aria-label="Tabela de processos"><table className="grid"><caption className="sr-only">Processos{filtrando ? " filtrados" : ""}, página {pg.pagina} de {pg.paginas}. Enter abre o processo.</caption><thead><tr><th>Cliente</th><th>Réu</th><th>Processo</th><th>Fase</th>{prot && <th title="Data do protocolo da inicial. * = aproximada (1ª publicação no DJEN); só o ano = pelo nº CNJ">Protocolo</th>}<th>Último ato</th><th>Prazo</th><th /></tr></thead>
          <tbody>{l.slice(pg.ini, pg.fim).map((p) => { const pr = prox[p.numero]; const s = situacaoPrazo(pr); return (
            <tr key={p.numero} className="click" onClick={() => j.abrirProcesso(p.numero)} {...teclado(() => j.abrirProcesso(p.numero))}>
              <td><div style={{ fontWeight: 600 }}>{nomeBonito(p.cliente_nome) || "—"}</div><div className="s">{p.orgao || ""}</div></td>
              <td>{bancoCurto(p.banco)}</td><td className="mono">{p.mascara}</td>
              <td>{faseCRM(p.fase) ? <span className="pill acc">{faseCRM(p.fase)}</span> : <span className="muted">—</span>}</td>
              {prot && <td className="mono s" title={prot.get(p.numero)?.fonte || ""}>{dataProt(prot.get(p.numero))}</td>}
              <td><div>{p.ultimo_ato || "—"}</div><div className="s mono">{dataBR(p.ultima_data)}</div></td>
              <td>{pr && <span className={"pill " + s.cor}>{s.texto}</span>}</td>
              <td><button className="btn ghost" title="Criar tarefa" onClick={(e) => { e.stopPropagation(); j.novaTarefa(p.numero); }}>{Ic.tarefa}Tarefa</button></td>
            </tr>); })}</tbody></table></div>
        <Paginacao p={pg} rotulo="processos" alvo={topo} /></>}
    </>
  );
}

/** relatório de protocolos em PDF com a lista da tela: total, por mês, por cidade (com as varas) e ranking das varas */
function RelatorioProtocolos({ onFechar, lista, prot, titulo, filtros, emitidoPor, cidadeDe }: { cidadeDe: (p: ProcProt) => string; onFechar: () => void; lista: { numero: string; mascara: string; cliente_nome: string; orgao: string | null; cidade: string | null; banco: string | null; tribunal: string | null }[]; prot: Map<string, Protocolo> | null; titulo: string; filtros: string[]; emitidoPor: string }) {
  const [anexo, setAnexo] = useState(true); const [gerando, setGerando] = useState(false); const [erro, setErro] = useState("");
  const r = useMemo(() => prot ? resumirProtocolos(lista, prot, bancoCurto, nomeBonito, cidadeDe) : null, [lista, prot, cidadeDe]);
  const gerar = async () => {
    if (!r) return; setGerando(true); setErro("");
    try {
      const { pdfProtocolos } = await import("@/lib/protocolosPdf");
      const bytes = await pdfProtocolos(r, { titulo, filtros, emitidoPor, anexo });
      baixar(`relatorio-protocolos-${hojeBR()}.pdf`, new Blob([bytes as BlobPart], { type: "application/pdf" }), "application/pdf");
    } catch (e) { setErro("Não consegui gerar o PDF: " + ((e as Error).message || "erro")); }
    finally { setGerando(false); }
  };
  return (
    <Janela onFechar={onFechar} titulo="Relatório de protocolos" sub={titulo + (filtros.length ? " · " + filtros.join(" · ") : "")}
      acoes={<button className="btn primary" disabled={!r || gerando || !r.total} onClick={gerar}>{gerando ? "Gerando…" : "Gerar PDF"}</button>}>
      <p className="muted" style={{ marginTop: 0 }}>Usa os processos que estão na tela, com os filtros escolhidos (período do protocolo, réu, fase, busca). Para o mês, escolha “Protocolados neste mês” ou um período antes de abrir.</p>
      {!r ? <div className="muted" role="status">Carregando as datas de protocolo…</div> : !r.total ? <div className="empty"><strong>Nenhum processo com esses filtros.</strong></div> : <>
        <div className="pub-res" style={{ marginBottom: 10 }}>
          <span className="pub-chip"><b>{r.total}</b>processos</span>
          {r.porJustica.map((j) => <span key={j.nome} className="pub-chip"><b>{j.n}</b>Justiça {j.nome}</span>)}
          <span className="pub-chip"><b>{r.porCidade.length}</b>{r.porCidade.length === 1 ? "cidade" : "cidades"}</span>
          <span className="pub-chip"><b>{r.porVara.length}</b>{r.porVara.length === 1 ? "vara" : "varas"}</span>
        </div>
        <table className="grid"><caption className="sr-only">Processos por cidade e vara</caption><thead><tr><th>Cidade / vara</th><th style={{ textAlign: "right" }}>Processos</th></tr></thead>
          <tbody>{r.porCidade.map((c) => <Fragment key={c.nome}><tr><td><b>{c.nome}</b></td><td style={{ textAlign: "right" }}><b>{c.n}</b></td></tr>
            {(c.detalhe || []).map((v) => <tr key={c.nome + v.nome}><td className="muted" style={{ paddingLeft: 26 }}>{v.nome}</td><td style={{ textAlign: "right" }}>{v.n}</td></tr>)}</Fragment>)}</tbody></table>
        {r.porMes.length > 1 && <div className="muted s" style={{ marginTop: 8 }}>Por mês: {r.porMes.map((m) => `${m.nome}: ${m.n}`).join(" · ")}</div>}
        <label className="chk" style={{ marginTop: 12 }}><input type="checkbox" checked={anexo} onChange={(e) => setAnexo(e.target.checked)} />Incluir no PDF a lista dos processos</label>
        {erro && <div className="banner erro" role="alert">{erro}</div>}
      </>}
    </Janela>
  );
}
