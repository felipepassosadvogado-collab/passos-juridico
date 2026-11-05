"use client";
// Configurações → Consumo do Claude: quanto cada função do sistema gastou no período (custo estimado pelos preços da API).
import { useEffect, useMemo, useState } from "react";
import { todas, useDados, msgErro } from "@/lib/dados";
import { hojeBR } from "@/lib/prazos";
import { NOME_MODELO, PRECOS_PADRAO, resumirConsumo, type LinhaUso, type Preco } from "@/lib/consumoResumo";

const usd = (v: number) => "US$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mil = (n: number) => n >= 1e6 ? (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : n >= 1e3 ? Math.round(n / 1e3).toLocaleString("pt-BR") + " mil" : String(n);
const PERIODOS = [["7", "Últimos 7 dias"], ["30", "Últimos 30 dias"], ["mes", "Este mês"], ["mes_passado", "Mês passado"]] as const;

function inicioFim(p: string): [string, string] {
  const h = hojeBR(); const [y, m] = h.split("-").map(Number);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (p === "mes") return [`${h.slice(0, 7)}-01`, ""];
  if (p === "mes_passado") return [iso(new Date(Date.UTC(y, m - 2, 1))), `${h.slice(0, 7)}-01`];
  const d = new Date(h + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() - (+p - 1)); return [iso(d), ""];
}

export function PainelConsumo() {
  const { sb, config, aviso } = useDados();
  const [per, setPer] = useState("30"); const [linhas, setLinhas] = useState<LinhaUso[] | null>(null); const [erro, setErro] = useState(""); const [editar, setEditar] = useState(false);
  const salvos = (config.consumo_precos as Record<string, Preco> | undefined) || {};
  const [precos, setPrecos] = useState<Record<string, Preco>>({ ...PRECOS_PADRAO, ...salvos });
  useEffect(() => {
    setLinhas(null); setErro("");
    const [de, ate] = inicioFim(per);
    todas(() => { let q = sb.from("uso_claude").select("em,operacao,modelo,entrada,saida,cache_leitura,cache_escrita").gte("em", de + "T03:00:00Z"); if (ate) q = q.lt("em", ate + "T03:00:00Z"); return q.order("id"); })
      .then((l) => setLinhas(l as LinhaUso[]))
      .catch((e) => { setErro(/uso_claude|does not exist|schema cache/i.test(String((e as Error).message)) ? "Falta rodar a etapa 0026 no Supabase (SQL Editor) para o painel começar a registrar." : msgErro(e)); setLinhas([]); });
  }, [per]); // eslint-disable-line react-hooks/exhaustive-deps
  const r = useMemo(() => linhas ? resumirConsumo(linhas, precos) : null, [linhas, precos]);
  const salvarPrecos = async () => {
    const { error } = await sb.from("config").upsert({ chave: "consumo_precos", valor: precos }, { onConflict: "chave" });
    if (error) { aviso(msgErro(error)); return; } aviso("Preços salvos."); setEditar(false);
  };
  const maxDia = r ? Math.max(0.0001, ...r.porDia.map((d) => d.custo)) : 1;
  return (
    <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="tools" style={{ justifyContent: "space-between" }}>
        <select aria-label="Período do consumo" value={per} onChange={(e) => setPer(e.target.value)}>{PERIODOS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
        <button className="reflink" onClick={() => setEditar(!editar)}>{editar ? "Fechar preços" : "Ajustar preços por milhão de tokens"}</button>
      </div>
      {editar && <div className="triage">
        {Object.keys(PRECOS_PADRAO).map((m) => (["entrada", "saida", "cacheLeitura", "cacheEscrita"] as const).map((k) => (
          <label key={m + k} className="f">{NOME_MODELO[m]} · {{ entrada: "entrada", saida: "saída", cacheLeitura: "cache (leitura)", cacheEscrita: "cache (escrita)" }[k]} (US$)
            <input inputMode="decimal" value={String(precos[m]?.[k] ?? "")} onChange={(e) => setPrecos({ ...precos, [m]: { ...precos[m], [k]: Number(e.target.value.replace(",", ".")) || 0 } })} /></label>)))}
        <div className="wide tools"><button className="btn primary" onClick={salvarPrecos}>Salvar preços</button><button className="btn ghost" onClick={() => setPrecos({ ...PRECOS_PADRAO })}>Voltar aos preços de tabela</button></div>
      </div>}
      {erro && <div className="banner">{erro}</div>}
      {!r ? <div className="muted" role="status">Carregando o consumo…</div> : !r.total.chamadas ? (!erro && <div className="muted">Nenhuma chamada ao Claude registrada neste período. O registro começa a partir da atualização de 05/11/2026.</div>) : <>
        <div className="pub-res">
          <span className="pub-chip"><b>{usd(r.total.custo)}</b>custo estimado</span>
          <span className="pub-chip"><b>{r.total.chamadas}</b>chamadas ao Claude</span>
          <span className="pub-chip"><b>{mil(r.total.tokens)}</b>tokens</span>
        </div>
        <table className="grid"><caption className="sr-only">Consumo por função do sistema</caption>
          <thead><tr><th>Função</th><th style={{ textAlign: "right" }}>Chamadas</th><th style={{ textAlign: "right" }}>Custo</th><th style={{ textAlign: "right" }}>Por chamada</th><th style={{ width: "28%" }}>% do custo</th></tr></thead>
          <tbody>{r.porFuncao.map((g) => { const p = r.total.custo ? g.custo / r.total.custo : 0; return (
            <tr key={g.nome}><td><b>{g.nome}</b></td><td style={{ textAlign: "right" }}>{g.chamadas}</td><td style={{ textAlign: "right" }}>{usd(g.custo)}</td><td style={{ textAlign: "right" }} className="muted">{usd(g.custo / g.chamadas)}</td>
              <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ height: 8, borderRadius: 4, background: "var(--accent)", width: `${Math.max(2, p * 100)}%` }} /><span className="s muted">{Math.round(p * 100)}%</span></div></td></tr>); })}</tbody></table>
        <div className="muted s">Por modelo: {r.porModelo.map((g) => `${g.nome}: ${usd(g.custo)} (${g.chamadas} chamadas)`).join(" · ")}</div>
        {r.porDia.length > 1 && <div>
          <div className="s" style={{ fontWeight: 600, marginBottom: 6 }}>Por dia</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }} role="img" aria-label={"Custo por dia: " + r.porDia.map((d) => `${d.dia.slice(8)}/${d.dia.slice(5, 7)} ${usd(d.custo)}`).join(", ")}>
            {r.porDia.map((d) => <div key={d.dia} title={`${d.dia.split("-").reverse().join("/")}: ${usd(d.custo)} · ${d.chamadas} chamadas`} style={{ flex: 1, minWidth: 4, height: `${Math.max(3, (d.custo / maxDia) * 100)}%`, background: "var(--accent)", borderRadius: "3px 3px 0 0", opacity: 0.8 }} />)}
          </div>
          <div className="muted s" style={{ display: "flex", justifyContent: "space-between" }}><span>{r.porDia[0].dia.split("-").reverse().join("/")}</span><span>{r.porDia[r.porDia.length - 1].dia.split("-").reverse().join("/")}</span></div>
        </div>}
        <div className="muted s">Estimativa pelos tokens de cada chamada e pelos preços acima. O valor cobrado de verdade é o do Console da Anthropic (console.anthropic.com → Usage), que pode ter pequenas diferenças.</div>
      </>}
    </div>
  );
}
