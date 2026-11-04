"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDados, useOpcoesEquipe, msgErro } from "@/lib/dados";
import { bancoCurto, dataBR, iniciais, moeda, nomeBonito, semAcento } from "@/lib/formato";
import { mascaraCnj, soDigitos } from "@/lib/cnj";
import { DICAS_FASE, faseCRM } from "@/lib/regras";
import { A_CLASSIFICAR, ENCERRADO, PROTOCOLADO, type Quadro } from "@/lib/colunasCrm";
import type { Tarefa } from "@/lib/tipos";
import { Coluna, NovaColuna, ProxTarefa, useArrasto } from "@/components/crm";
import { JanelaColuna, JanelaLigarProcessos, useAtendimentosComProcesso, useColunas } from "@/components/colunasCrm";
import { useJanelas } from "@/components/janelas";
import { ExportarCrm } from "@/components/exportarCrm";
import { FasesComClaude } from "@/components/fasesClaude";
import { Avatar, Ic, teclado } from "@/components/ui";
import { honorarios, pctPadrao } from "@/lib/valores";

function CRM() {
  const d = useDados(); const { processos, casos, tarefas, sb, aplicar, registrar, aviso, titular, nome, v, eu } = d;
  const j = useJanelas(); const router = useRouter(); const sp = useSearchParams(); const ops = useOpcoesEquipe();
  const [q, setQ] = useState({ quadro: sp.get("caso") ? "pre" : "judicial", busca: "", banco: "", resp: "" });
  const [msg] = useState(""); const [exp, setExp] = useState(false);
  const cols = useColunas(); const orfaos = useAtendimentosComProcesso();
  const [edCol, setEdCol] = useState<{ quadro: Quadro; nome?: string; depoisDe?: string } | null>(null);
  const [ligar, setLigar] = useState<{ so?: string } | null>(null);
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
    if (etapa === PROTOCOLADO && !c.processo_numero) {
      if (orfaos.has(id)) { setLigar({ so: id }); return; }
      j.abrirCaso(id); aviso("Cole o nº do processo na ficha do atendimento: o cartão passa para o quadro Judicial."); return;
    }
    const { data, error } = await sb.from("casos").update({ etapa }).eq("id", id).select().single();
    if (error) { aviso(msgErro(error)); return; } aplicar("casos", data); registrar({ caso_id: id, tipo: "fase", dados: { fase: etapa } });
    if (etapa === "Elaboração da inicial" && ![...tarefas.values()].some((t) => t.caso_id === id && t.status !== "feito" && /inicial/i.test(t.descricao))) { j.abrirCaso(id, true); aviso("Crie a tarefa de elaboração da inicial."); }
  };
  const arrastou = useArrasto((id, col) => { if (col.startsWith("j:")) moverProc(id, col.slice(2)); else if (col.startsWith("p:")) moverCaso(id, col.slice(2)); });
  // só os processos sem fase ("A classificar"); o Claude sugere, a pessoa revisa e aplica
  const semFase = [...processos.values()].filter((p) => !faseCRM(p.fase));
  const [fasesClaude, setFasesClaude] = useState(false);
  const av = (id?: string | null) => id ? <Avatar id={id} pequeno /> : null;
  const padrao = pctPadrao(d.config);
  const vh = (x: { valor_causa?: number | null; honorarios_pct?: number | null }) => ({ v: x.valor_causa || 0, pct: x.honorarios_pct ?? padrao, h: honorarios(x.valor_causa, x.honorarios_pct ?? padrao) });
  const linhaValor = (x: { valor_causa?: number | null; honorarios_pct?: number | null }) => { const a = vh(x); return a.v ? <div className="kc-val"><span>R$ {moeda(a.v)}</span><span className="muted">hon. {String(a.pct).replace(".", ",")}%: <b>R$ {moeda(a.h)}</b></span></div> : null; };
  const soma = (l: { valor_causa?: number | null; honorarios_pct?: number | null }[]) => l.reduce((s, x) => { const a = vh(x); return { v: s.v + a.v, h: s.h + a.h, n: s.n + (a.v ? 1 : 0) }; }, { v: 0, h: 0, n: 0 });
  const curto = (n: number) => n >= 1e6 ? (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : n >= 1e3 ? Math.round(n / 1e3).toLocaleString("pt-BR") + " mil" : moeda(n);
  let visiveis: { valor_causa?: number | null; honorarios_pct?: number | null }[] = [];
  const mover = (atual: string, opcoes: [string, string][], onMover: (v: string) => void) =>
    <select className="kmove" aria-label="Mover para" value="" onClick={(e) => e.stopPropagation()} onChange={(e) => onMover(e.target.value)}><option value="">Mover para…</option>{opcoes.map(([k, t]) => <option key={k} value={k} disabled={k === atual}>{t}</option>)}</select>;
  let quadro;
  if (q.quadro === "judicial") {
    const procs = filtra([...processos.values()].filter((p) => faseCRM(p.fase) !== "Encerrado" || q.busca), (p) => p.cliente_nome, (p) => p.banco, (p) => p.responsavel, (p) => p.numero);
    const colsJ: [string, string][] = [["", A_CLASSIFICAR], ...cols.judicial.map((c) => [c.nome, c.nome] as [string, string]), ...(q.busca ? [[ENCERRADO, ENCERRADO] as [string, string]] : [])];
    const dicaJ = (k: string) => k === "" || k === ENCERRADO ? DICAS_FASE[k] : cols.judicial.find((c) => c.nome === k)?.dica;
    const editavel = (k: string) => titular && k !== "" && k !== ENCERRADO;
    const grupos = new Map(colsJ.map(([k]) => [k, [] as typeof procs]));
    for (const p of procs) { const f = faseCRM(p.fase); (grupos.get(grupos.has(f) ? f : "") || []).push(p); }
    visiveis = procs;
    quadro = <div className="kanban">{colsJ.map(([k, t]) => <Coluna key={k} chave={"j:" + k} titulo={t} onEditar={editavel(k) ? () => setEdCol({ quadro: "judicial", nome: k }) : undefined} extra={(() => { const s = soma(grupos.get(k) || []); return s.h ? "hon. R$ " + curto(s.h) : undefined; })()} dica={dicaJ(k)} cartoes={(grupos.get(k) || []).sort((a, b) => (b.ultima_data || "").localeCompare(a.ultima_data || "")).map((p) => (
      <article key={p.numero} className="kcard" data-id={p.numero} {...teclado(() => j.abrirProcesso(p.numero))} onClick={() => { if (!arrastou.current) j.abrirProcesso(p.numero); }}>
        <div className="kc1">{nomeBonito(p.cliente_nome || "—")}</div><div className="kc2">x {bancoCurto(p.banco)}{p.orgao ? " · " + p.orgao : ""}</div>
        <div className="kc3"><span className="mono">{p.mascara}</span>{av(p.responsavel)}</div>
        {linhaValor(p)}<ProxTarefa t={proxima.get(p.numero)} />{mover(faseCRM(p.fase), [...colsJ.filter(([k]) => k !== ENCERRADO), [ENCERRADO, ENCERRADO]], (f) => moverProc(p.numero, f))}</article>))} />)}
      {titular && <NovaColuna onClick={() => setEdCol({ quadro: "judicial" })} />}</div>;
  } else {
    // atendimento que já virou processo (tem nº) sai daqui: ele segue no quadro Judicial
    const comProcesso = [...casos.values()].filter((c) => c.processo_numero).length;
    const cs = filtra([...casos.values()].filter((c) => !c.processo_numero), (c) => c.nome, (c) => c.banco, (c) => c.responsavel, () => "");
    const nomes = cols.pre.map((c) => c.nome);
    const grupos = new Map(nomes.map((e) => [e, [] as typeof cs])); for (const c of cs) (grupos.get(c.etapa) || grupos.get(nomes[0])!).push(c);
    visiveis = cs;
    const opcoes: [string, string][] = [...nomes.map((x) => [x, x] as [string, string]), [PROTOCOLADO, "Protocolado (informar nº do processo)"]];
    quadro = <>{!casos.size && <div className="banner">Nenhum atendimento ainda. Clique em “Novo atendimento” para cadastrar o primeiro caso, antes de virar processo.</div>}
      {orfaos.size > 0 && <div className="banner">{orfaos.size === 1 ? "1 atendimento parece" : orfaos.size + " atendimentos parecem"} já ter virado processo (mesmo cliente e banco, processo cadastrado depois, muitas vezes pelo DJEN).{" "}
        <button className="reflink" onClick={() => setLigar({})}>Revisar e ligar</button></div>}
      <div className="kanban">{cols.pre.map((col) => <Coluna key={col.nome} chave={"p:" + col.nome} titulo={col.nome} onEditar={titular ? () => setEdCol({ quadro: "pre", nome: col.nome }) : undefined} extra={(() => { const s = soma(grupos.get(col.nome) || []); return s.h ? "hon. R$ " + curto(s.h) : undefined; })()} dica={col.dica} cartoes={(grupos.get(col.nome) || []).sort((a, b) => b.criado_em.localeCompare(a.criado_em)).map((c) => {
        const ps = orfaos.get(c.id);
        return (
        <article key={c.id} className="kcard" data-id={c.id} {...teclado(() => j.abrirCaso(c.id))} onClick={() => { if (!arrastou.current) j.abrirCaso(c.id); }}>
          <div className="kc1">{nomeBonito(c.nome || "—")}</div><div className="kc2">x {c.banco ? bancoCurto(c.banco) : "banco a definir"}{c.contratos ? " · " + c.contratos : ""}</div>
          <div className="kc3"><span className="muted">desde {dataBR(c.criado_em.slice(0, 10))}</span>{av(c.responsavel)}</div>
          {linhaValor(c)}<ProxTarefa t={proxima.get("c:" + c.id)} />
          {ps && <button type="button" className="kc-ligar" onClick={(e) => { e.stopPropagation(); setLigar({ so: c.id }); }} title="Ligar este atendimento ao processo: o cartão passa para o quadro Judicial">
            ⚖ {ps.length === 1 ? "Já tem processo " + mascaraCnj(ps[0].numero) + ": ligar" : ps.length + " processos possíveis: ligar"}</button>}
          {mover(c.etapa, opcoes, (x) => moverCaso(c.id, x))}</article>); })} />)}
        <Coluna chave={"p:" + PROTOCOLADO} titulo="Protocolado → Judicial" classe="kcol-saida" contar={false} cartoes={[]}
          extra={comProcesso ? <button className="reflink" onClick={() => setQ({ ...q, quadro: "judicial" })}>{comProcesso} já no quadro Judicial</button> : undefined}
          dica="Solte o cartão aqui ao protocolar: informe o nº e ele passa para o quadro Judicial" vazio="Solte aqui para protocolar" />
        {titular && <NovaColuna onClick={() => setEdCol({ quadro: "pre", depoisDe: nomes[nomes.length - 1] })} />}</div></>;
  }
  return (
    <>
      <div className="pg-title"><h2>CRM</h2><span className="muted">{q.quadro === "pre" ? "Do primeiro atendimento ao protocolo" : "Andamento judicial por fase"}</span></div>
      <div className="toolbar">
        <div className="seg" role="tablist">{([["pre", "Pré-processual"], ["judicial", "Judicial"]] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={q.quadro === k} onClick={() => setQ({ ...q, quadro: k })}>{t}</button>)}</div>
        {q.quadro === "pre" && <button className="btn primary" onClick={() => j.abrirCaso("novo")}>Novo atendimento</button>}
        <label className="tb">{Ic.busca}<input type="search" aria-label="Buscar cliente ou nº do processo" placeholder="Buscar cliente ou nº" value={q.busca} onChange={(e) => setQ({ ...q, busca: e.target.value })} /></label>
        <label className="tb">{Ic.filtro}<select aria-label="Filtrar por réu (banco)" value={q.banco} onChange={(e) => setQ({ ...q, banco: e.target.value })}><option value="">Todos os bancos</option>{bancos.map((b) => <option key={b}>{b}</option>)}</select></label>
        <label className="tb">{Ic.filtro}<select aria-label="Filtrar por responsável" value={q.resp} onChange={(e) => setQ({ ...q, resp: e.target.value })}><option value="">Todos os responsáveis</option>{ops.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}</select></label>
        {q.quadro === "judicial" && titular && semFase.length > 0 && <button className="btn ghost" title="O Claude lê o histórico de cada processo em “A classificar” e sugere a fase; você revisa antes de gravar" onClick={() => setFasesClaude(true)}>{Ic.claude}Sugerir fases com o Claude ({semFase.length})</button>}
        {fasesClaude && <FasesComClaude onFechar={() => setFasesClaude(false)} />}
      </div>
      {msg && <div className="banner">{msg}</div>}
      {(() => { const s = soma(visiveis);
        return <div className="crm-tot">
          <div><span className="muted">Valor das causas</span><strong>R$ {moeda(s.v)}</strong><span className="muted s">{s.n} de {visiveis.length} com valor</span></div>
          <div><span className="muted">Honorários contratuais possíveis</span><strong className="acc">R$ {moeda(s.h)}</strong><span className="muted s">percentual de cada caso, ou {String(padrao).replace(".", ",")}% (padrão)</span></div>
          <button className="btn" onClick={() => setExp(true)}>{Ic.exportar}Exportar relatório</button>
        </div>; })()}
      {quadro}
      {exp && <ExportarCrm onFechar={() => setExp(false)} banco={q.banco} resp={q.resp} />}
      {edCol && <JanelaColuna key={edCol.quadro + (edCol.nome || "+")} quadro={edCol.quadro} nome={edCol.nome} depoisDe={edCol.depoisDe} onFechar={() => setEdCol(null)} />}
      {ligar && <JanelaLigarProcessos so={ligar.so} onFechar={() => setLigar(null)} />}
    </>
  );
}
export default function Pagina() { return <Suspense><CRM /></Suspense>; }
