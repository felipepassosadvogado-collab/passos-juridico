"use client";
// Financeiro (só o titular): receitas e despesas do escritório. Os honorários dos processos entram sozinhos pela
// prestação de contas; o resto se lança à mão. Resumo do mês ou do ano, por categoria, e a lista com edição.
import { useEffect, useMemo, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataBR, moeda, nomeBonito, numeroBR } from "@/lib/formato";
import { hojeBR, isoData, paraData } from "@/lib/prazos";
import { CATEGORIAS_DESPESA, CATEGORIAS_RECEITA, resumirFinanceiro, type Lancamento } from "@/lib/financeiro";
import { useJanelas } from "@/components/janelas";
import { useConfirmar } from "@/components/ui";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const brl = (v: number) => "R$ " + moeda(v);
type Form = { id?: string; tipo: "receita" | "despesa"; categoria: string; descricao: string; valor: string; data: string; status: "recebido" | "previsto"; processo: string; obs: string };
const vazio = (): Form => ({ tipo: "receita", categoria: CATEGORIAS_RECEITA[0], descricao: "", valor: "", data: hojeBR(), status: "recebido", processo: "", obs: "" });

export default function Financeiro() {
  const { sb, titular, processos, clientes, aviso } = useDados(); const j = useJanelas(); const confirmar = useConfirmar();
  const [modo, setModo] = useState<"mes" | "ano">("mes"); const [ref, setRef] = useState(hojeBR().slice(0, 8) + "01");
  const [ls, setLs] = useState<Lancamento[] | null>(null); const [erro, setErro] = useState(""); const [form, setForm] = useState<Form | null>(null); const [salvando, setSalvando] = useState(false);
  const [filtro, setFiltro] = useState<"" | "receita" | "despesa" | "previsto">("");
  const d = paraData(ref); const y = d.getUTCFullYear(), m = d.getUTCMonth();
  const ini = modo === "mes" ? isoData(new Date(Date.UTC(y, m, 1))) : `${y}-01-01`, fim = modo === "mes" ? isoData(new Date(Date.UTC(y, m + 1, 0))) : `${y}-12-31`;
  const rot = modo === "mes" ? `${MESES[m]} de ${y}` : `ano de ${y}`;
  const mover = (s: number) => setRef(modo === "mes" ? isoData(new Date(Date.UTC(y, m + s, 1))) : `${y + s}-01-01`);
  const carregar = async () => {
    setErro("");
    const r = await sb.from("financeiro").select("*").gte("data", ini).lte("data", fim).order("data", { ascending: false }).order("criado_em", { ascending: false });
    if (r.error) { setErro(/financeiro|schema cache|does not exist/i.test(r.error.message) ? "Falta rodar a etapa 0028 no Supabase (SQL Editor) para o Financeiro funcionar." : msgErro(r.error)); setLs([]); return; }
    setLs(((r.data || []) as Lancamento[]).map((x) => ({ ...x, valor: Number(x.valor) })));
  };
  useEffect(() => { setLs(null); carregar(); }, [ini, fim]); // eslint-disable-line react-hooks/exhaustive-deps
  const res = useMemo(() => resumirFinanceiro(ls || []), [ls]);
  const lista = (ls || []).filter((l) => !filtro || (filtro === "previsto" ? l.status === "previsto" : l.tipo === filtro));
  if (!titular) return <div className="page"><div className="empty">O Financeiro é só do titular.</div></div>;

  const salvar = async () => {
    if (!form) return; const valor = numeroBR(form.valor);
    if (!form.descricao.trim() || !(valor > 0)) { aviso("Preencha a descrição e um valor maior que zero."); return; }
    const p = form.processo ? processos.get(form.processo) : undefined;
    const linha = { tipo: form.tipo, categoria: form.categoria || "Outros", descricao: form.descricao.trim(), valor, data: form.data, status: form.status, processo_numero: p?.numero || null, cliente_id: p?.cliente_id || null, obs: form.obs.trim() || null };
    setSalvando(true);
    const r = form.id ? await sb.from("financeiro").update(linha).eq("id", form.id) : await sb.from("financeiro").insert(linha);
    setSalvando(false);
    if (r.error) { aviso(msgErro(r.error)); return; }
    aviso(form.id ? "Lançamento atualizado." : "Lançamento incluído."); setForm(null); carregar();
  };
  const excluir = async (l: Lancamento) => {
    if (!confirmar("ex" + l.id, aviso, `Clique de novo em excluir para apagar “${l.descricao}”.`)) return;
    const r = await sb.from("financeiro").delete().eq("id", l.id); if (r.error) { aviso(msgErro(r.error)); return; } aviso("Lançamento excluído."); carregar();
  };
  const marcarRecebido = async (l: Lancamento) => { const r = await sb.from("financeiro").update({ status: "recebido", data: hojeBR() }).eq("id", l.id); if (r.error) aviso(msgErro(r.error)); else { aviso(l.tipo === "receita" ? "Marcado como recebido hoje." : "Marcado como pago hoje."); carregar(); } };
  const editar = (l: Lancamento) => setForm({ id: l.id, tipo: l.tipo, categoria: l.categoria, descricao: l.descricao, valor: moeda(l.valor), data: l.data, status: l.status, processo: l.processo_numero || "", obs: l.obs || "" });
  const procsOrdenados = [...processos.values()].sort((a, b) => (a.cliente_nome || "").localeCompare(b.cliente_nome || ""));
  const maxCat = Math.max(1, ...res.porCategoria.map((c) => c.valor));

  return (
    <div className="page">
      <div className="head"><div><h1>Financeiro</h1><div className="sub">receitas e despesas do escritório · os honorários dos processos entram pela prestação de contas</div></div>
        <div className="tools">
          <div className="seg" role="radiogroup" aria-label="Período"><button role="radio" aria-checked={modo === "mes"} className={modo === "mes" ? "on" : ""} onClick={() => setModo("mes")}>Mês</button><button role="radio" aria-checked={modo === "ano"} className={modo === "ano" ? "on" : ""} onClick={() => setModo("ano")}>Ano</button></div>
          <button className="btn ghost" aria-label="Período anterior" onClick={() => mover(-1)}>‹</button><strong style={{ minWidth: 150, textAlign: "center" }}>{rot}</strong><button className="btn ghost" aria-label="Próximo período" onClick={() => mover(1)}>›</button>
          <button className="btn primary" onClick={() => setForm(vazio())}>Novo lançamento</button>
        </div></div>
      {erro && <div className="banner">{erro}</div>}
      <div className="fin-cards">
        <div className="fin-card ok"><span>Recebido</span><b>{brl(res.recebido)}</b><small>{res.recebido ? `${Math.round((res.dosProcessos / res.recebido) * 100)}% dos processos` : " "}</small></div>
        <div className="fin-card soon"><span>A receber</span><b>{brl(res.aReceber)}</b><small>lançado como previsto</small></div>
        <div className="fin-card late"><span>Despesas pagas</span><b>{brl(res.pago)}</b><small>{res.aPagar ? `+ ${brl(res.aPagar)} a pagar` : " "}</small></div>
        <div className={"fin-card " + (res.resultado >= 0 ? "acc" : "late")}><span>Resultado</span><b>{brl(res.resultado)}</b><small>recebido − despesas pagas</small></div>
      </div>
      {res.porCategoria.length > 0 && <section className="panel"><div className="ph"><h3>Por categoria</h3><span className="muted" style={{ fontSize: 12.5 }}>só o que foi recebido/pago</span></div>
        <div className="pb fin-cat">{res.porCategoria.map((c) => <div key={c.tipo + c.categoria}><span>{c.categoria}</span><div className="bar"><i className={c.tipo === "receita" ? "rec" : "desp"} style={{ width: `${Math.max(2, (c.valor / maxCat) * 100)}%` }} /></div><b className={c.tipo === "receita" ? "ok" : "late"}>{c.tipo === "despesa" ? "− " : ""}{brl(c.valor)}</b></div>)}</div></section>}
      {form && <section className="panel"><div className="ph"><h3>{form.id ? "Editar lançamento" : "Novo lançamento"}</h3></div>
        <div className="pb triage">
          <div className="seg wide" role="radiogroup" aria-label="Tipo">{(["receita", "despesa"] as const).map((t) => <button key={t} role="radio" aria-checked={form.tipo === t} className={form.tipo === t ? "on" : ""} onClick={() => setForm({ ...form, tipo: t, categoria: (t === "receita" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA)[0] })}>{t === "receita" ? "Receita" : "Despesa"}</button>)}</div>
          <label className="f">Descrição<input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder={form.tipo === "receita" ? "Ex.: Consulta — Maria da Silva" : "Ex.: Aluguel da sala — novembro"} /></label>
          <label className="f">Valor (R$)<input inputMode="decimal" value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="0,00" /></label>
          <label className="f">Categoria<input list="fin-cats" value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} /><datalist id="fin-cats">{(form.tipo === "receita" ? CATEGORIAS_RECEITA : CATEGORIAS_DESPESA).map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="f">Data<input type="date" value={form.data} onChange={(e) => setForm({ ...form, data: e.target.value })} /></label>
          <label className="f">Situação<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as Form["status"] })}><option value="recebido">{form.tipo === "receita" ? "Recebido" : "Pago"}</option><option value="previsto">{form.tipo === "receita" ? "A receber" : "A pagar"}</option></select></label>
          <label className="f">Processo (opcional)<select value={form.processo} onChange={(e) => setForm({ ...form, processo: e.target.value })}><option value="">— nenhum —</option>{procsOrdenados.map((p) => <option key={p.numero} value={p.numero}>{nomeBonito(p.cliente_nome || "")} · {p.mascara}</option>)}</select></label>
          <label className="f wide">Observação<input value={form.obs} onChange={(e) => setForm({ ...form, obs: e.target.value })} /></label>
          <div className="wide tools"><button className="btn primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button><button className="btn ghost" onClick={() => setForm(null)}>Cancelar</button></div>
        </div></section>}
      <section className="panel"><div className="ph"><h3>Lançamentos</h3>
        <div className="seg" role="radiogroup" aria-label="Filtrar lançamentos">{([["", "Todos"], ["receita", "Receitas"], ["despesa", "Despesas"], ["previsto", "A receber / a pagar"]] as const).map(([k, t]) => <button key={k} role="radio" aria-checked={filtro === k} className={filtro === k ? "on" : ""} onClick={() => setFiltro(k)}>{t}</button>)}</div></div>
        {ls === null ? <div className="pb muted" role="status">Carregando…</div> : !lista.length ? <div className="empty"><strong>Nenhum lançamento em {rot}.</strong>Gere uma prestação de contas num processo ou clique em “Novo lançamento”.</div> :
          <div className="tscroll"><table className="grid"><caption className="sr-only">Lançamentos do período</caption>
            <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Situação</th><th style={{ textAlign: "right" }}>Valor</th><th /></tr></thead>
            <tbody>{lista.map((l) => { const p = l.processo_numero ? processos.get(l.processo_numero) : undefined; const c = l.cliente_id ? clientes.get(l.cliente_id) : undefined; return (
              <tr key={l.id}>
                <td className="mono s">{dataBR(l.data)}</td>
                <td><b>{l.descricao}</b>{(p || c) && <div className="s">{p ? <button className="reflink" onClick={() => j.abrirProcesso(p.numero)}>{p.mascara}</button> : nomeBonito(c?.nome || "")}{l.origem === "prestacao" && <span className="muted"> · da prestação de contas</span>}</div>}{l.obs && <div className="muted s">{l.obs}</div>}</td>
                <td className="s">{l.categoria}</td>
                <td>{l.status === "recebido" ? <span className="pill ok">{l.tipo === "receita" ? "recebido" : "pago"}</span> : <button className="pill soon" title={l.tipo === "receita" ? "Marcar como recebido hoje" : "Marcar como pago hoje"} onClick={() => marcarRecebido(l)}>{l.tipo === "receita" ? "a receber" : "a pagar"}</button>}</td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }} className={l.tipo === "receita" ? "ok" : "late"}><b>{l.tipo === "despesa" ? "− " : ""}{brl(l.valor)}</b></td>
                <td style={{ whiteSpace: "nowrap" }}><button className="reflink" onClick={() => editar(l)}>editar</button> · <button className="reflink" onClick={() => excluir(l)}>excluir</button></td>
              </tr>); })}</tbody></table></div>}
      </section>
    </div>
  );
}
