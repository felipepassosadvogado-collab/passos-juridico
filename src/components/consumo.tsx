"use client";
// Configurações → Consumo do Claude: quanto cada função do sistema gastou no período (custo estimado pelos preços da API).
import { useEffect, useMemo, useState } from "react";
import { todas, useDados, msgErro } from "@/lib/dados";
import { dolarDoDia, dolarEfetivo, reais, type Cotacao } from "@/lib/cotacao";
import { hojeBR } from "@/lib/prazos";
import { NOME_MODELO, PERIODOS_CONSUMO, PRECOS_PADRAO, custo, nomeFuncao, periodoConsumo, resumirConsumo, umDia, type LinhaUso, type Preco } from "@/lib/consumoResumo";

const usd = (v: number) => "US$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const mil = (n: number) => n >= 1e6 ? (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi" : n >= 1e3 ? Math.round(n / 1e3).toLocaleString("pt-BR") + " mil" : String(n);
export function PainelConsumo() {
  const { sb, config, aviso } = useDados();
  const [per, setPer] = useState("30"); const [dia, setDia] = useState(hojeBR()); const [deP, setDeP] = useState(""); const [ateP, setAteP] = useState(""); const [linhas, setLinhas] = useState<LinhaUso[] | null>(null); const [erro, setErro] = useState(""); const [editar, setEditar] = useState(false);
  const salvos = (config.consumo_precos as Record<string, Preco> | undefined) || {};
  const [precos, setPrecos] = useState<Record<string, Preco>>({ ...PRECOS_PADRAO, ...salvos });
  // em reais: dólar do Banco Central (ou um valor fixo) + acréscimo do cartão (IOF 3,5% e taxa do banco, ajustável)
  const cambioSalvo = (config.consumo_cambio as { acrescimo?: number; manual?: number } | undefined) || {};
  const [cambio, setCambio] = useState({ acrescimo: cambioSalvo.acrescimo ?? 3.5, manual: cambioSalvo.manual || 0 });
  const [cot, setCot] = useState<(Cotacao & { guardada?: boolean }) | null>(null); const [erroCot, setErroCot] = useState("");
  useEffect(() => { dolarDoDia().then(setCot).catch((e) => setErroCot("Não consegui a cotação do dólar no Banco Central (" + ((e as Error).message || "erro") + "). Valores em dólar; informe uma cotação fixa em “Ajustar preços e câmbio”.")); }, []);
  const dolar = cambio.manual || cot?.valor || 0; const taxa = dolar ? dolarEfetivo(dolar, cambio.acrescimo) : 0;
  const din = (v: number) => taxa ? reais(v * taxa) : usd(v);
  useEffect(() => {
    setLinhas(null); setErro("");
    const [de, ate] = periodoConsumo(per, hojeBR(), { dia, de: deP, ate: ateP });
    todas(() => { let q = sb.from("uso_claude").select("em,operacao,modelo,entrada,saida,cache_leitura,cache_escrita").gte("em", de + "T03:00:00Z"); if (ate) q = q.lt("em", ate + "T03:00:00Z"); return q.order("id"); })
      .then((l) => setLinhas(l as LinhaUso[]))
      .catch((e) => { setErro(/uso_claude|does not exist|schema cache/i.test(String((e as Error).message)) ? "Falta rodar a etapa 0026 no Supabase (SQL Editor) para o painel começar a registrar." : msgErro(e)); setLinhas([]); });
  }, [per, dia, deP, ateP]); // eslint-disable-line react-hooks/exhaustive-deps
  const [deAtual, ateAtual] = periodoConsumo(per, hojeBR(), { dia, de: deP, ate: ateP }); const soUmDia = umDia(deAtual, ateAtual);
  const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
  const r = useMemo(() => linhas ? resumirConsumo(linhas, precos) : null, [linhas, precos]);
  const salvarPrecos = async () => {
    const { error } = await sb.from("config").upsert([{ chave: "consumo_precos", valor: precos }, { chave: "consumo_cambio", valor: cambio }], { onConflict: "chave" });
    if (error) { aviso(msgErro(error)); return; } aviso("Preços e câmbio salvos."); setEditar(false);
  };
  const maxDia = r ? Math.max(0.0001, ...r.porDia.map((d) => d.custo)) : 1;
  return (
    <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="tools" style={{ justifyContent: "space-between" }}>
        <div className="tools">
          <select aria-label="Período do consumo" value={per} onChange={(e) => setPer(e.target.value)}>{PERIODOS_CONSUMO.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          {per === "dia" && <input type="date" aria-label="Dia do consumo" value={dia} max={hojeBR()} onChange={(e) => e.target.value && setDia(e.target.value)} />}
          {per === "periodo" && <><input type="date" aria-label="Consumo a partir de" value={deP} max={hojeBR()} onChange={(e) => setDeP(e.target.value)} /><span className="muted s">até</span><input type="date" aria-label="Consumo até" value={ateP} max={hojeBR()} onChange={(e) => setAteP(e.target.value)} /></>}
        </div>
        <button className="reflink" onClick={() => setEditar(!editar)}>{editar ? "Fechar" : "Ajustar preços e câmbio"}</button>
      </div>
      {editar && <div className="triage">
        <label className="f">Acréscimo sobre o dólar (%) <span className="muted" style={{ fontWeight: 400 }}>IOF do cartão (3,5%) + taxa do banco</span>
          <input inputMode="decimal" value={String(cambio.acrescimo).replace(".", ",")} onChange={(e) => setCambio({ ...cambio, acrescimo: Number(e.target.value.replace(",", ".")) || 0 })} /></label>
        <label className="f">Cotação fixa do dólar (R$) <span className="muted" style={{ fontWeight: 400 }}>deixe vazio para usar a do Banco Central</span>
          <input inputMode="decimal" placeholder={cot ? String(cot.valor).replace(".", ",") : ""} value={cambio.manual ? String(cambio.manual).replace(".", ",") : ""} onChange={(e) => setCambio({ ...cambio, manual: Number(e.target.value.replace(",", ".")) || 0 })} /></label>
        {Object.keys(PRECOS_PADRAO).map((m) => (["entrada", "saida", "cacheLeitura", "cacheEscrita"] as const).map((k) => (
          <label key={m + k} className="f">{NOME_MODELO[m]} · {{ entrada: "entrada", saida: "saída", cacheLeitura: "cache (leitura)", cacheEscrita: "cache (escrita)" }[k]} (US$)
            <input inputMode="decimal" value={String(precos[m]?.[k] ?? "")} onChange={(e) => setPrecos({ ...precos, [m]: { ...precos[m], [k]: Number(e.target.value.replace(",", ".")) || 0 } })} /></label>)))}
        <div className="wide tools"><button className="btn primary" onClick={salvarPrecos}>Salvar</button><button className="btn ghost" onClick={() => { setPrecos({ ...PRECOS_PADRAO }); setCambio({ acrescimo: 3.5, manual: 0 }); }}>Voltar aos valores padrão</button></div>
      </div>}
      {erro && <div className="banner">{erro}</div>}
      {erroCot && !cambio.manual && <div className="banner">{erroCot}</div>}
      {!r ? <div className="muted" role="status">Carregando o consumo…</div> : !r.total.chamadas ? (!erro && <div className="muted">Nenhuma chamada ao Claude registrada neste período. O registro começa a partir da atualização de 05/11/2026.</div>) : <>
        <div className="pub-res">
          <span className="pub-chip"><b>{din(r.total.custo)}</b>custo estimado</span>
          {taxa > 0 && <span className="pub-chip" title={`Dólar ${cambio.manual ? "fixo informado" : `do Banco Central em ${cot?.data}${cot?.guardada ? " (última cotação guardada)" : ""}`}: ${reais(dolar)} + ${String(cambio.acrescimo).replace(".", ",")}% = ${reais(taxa)} por dólar`}><b>{usd(r.total.custo)}</b>em dólar · US$ 1 = {reais(taxa)}</span>}
          <span className="pub-chip"><b>{r.total.chamadas}</b>chamadas ao Claude</span>
          <span className="pub-chip"><b>{mil(r.total.tokens)}</b>tokens</span>
        </div>
        <table className="grid"><caption className="sr-only">Consumo por função do sistema</caption>
          <thead><tr><th>Função</th><th style={{ textAlign: "right" }}>Chamadas</th><th style={{ textAlign: "right" }}>Custo</th><th style={{ textAlign: "right" }}>Por chamada</th><th style={{ width: "28%" }}>% do custo</th></tr></thead>
          <tbody>{r.porFuncao.map((g) => { const p = r.total.custo ? g.custo / r.total.custo : 0; return (
            <tr key={g.nome}><td><b>{g.nome}</b></td><td style={{ textAlign: "right" }}>{g.chamadas}</td><td style={{ textAlign: "right" }}>{din(g.custo)}</td><td style={{ textAlign: "right" }} className="muted">{din(g.custo / g.chamadas)}</td>
              <td><div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ height: 8, borderRadius: 4, background: "var(--accent)", width: `${Math.max(2, p * 100)}%` }} /><span className="s muted">{Math.round(p * 100)}%</span></div></td></tr>); })}</tbody></table>
        <div className="muted s">Por modelo: {r.porModelo.map((g) => `${g.nome}: ${din(g.custo)} (${g.chamadas} chamadas)`).join(" · ")}</div>
        {soUmDia && linhas && <div>
          <div className="s" style={{ fontWeight: 600, margin: "4px 0 6px" }}>Chamadas do dia {deAtual.split("-").reverse().join("/")}</div>
          <div className="tscroll" style={{ maxHeight: 320, overflowY: "auto" }}><table className="grid"><caption className="sr-only">Cada chamada ao Claude no dia</caption>
            <thead><tr><th>Hora</th><th>Função</th><th>Modelo</th><th style={{ textAlign: "right" }}>Tokens (entrada / saída)</th><th style={{ textAlign: "right" }}>Custo</th></tr></thead>
            <tbody>{[...linhas].reverse().map((l, k) => <tr key={k}><td className="mono">{hora(l.em)}</td><td>{nomeFuncao(l.operacao)}</td><td className="muted">{NOME_MODELO[l.modelo] || l.modelo}</td>
              <td style={{ textAlign: "right" }} className="muted">{mil(l.entrada + l.cache_leitura + l.cache_escrita)} / {mil(l.saida)}</td><td style={{ textAlign: "right" }}>{din(custo(l, precos))}</td></tr>)}</tbody></table></div>
        </div>}
        {!soUmDia && r.porDia.length > 1 && <div>
          <div className="s" style={{ fontWeight: 600, marginBottom: 6 }}>Por dia</div>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 90 }} role="img" aria-label={"Custo por dia: " + r.porDia.map((d) => `${d.dia.slice(8)}/${d.dia.slice(5, 7)} ${din(d.custo)}`).join(", ")}>
            {r.porDia.map((d) => <div key={d.dia} title={`${d.dia.split("-").reverse().join("/")}: ${din(d.custo)} · ${d.chamadas} chamadas`} style={{ flex: 1, minWidth: 4, height: `${Math.max(3, (d.custo / maxDia) * 100)}%`, background: "var(--accent)", borderRadius: "3px 3px 0 0", opacity: 0.8 }} />)}
          </div>
          <div className="muted s" style={{ display: "flex", justifyContent: "space-between" }}><span>{r.porDia[0].dia.split("-").reverse().join("/")}</span><span>{r.porDia[r.porDia.length - 1].dia.split("-").reverse().join("/")}</span></div>
        </div>}
        <div className="muted s">Estimativa pelos tokens de cada chamada e pelos preços por milhão de tokens{taxa > 0 ? `, convertida pelo dólar ${cambio.manual ? "fixo de " + reais(dolar) : "do Banco Central de " + cot?.data + " (" + reais(dolar) + ")"} mais ${String(cambio.acrescimo).replace(".", ",")}% de IOF e taxa do banco` : ""}. O valor cobrado de verdade é o do Console da Anthropic (console.anthropic.com → Usage), que pode ter pequenas diferenças.</div>
      </>}
    </div>
  );
}
