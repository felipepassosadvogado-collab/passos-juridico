// Cálculo de liquidação para o cumprimento de sentença (restituição de parcelas, danos morais, compensação e honorários).
// Convenção (a mesma das memórias de cálculo aceitas no JEF de Joinville): cada valor é atualizado do mês seguinte ao seu marco
// até a data-base, inclusive; correção composta mês a mês e juros simples (somados), aplicados sobre o valor corrigido.
import { somaMes, mesBR, taxaLegal, type Indices } from "./calculo";

export type RegimeCs = "ipcae_selic" | "manual_jf" | "lei" | "ipcae1";
export const REGIMES_CS: Record<RegimeCs, { nome: string; texto: string; curto: string }> = {
  ipcae_selic: { nome: "IPCA-E + juros pela diferença SELIC − IPCA-E (art. 406 do CC) — o mais usado nas sentenças do JEF",
    curto: "correção monetária pelo IPCA-E e juros de mora pela diferença, quando positiva, entre a SELIC e o IPCA-E",
    texto: "Correção monetária pelo IPCA-E e juros de mora pela diferença, quando positiva, entre a taxa SELIC e o IPCA-E do mês (art. 406 do Código Civil), juros simples calculados sobre o valor corrigido." },
  manual_jf: { nome: "Manual de Cálculos da JF: SELIC até 08/2024; depois IPCA + taxa legal",
    curto: "taxa SELIC até 08/2024 (que engloba juros e correção) e, a partir de 09/2024, correção pelo IPCA e juros pela taxa legal (Lei 14.905/2024)",
    texto: "Até 08/2024, atualização pela taxa SELIC, que engloba juros e correção monetária (Manual de Orientação de Procedimentos para os Cálculos na Justiça Federal). A partir de 09/2024, correção monetária pelo IPCA (art. 389, parágrafo único, do CC) e juros de mora pela taxa legal: SELIC deduzido o IPCA-15, considerada zero quando negativa (art. 406, §§ 1º e 3º, do CC, na redação da Lei 14.905/2024)." },
  lei: { nome: "Lei 14.905/2024 em todo o período: IPCA + taxa legal",
    curto: "correção monetária pelo IPCA e juros de mora pela taxa legal (SELIC deduzido o IPCA-15), na forma da Lei 14.905/2024",
    texto: "Correção monetária pelo IPCA (art. 389, parágrafo único, do CC) e juros de mora pela taxa legal, correspondente à SELIC deduzido o IPCA-15 e considerada zero quando negativa (art. 406, §§ 1º e 3º, do CC, na redação da Lei 14.905/2024), em todo o período." },
  ipcae1: { nome: "IPCA-E + juros de 1% a.m. até 08/2024; depois IPCA + taxa legal",
    curto: "correção monetária pelo IPCA-E e juros de 1% ao mês até 08/2024 e, a partir de 09/2024, IPCA e taxa legal (Lei 14.905/2024)",
    texto: "Até 08/2024, correção monetária pelo IPCA-E e juros de mora de 1% ao mês (art. 406 do CC c/c art. 161, § 1º, do CTN). A partir de 09/2024, correção pelo IPCA e juros pela taxa legal (SELIC deduzido o IPCA-15, considerada zero quando negativa; Lei 14.905/2024)." },
};
const INICIO_LEI = "2024-09";
export const MODULACAO_CS = "2021-04";
/** salário mínimo nacional por ano (piso de honorários) */
export const SALARIO_MINIMO: Record<string, number> = { "2022": 1212, "2023": 1320, "2024": 1412, "2025": 1518, "2026": 1621 };

export type AtualizacaoComp = "completa" | "correcao" | "historico";
/** como a compensação aparece nos textos do cálculo e da petição */
export const textoAtualizacaoComp = (a?: AtualizacaoComp) => a === "historico" ? "pelo valor histórico, sem correção monetária e sem juros" : a === "correcao" ? "apenas corrigido monetariamente, sem juros" : "atualizado pelos mesmos critérios";
export type ContratoCs = { numero: string; parcela: number; inicio: string; fim: string };
export type ParamsCs = {
  base: string; regime: RegimeCs;
  restituicao: "simples" | "dobro" | "dobro_modulado" | "nenhuma";
  contratos: ContratoCs[];
  /** juros dos danos materiais: desde cada desconto (Súmula 54) ou desde a citação */
  jurosMateriais: "desconto" | "citacao"; citacao?: string;
  moral: { valor: number; jurosDesde: string; correcaoDesde: string } | null;
  /** atualizacao: "completa" (correção + juros, padrão), "correcao" (só correção) ou "historico" (valor nominal, sem correção nem juros) */
  compensacao: { valor: number; mes: string; atualizacao?: AtualizacaoComp } | null;
  honorarios: { tipo: "nenhum" | "percentual" | "fixo"; pct: number; minimo: number; minimoDesde: string; valor: number; valorDesde: string };
};
export type LinhaCs = { contrato: string; comp: string; valor: number; base: number; dobro: boolean; fator: number; corrigido: number; jurosPct: number; juros: number; total: number };
export type ItemCs = { valor: number; fator: number; corrigido: number; jurosPct: number; juros: number; total: number };
export type ResultadoCs = {
  linhas: LinhaCs[]; porContrato: { contrato: string; n: number; parcela: number; ini: string; fim: string; nominal: number; base: number; total: number }[];
  materiais: number; moral: ItemCs | null; compensacao: ItemCs | null; condenacao: number;
  honorarios: { valor: number; pctValor: number; minimoAtual: number; prevaleceMinimo: boolean } | null; total: number; faltam: string[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;
const meses = (de: string, ate: string) => { const out: string[] = []; for (let m = de; m <= ate; m = somaMes(m, 1)) out.push(m); return out; };

/** atualiza um valor: correção desde o mês seguinte a mc e juros desde o mês seguinte a mj, até a data-base (inclusive) */
export function atualizar(v: number, mc: string, mj: string | null, base: string, regime: RegimeCs, ix: Indices, faltam: Set<string>): ItemCs {
  const val = (s: Record<string, number>, m: string, nome: string) => { const x = s[m]; if (x == null) { faltam.add(`${nome} de ${mesBR(m)}`); return 0; } return x; };
  const tl = (m: string) => { const t = taxaLegal(ix, m); if (t == null) { faltam.add(`taxa legal de ${mesBR(m)}`); return 0; } return t; };
  let fator = 1, juros = 0;
  if (regime === "manual_jf") {
    // até 08/2024 a SELIC engloba juros e correção (desde o marco dos juros); antes dele só correção pelo IPCA-E
    let corrAntes = 1, selic = 0, fatorDepois = 1, tlDepois = 0;
    for (const m of meses(somaMes(mc, 1), base)) {
      const comJuros = mj != null && m > mj;
      if (m < INICIO_LEI) { if (comJuros) selic += val(ix.selic, m, "SELIC"); else corrAntes *= 1 + val(ix.ipcae, m, "IPCA-E"); }
      else { fatorDepois *= 1 + val(ix.ipca, m, "IPCA"); if (comJuros) tlDepois += tl(m); }
    }
    const corr = r2(v * corrAntes * fatorDepois); const total = r2(v * corrAntes * fatorDepois * (1 + selic + tlDepois));
    return { valor: r2(v), fator: corrAntes * fatorDepois, corrigido: corr, jurosPct: selic + tlDepois, juros: r2(total - corr), total };
  }
  for (const m of meses(somaMes(mc, 1), base)) {
    const novo = regime === "lei" || (regime === "ipcae1" && m >= INICIO_LEI);
    fator *= 1 + (novo ? val(ix.ipca, m, "IPCA") : val(ix.ipcae, m, "IPCA-E"));
  }
  if (mj != null) for (const m of meses(somaMes(mj, 1), base)) {
    if (regime === "ipcae_selic") juros += Math.max(val(ix.selic, m, "SELIC") - val(ix.ipcae, m, "IPCA-E"), 0);
    else if (regime === "lei" || m >= INICIO_LEI) juros += tl(m);
    else juros += 0.01;
  }
  const corrigido = r2(v * fator); const j = r2(corrigido * juros);
  return { valor: r2(v), fator, corrigido, jurosPct: juros, juros: j, total: r2(corrigido + j) };
}

export function liquidar(p: ParamsCs, ix: Indices): ResultadoCs {
  const faltam = new Set<string>(); const linhas: LinhaCs[] = [];
  if (p.restituicao !== "nenhuma") for (const c of p.contratos) {
    if (!c.parcela || !c.inicio) continue;
    const fim = c.fim && c.fim < p.base ? c.fim : p.base;
    for (const comp of meses(c.inicio, fim)) {
      const dobro = p.restituicao === "dobro" || (p.restituicao === "dobro_modulado" && comp >= MODULACAO_CS);
      const base = r2(c.parcela * (dobro ? 2 : 1));
      const mj = p.jurosMateriais === "citacao" && p.citacao ? (p.citacao > comp ? p.citacao : comp) : comp;
      const a = atualizar(base, comp, mj, p.base, p.regime, ix, faltam);
      linhas.push({ contrato: c.numero || "—", comp, valor: r2(c.parcela), base, dobro, fator: a.fator, corrigido: a.corrigido, jurosPct: a.jurosPct, juros: a.juros, total: a.total });
    }
  }
  const porContrato = [...new Set(linhas.map((l) => l.contrato))].map((ct) => { const ls = linhas.filter((l) => l.contrato === ct);
    return { contrato: ct, n: ls.length, parcela: ls[0].valor, ini: ls[0].comp, fim: ls[ls.length - 1].comp, nominal: r2(ls.reduce((s, l) => s + l.valor, 0)), base: r2(ls.reduce((s, l) => s + l.base, 0)), total: r2(ls.reduce((s, l) => s + l.total, 0)) }; });
  const materiais = r2(linhas.reduce((s, l) => s + l.total, 0));
  const moral = p.moral && p.moral.valor > 0 ? atualizar(p.moral.valor, p.moral.correcaoDesde, p.moral.jurosDesde, p.base, p.regime, ix, faltam) : null;
  const pc = p.compensacao;
  const compensacao = pc && pc.valor > 0
    ? pc.atualizacao === "historico" ? { valor: r2(pc.valor), fator: 1, corrigido: r2(pc.valor), jurosPct: 0, juros: 0, total: r2(pc.valor) }
    : atualizar(pc.valor, pc.mes, pc.atualizacao === "correcao" ? null : pc.mes, p.base, p.regime, ix, faltam)
    : null;
  const condenacao = r2(materiais + (moral?.total || 0) - (compensacao?.total || 0));
  let honorarios: ResultadoCs["honorarios"] = null; const h = p.honorarios;
  if (h.tipo === "percentual") {
    const pctValor = r2(Math.max(condenacao, 0) * h.pct / 100);
    const minimoAtual = h.minimo > 0 ? (h.minimoDesde ? atualizar(h.minimo, h.minimoDesde, null, p.base, p.regime, ix, faltam).corrigido : r2(h.minimo)) : 0;
    honorarios = { valor: Math.max(pctValor, minimoAtual), pctValor, minimoAtual, prevaleceMinimo: minimoAtual > pctValor };
  } else if (h.tipo === "fixo" && h.valor > 0) {
    const v = h.valorDesde ? atualizar(h.valor, h.valorDesde, null, p.base, p.regime, ix, faltam).corrigido : r2(h.valor);
    honorarios = { valor: v, pctValor: 0, minimoAtual: 0, prevaleceMinimo: false };
  }
  return { linhas, porContrato, materiais, moral, compensacao, condenacao, honorarios, total: r2(condenacao + (honorarios?.valor || 0)), faltam: [...faltam] };
}

/** último mês com IPCA-E e SELIC publicados (data-base padrão) */
export function ultimoMesComIndice(ix: Indices) {
  const ks = Object.keys(ix.ipcae).filter((k) => ix.selic[k] != null).sort(); return ks[ks.length - 1] || "";
}
