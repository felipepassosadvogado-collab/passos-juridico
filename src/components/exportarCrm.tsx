"use client";
// Janela "Exportar relatório" do CRM: filtros (inclusive período do protocolo da inicial), metas de honorários
// e geração do relatório de gestão em PDF (ou planilha CSV com os mesmos filtros).
import { useEffect, useMemo, useState } from "react";
import { todas, useDados, useOpcoesEquipe } from "@/lib/dados";
import { bancoCurto, moeda, nomeBonito } from "@/lib/formato";
import { FASES } from "@/lib/regras";
import { montarRelatorioCrm, processosParaMeta, type EventoMin, type FiltrosCrm, type PubMin } from "@/lib/relatorioCrm";
import { mediaPlanejamento, pdfRelatorioCrm } from "@/lib/relatorioCrmPdf";
import { pctPadrao } from "@/lib/valores";
import { Janela, baixar } from "./ui";

const hojeSP = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
const ultimoDia = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const ATALHOS: [string, string][] = [["tudo", "Todo o período"], ["mes", "Este mês"], ["mes_ant", "Mês passado"], ["tri", "Últimos 3 meses"], ["doze", "Últimos 12 meses"], ["ano", "Este ano"], ["ano_ant", "Ano passado"], ["pers", "Personalizado"]];
function periodo(k: string): [string, string] {
  const [a, m] = hojeSP().split("-").map(Number); const h = hojeSP();
  const volta = (n: number) => { let aa = a, mm = m - n; while (mm < 1) { mm += 12; aa--; } return iso(aa, mm, 1); };
  switch (k) {
    case "mes": return [iso(a, m, 1), h];
    case "mes_ant": { const aa = m === 1 ? a - 1 : a, mm = m === 1 ? 12 : m - 1; return [iso(aa, mm, 1), iso(aa, mm, ultimoDia(aa, mm))]; }
    case "tri": return [volta(2), h];
    case "doze": return [volta(11), h];
    case "ano": return [iso(a, 1, 1), h];
    case "ano_ant": return [iso(a - 1, 1, 1), iso(a - 1, 12, 31)];
    default: return ["", ""];
  }
}
const dataBR = (d: string) => (d ? d.split("-").reverse().join("/") : "");
const numBR = (s: string) => Number(s.replace(/[^\d,]/g, "").replace(",", "."));
const TODAS_FASES = ["", ...FASES];
const rotFase = (f: string) => f || "A classificar";

export function ExportarCrm({ onFechar, banco, resp }: { onFechar: () => void; banco: string; resp: string }) {
  const d = useDados(); const { processos, casos, tarefas, sb, nome, eu, aviso } = d; const ops = useOpcoesEquipe();
  const [extra, setExtra] = useState<{ pubs: PubMin[]; eventos: EventoMin[] } | null>(null); const [erro, setErro] = useState("");
  const [atalho, setAtalho] = useState("tudo"); const [de, setDe] = useState(""); const [ate, setAte] = useState("");
  const [fases, setFases] = useState<string[]>(TODAS_FASES.filter((f) => f !== "Encerrado"));
  const [F, setF] = useState({ banco, resp, justica: "" as FiltrosCrm["justica"] });
  const [metas, setMetas] = useState("10.000; 30.000; 50.000; 100.000"); const [exito, setExito] = useState("100"); const [anexo, setAnexo] = useState(true);
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [pubs, ev1, ev2] = await Promise.all([
          todas(() => sb.from("publicacoes").select("processo_numero,data,tipo_com").order("id")),
          todas(() => sb.from("eventos").select("processo_numero,caso_id,tipo,dados,em").eq("tipo", "fase").order("id")),
          todas(() => sb.from("eventos").select("processo_numero,caso_id,tipo,dados,em").eq("tipo", "comentario").ilike("dados->>texto", "Valor da causa atualizado pelo c%").order("id")),
        ]);
        setExtra({ pubs: pubs as PubMin[], eventos: [...ev1, ...ev2] as EventoMin[] });
      } catch (e) { setErro("Não consegui carregar o histórico de publicações e fases (" + ((e as Error).message || "erro") + "). O relatório sai só com os dados já abertos."); setExtra({ pubs: [], eventos: [] }); }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const bancos = useMemo(() => [...new Set([...processos.values()].map((p) => bancoCurto(p.banco)))].filter((x) => x && x !== "—").sort(), [processos]);
  const filtros: FiltrosCrm = { de, ate, fases: fases.length === TODAS_FASES.length ? [] : fases, incluirEncerrados: fases.includes("Encerrado"), banco: F.banco, responsavel: F.resp, justica: F.justica };
  const padrao = pctPadrao(d.config);
  const rel = useMemo(() => extra ? montarRelatorioCrm({ processos: [...processos.values()], casos: [...casos.values()], tarefas: [...tarefas.values()], pubs: extra.pubs, eventos: extra.eventos, filtros, pctPadrao: padrao, nome: (id) => (id ? nome(id) : "Sem responsável"), bancoCurto: (b) => bancoCurto(b) }) : null,
    [extra, de, ate, fases, F, processos, casos, tarefas, padrao]); // eslint-disable-line react-hooks/exhaustive-deps
  const listaMetas = metas.split(/[;\n]/).map(numBR).filter((x) => x > 0).slice(0, 8);
  const ex = Math.min(100, Math.max(1, numBR(exito) || 100)) / 100;
  const plan = rel ? mediaPlanejamento(rel) : null;

  const descricao = () => {
    const per = de || ate ? `Iniciais protocoladas ${de && ate ? `de ${dataBR(de)} a ${dataBR(ate)}` : de ? `a partir de ${dataBR(de)}` : `até ${dataBR(ate)}`}` : "Todos os processos (qualquer data de protocolo)";
    const fs = fases.length === TODAS_FASES.length ? "todas as fases" : fases.length === TODAS_FASES.length - 1 && !fases.includes("Encerrado") ? "todas as fases, exceto encerrados" : fases.map(rotFase).join(", ");
    return [per, "Fases: " + fs, `Réu: ${F.banco || "todos"} · Responsável: ${F.resp ? nome(F.resp) : "todos"} · Justiça: ${F.justica === "jf" ? "Federal" : F.justica === "tjsc" ? "Estadual (TJSC)" : "todas"}`];
  };
  const gerarPdf = async () => {
    if (!rel) return; setGerando(true);
    try {
      const bytes = await pdfRelatorioCrm(rel, { emitidoPor: nome(eu.id), descricaoFiltros: descricao(), metas: listaMetas, exito: ex, anexo });
      baixar(`relatorio-gestao-crm-${hojeSP()}.pdf`, new Blob([bytes as BlobPart], { type: "application/pdf" }), "application/pdf");
    } catch (e) { aviso("Não consegui gerar o PDF: " + ((e as Error).message || "erro")); }
    finally { setGerando(false); }
  };
  const gerarCsv = () => {
    if (!rel) return; const esc = (x: unknown) => '"' + String(x ?? "").replace(/"/g, '""') + '"';
    const cab = ["Cliente", "Processo", "Réu", "Fase", "Responsável", "Justiça", "Protocolo da inicial", "Fonte da data", "Valor da causa (R$)", "Honorários (%)", "Honorários (R$)", "Valor calculado no cumprimento"];
    const ls = rel.linhas.map((l) => [nomeBonito(l.cliente), l.mascara, l.banco, l.fase || "A classificar", l.responsavel, l.justica === "jf" ? "Federal" : "Estadual", l.protocolo ? (l.protocolo.precisao === "ano" ? l.protocolo.data.slice(0, 4) : dataBR(l.protocolo.data)) : "", l.protocolo?.fonte || "", l.valor ? moeda(l.valor) : "", l.valor ? String(l.pct).replace(".", ",") : "", l.valor ? moeda(l.hon) : "", l.calculado ? "sim" : ""]);
    const linhas = [cab, ...ls, [], ["TOTAL", "", "", "", "", "", "", "", moeda(rel.total.valor), "", moeda(rel.total.hon), ""]].map((l) => l.map(esc).join(";"));
    baixar(`crm-processos-${hojeSP()}.csv`, "﻿" + linhas.join("\r\n"), "text/csv;charset=utf-8");
  };
  const mudaAtalho = (k: string) => { setAtalho(k); if (k !== "pers") { const [a, b] = periodo(k); setDe(a); setAte(b); } };
  const alterna = (f: string) => setFases((x) => (x.includes(f) ? x.filter((y) => y !== f) : [...x, f]));

  return (
    <Janela largo titulo="Relatório de gestão" sub="Carteira, médias de honorários por processo e planejamento de metas" onFechar={onFechar}
      acoes={<><button className="btn ghost" disabled={!rel} onClick={gerarCsv}>Planilha (CSV)</button><button className="btn primary" disabled={!rel || gerando || !rel.total.n} onClick={gerarPdf}>{gerando ? "Gerando…" : "Gerar PDF"}</button></>}>
      {erro && <div className="banner erro">{erro}</div>}
      <div className="rcrm">
        <section>
          <h4>Protocolo da inicial</h4>
          <div className="triage">
            <label className="f">Período<select value={atalho} onChange={(e) => mudaAtalho(e.target.value)}>{ATALHOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
            <label className="f">De<input type="date" value={de} onChange={(e) => { setDe(e.target.value); setAtalho("pers"); }} /></label>
            <label className="f">Até<input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setAtalho("pers"); }} /></label>
          </div>
          <h4>Fases</h4>
          <div className="rcrm-chips">
            <button type="button" className="reflink" onClick={() => setFases(TODAS_FASES.filter((f) => f !== "Encerrado"))}>em aberto</button>
            <button type="button" className="reflink" onClick={() => setFases(TODAS_FASES.filter((f) => f !== "Encerrado" && f !== "Cumprimento de sentença"))}>só em andamento</button>
            <button type="button" className="reflink" onClick={() => setFases(["Cumprimento de sentença"])}>só cumprimento</button>
            <button type="button" className="reflink" onClick={() => setFases([...TODAS_FASES])}>todas</button>
          </div>
          <div className="rcrm-chips">{TODAS_FASES.map((f) => <label key={f} className={"fchip" + (fases.includes(f) ? " on" : "")}><input type="checkbox" checked={fases.includes(f)} onChange={() => alterna(f)} />{rotFase(f)}</label>)}</div>
          <div className="triage">
            <label className="f">Réu<select value={F.banco} onChange={(e) => setF({ ...F, banco: e.target.value })}><option value="">Todos</option>{bancos.map((b) => <option key={b}>{b}</option>)}</select></label>
            <label className="f">Responsável<select value={F.resp} onChange={(e) => setF({ ...F, resp: e.target.value })}><option value="">Todos</option>{ops.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></label>
            <label className="f">Justiça<select value={F.justica} onChange={(e) => setF({ ...F, justica: e.target.value as FiltrosCrm["justica"] })}><option value="">Todas</option><option value="jf">Federal</option><option value="tjsc">Estadual (TJSC)</option></select></label>
          </div>
          <h4>Planejamento</h4>
          <div className="triage">
            <label className="f" style={{ flex: 2 }}>Metas de honorários (R$, separe com ;)<input value={metas} onChange={(e) => setMetas(e.target.value)} /></label>
            <label className="f">Taxa de êxito estimada (%)<input inputMode="decimal" value={exito} onChange={(e) => setExito(e.target.value)} /></label>
          </div>
          <label className="chk"><input type="checkbox" checked={anexo} onChange={(e) => setAnexo(e.target.checked)} /> Incluir a lista de processos no fim do PDF</label>
        </section>
        <aside className="rcrm-prev">
          {!rel ? <div className="muted">Carregando o histórico de publicações e fases…</div> : <>
            <div className="muted s">Prévia com estes filtros</div>
            <div className="rcrm-n"><strong>{rel.total.n}</strong> processos <span className="muted s">({rel.total.comValor} com valor)</span></div>
            <dl>
              <dt>Honorários esperados</dt><dd>R$ {moeda(rel.total.hon)}</dd>
              <dt>Média por processo</dt><dd>R$ {moeda(rel.total.media)} <span className="muted s">mediana R$ {moeda(rel.total.mediana)}</span></dd>
              <dt>Em andamento</dt><dd>R$ {moeda(rel.andamento.media)} <span className="muted s">{rel.andamento.comValor} proc.</span></dd>
              <dt>Cumprimento de sentença</dt><dd>R$ {moeda(rel.cumprimento.media)} <span className="muted s">{rel.cumprimento.comValor} proc. · {rel.cumpr.calculados} calculados</span></dd>
              {rel.cumpr.fatorRealizacao != null && <><dt>Fator de realização</dt><dd>{(rel.cumpr.fatorRealizacao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% <span className="muted s">{rel.cumpr.pareados.length} casos</span></dd></>}
              <dt>Ritmo de protocolos</dt><dd>{rel.ritmoMensal.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por mês</dd>
            </dl>
            {plan && plan.valor > 0 && listaMetas.length > 0 && <>
              <div className="muted s" style={{ marginTop: 10 }}>Média para planejar: <b>R$ {moeda(plan.valor)}</b> ({plan.base})</div>
              <table className="rcrm-metas"><tbody>{listaMetas.map((m) => { const n = processosParaMeta(m, plan.valor, ex); return <tr key={m}><td>R$ {moeda(m)}</td><td className="num"><b>{n ?? "-"}</b> processos</td></tr>; })}</tbody></table>
            </>}
            {(rel.semData.ano > 0 || rel.semData.aprox > 0) && <div className="muted s" style={{ marginTop: 8 }}>{rel.semData.ano ? `${rel.semData.ano} só com o ano do protocolo. ` : ""}{rel.semData.aprox ? `${rel.semData.aprox} com data aproximada.` : ""}</div>}
          </>}
        </aside>
      </div>
    </Janela>
  );
}
