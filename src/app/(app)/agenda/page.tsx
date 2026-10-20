"use client";
// Agenda: tarefas (e correções), intimações do DJEN, audiências e coletas e avisos a clientes,
// por mês, semana ou dia, com filtros por tipo, situação e responsável.
import { useEffect, useMemo, useState } from "react";
import { useDados } from "@/lib/dados";
import { bancoCurto, nomeBonito } from "@/lib/formato";
import { hojeBR, isoData, paraData, somaDias } from "@/lib/prazos";
import { atoPub, ehAgenda, MODALIDADES } from "@/lib/regras";
import type { Aviso, Publicacao, Tarefa } from "@/lib/tipos";
import { useJanelas } from "@/components/janelas";
import { Avatar } from "@/components/ui";

type Tipo = "tarefa" | "correcao" | "intimacao" | "ato" | "aviso";
type Sit = "pend" | "conc" | "atras";
type Item = { id: string; tipo: Tipo; sit: Sit; dia: string; hora?: string; titulo: string; cli: string; reu: string; resp: string | null; abrir: () => void };
const TIPOS: Record<Tipo, { nome: string; cor: string }> = {
  tarefa: { nome: "Tarefas", cor: "var(--accent)" },
  correcao: { nome: "Correções de peça", cor: "#a77bdb" },
  intimacao: { nome: "Intimações do DJEN", cor: "#4f9bd9" },
  ato: { nome: "Audiências e coletas", cor: "#e0884a" },
  aviso: { nome: "Avisos a clientes", cor: "#3fae72" },
};
const SITS: Record<Sit, { nome: string; cor: string }> = { pend: { nome: "Pendentes", cor: "var(--soon)" }, conc: { nome: "Concluídas", cor: "var(--ok)" }, atras: { nome: "Atrasadas", cor: "var(--late)" } };
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const SEM = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const diaLocal = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : "");
type Filtros = { modo: "mes" | "semana" | "dia"; resp: string; base: "compromisso" | "conclusao"; tipos: Tipo[]; sits: Sit[] };
const PADRAO: Filtros = { modo: "mes", resp: "", base: "compromisso", tipos: ["tarefa", "correcao", "intimacao", "ato", "aviso"], sits: ["pend", "atras"] };
const ler = (): Filtros => { try { return { ...PADRAO, ...JSON.parse(localStorage.getItem("agenda.filtros") || "{}") }; } catch { return PADRAO; } };

export default function Agenda() {
  const { tarefas, avisos, caixa, processos, casos, equipe, sb, nome, v } = useDados(); const j = useJanelas();
  const [f, setF] = useState<Filtros>(PADRAO); const [ref, setRef] = useState(hojeBR()); const [pubs, setPubs] = useState<Publicacao[]>([]);
  useEffect(() => { setF(ler()); }, []);
  const muda = (c: Partial<Filtros>) => setF((x) => { const n = { ...x, ...c }; try { localStorage.setItem("agenda.filtros", JSON.stringify(n)); } catch { /* sem armazenamento */ } return n; });
  const hoje = hojeBR();
  // período visível
  const { ini, fim, dias, rot } = useMemo(() => {
    const d = paraData(ref);
    if (f.modo === "dia") return { ini: ref, fim: ref, dias: [ref], rot: d.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }) };
    if (f.modo === "semana") { const a = somaDias(d, -d.getUTCDay()); const ds = Array.from({ length: 7 }, (_, i) => isoData(somaDias(a, i))); const b = paraData(ds[6]);
      return { ini: ds[0], fim: ds[6], dias: ds, rot: `${a.getUTCDate()}${a.getUTCMonth() !== b.getUTCMonth() ? " de " + MESES[a.getUTCMonth()].toLowerCase() : ""} a ${b.getUTCDate()} de ${MESES[b.getUTCMonth()].toLowerCase()} ${b.getUTCFullYear()}` }; }
    const p1 = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); const a = somaDias(p1, -p1.getUTCDay());
    const ult = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)); const b = somaDias(ult, 6 - ult.getUTCDay());
    const ds: string[] = []; for (let x = a; x <= b; x = somaDias(x, 1)) ds.push(isoData(x));
    return { ini: ds[0], fim: ds[ds.length - 1], dias: ds, rot: `${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}` };
  }, [ref, f.modo]);
  // intimações do período (as da caixa já estão na memória; as já analisadas vêm do banco)
  useEffect(() => {
    if (!f.tipos.includes("intimacao")) return;
    sb.from("publicacoes").select("id,data,processo_numero,tipo_doc,tipo_com,orgao,triagem").gte("data", ini).lte("data", fim).order("data").limit(2000)
      .then(({ data }: { data: unknown }) => setPubs((data as Publicacao[]) || []));
  }, [ini, fim, sb, f.tipos.includes("intimacao")]); // eslint-disable-line react-hooks/exhaustive-deps

  const itens = useMemo(() => {
    const out: Item[] = [];
    const partes = (numero?: string | null, casoId?: string | null) => {
      if (numero) { const p = processos.get(numero); return { cli: nomeBonito(p?.cliente_nome || "—"), reu: bancoCurto(p?.banco), resp: p?.responsavel || null }; }
      const c = casoId ? casos.get(casoId) : undefined; return { cli: nomeBonito(c?.nome || "—"), reu: c?.banco ? bancoCurto(c.banco) + " · pré-processual" : "pré-processual", resp: c?.responsavel || null };
    };
    for (const t of tarefas.values() as Iterable<Tarefa>) {
      const feito = t.status === "feito"; const dia = f.base === "conclusao" ? (feito ? diaLocal(t.feito_em) : t.vencimento) : t.vencimento; if (!dia) continue;
      const correcao = ["revisao", "ajustes", "aprovada"].includes(t.status);
      const pt = partes(t.processo_numero, t.caso_id);
      out.push({ id: "t" + t.id, tipo: correcao ? "correcao" : "tarefa", sit: feito ? "conc" : t.vencimento && t.vencimento < hoje ? "atras" : "pend", dia,
        titulo: (correcao ? (t.status === "revisao" ? "Corrigir: " : t.status === "ajustes" ? "Ajustar: " : "Protocolar: ") : "") + t.descricao, cli: pt.cli, reu: pt.reu,
        resp: correcao && t.status === "revisao" ? t.revisor : t.responsavel, abrir: () => j.abrirTarefa(t.id) });
    }
    const vistas = new Set<number>();
    for (const x of [...caixa.values(), ...pubs]) {
      if (vistas.has(x.id) || x.data < ini || x.data > fim) continue; vistas.add(x.id);
      const pt = partes(x.processo_numero); const pend = caixa.has(x.id) || x.triagem === "pendente";
      out.push({ id: "p" + x.id, tipo: "intimacao", sit: pend ? "pend" : "conc", dia: x.data, titulo: "Intimação: " + atoPub(x), cli: pt.cli, reu: pt.reu, resp: pt.resp,
        abrir: () => (caixa.has(x.id) ? j.abrirPub(x.id) : j.abrirProcesso(x.processo_numero, { aba: "intimacoes", alvo: "pub-" + x.id })) });
    }
    for (const a of avisos.values() as Iterable<Aviso>) {
      if (!a.data_evento) continue; const ag = ehAgenda(a); const pt = partes(a.processo_numero);
      const feito = ag ? !!a.realizado_em : a.status === "avisado";
      out.push({ id: "a" + a.id, tipo: ag ? "ato" : "aviso", sit: feito ? "conc" : a.data_evento < hoje ? "atras" : "pend", dia: a.data_evento, hora: a.modalidade === "jf_balcao" ? "até" : (a.hora || "").slice(0, 5) || undefined,
        titulo: ag ? `${a.tipo_evento || "Ato"}${a.modalidade ? " · " + MODALIDADES[a.modalidade].curto : ""}${a.status === "avisado" ? " · cliente avisado" : " · avisar cliente"}` : `Avisar cliente: ${a.tipo_evento || "ato"}${a.status === "avisado" ? " (avisado)" : ""}`,
        cli: pt.cli, reu: pt.reu, resp: pt.resp, abrir: () => j.abrirAviso(a.id) });
    }
    return out.filter((i) => i.dia >= ini && i.dia <= fim && f.tipos.includes(i.tipo) && f.sits.includes(i.sit) && (!f.resp || (f.resp === "none" ? !i.resp : i.resp === f.resp)))
      .sort((a, b) => (a.hora || "99").localeCompare(b.hora || "99") || a.tipo.localeCompare(b.tipo));
  }, [tarefas, avisos, caixa, pubs, processos, casos, f, ini, fim, hoje, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const porDia = useMemo(() => { const m = new Map<string, Item[]>(); for (const i of itens) m.set(i.dia, [...(m.get(i.dia) || []), i]); return m; }, [itens]);
  const mover = (s: number) => { const d = paraData(ref); setRef(isoData(f.modo === "mes" ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + s, 1)) : somaDias(d, s * (f.modo === "semana" ? 7 : 1)))); };
  const mesRef = ref.slice(0, 7);
  const alterna = <T,>(l: T[], x: T) => (l.includes(x) ? l.filter((y) => y !== x) : [...l, x]);

  const Cartao = ({ i, curto }: { i: Item; curto?: boolean }) => (
    <button className={"ag-card s-" + i.sit} style={{ borderLeftColor: TIPOS[i.tipo].cor }} onClick={i.abrir} title={`${i.titulo} · ${i.cli}${i.resp ? " · " + nome(i.resp) : ""}`}>
      <span className="ag-t" style={{ color: i.sit === "atras" ? "var(--late)" : undefined }}>{i.hora ? <b>{i.hora} </b> : null}{i.titulo}</span>
      {!curto && <span className="ag-c">{i.cli}{i.reu && i.reu !== "—" ? <><br />{i.reu}</> : null}</span>}
      <span className="ag-pe">{i.resp ? <Avatar id={i.resp} pequeno /> : <span className="muted" style={{ fontSize: 11 }}>sem resp.</span>}{curto && <span className="ag-c1">{i.cli}</span>}<span className="ag-sit" style={{ background: SITS[i.sit].cor }} title={SITS[i.sit].nome} /></span>
    </button>
  );
  return (
    <div className="ag">
      <aside className="ag-lado">
        <div className="seg ag-modo" role="tablist">{([["mes", "Mês"], ["semana", "Semana"], ["dia", "Dia"]] as const).map(([k, t]) => <button key={k} role="tab" aria-selected={f.modo === k} className={f.modo === k ? "on" : ""} onClick={() => muda({ modo: k })}>{t}</button>)}</div>
        <div className="ag-bloco"><h4>Agenda</h4>
          <select value={f.resp} onChange={(e) => muda({ resp: e.target.value })} aria-label="Filtrar por colaborador"><option value="">Toda a equipe</option>{equipe.filter((p) => p.ativo).map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}<option value="none">Sem responsável</option></select>
          <select value={f.base} onChange={(e) => muda({ base: e.target.value as Filtros["base"] })} aria-label="Data das tarefas"><option value="compromisso">Data do compromisso</option><option value="conclusao">Data de conclusão (concluídas)</option></select>
          {f.resp && <button className="reflink" onClick={() => muda({ resp: "" })}>Limpar filtro</button>}
        </div>
        <div className="ag-bloco"><h4>Mostrar</h4>{(Object.keys(TIPOS) as Tipo[]).map((k) => (
          <label key={k} className="ag-chk"><input type="checkbox" checked={f.tipos.includes(k)} onChange={() => muda({ tipos: alterna(f.tipos, k) })} /><span className="ag-dot" style={{ background: TIPOS[k].cor }} />{TIPOS[k].nome}</label>))}</div>
        <div className="ag-bloco"><h4>Situação</h4>{(Object.keys(SITS) as Sit[]).map((k) => (
          <label key={k} className="ag-chk"><input type="checkbox" checked={f.sits.includes(k)} onChange={() => muda({ sits: alterna(f.sits, k) })} /><span className="ag-dot" style={{ background: SITS[k].cor }} />{SITS[k].nome}</label>))}</div>
        <div className="muted" style={{ fontSize: 12 }}>{itens.length} {itens.length === 1 ? "item" : "itens"} no período</div>
      </aside>
      <section className="ag-main">
        <div className="ag-topo"><button className="icb" aria-label="Anterior" onClick={() => mover(-1)}>‹</button><button className="icb" aria-label="Próximo" onClick={() => mover(1)}>›</button>
          <h2>{rot.charAt(0).toUpperCase() + rot.slice(1)}</h2><button className="btn ghost" onClick={() => setRef(hojeBR())}>Hoje</button></div>
        {f.modo === "dia" ? <div className="ag-diaLista">{(porDia.get(ref) || []).length ? (porDia.get(ref) || []).map((i) => <Cartao key={i.id} i={i} />) : <div className="empty">Nada neste dia com os filtros escolhidos.</div>}</div>
          : <div className="tscroll"><div className={"ag-grade " + f.modo}>
            {SEM.map((s) => <div key={s} className="ag-sem">{s}</div>)}
            {dias.map((d) => { const l = porDia.get(d) || []; const fora = f.modo === "mes" && d.slice(0, 7) !== mesRef; const max = f.modo === "mes" ? 3 : 50;
              return <div key={d} className={"ag-cel" + (fora ? " fora" : "") + (d === hoje ? " hoje" : "")}>
                <button className="ag-num" title="Ver o dia" onClick={() => { setRef(d); muda({ modo: "dia" }); }}>{+d.slice(8, 10)}</button>
                {l.slice(0, max).map((i) => <Cartao key={i.id} i={i} curto={f.modo === "mes"} />)}
                {l.length > max && <button className="reflink ag-mais" onClick={() => { setRef(d); muda({ modo: "dia" }); }}>+ {l.length - max} mais</button>}
              </div>; })}
          </div></div>}
      </section>
    </div>
  );
}
