// Atualização das parcelas descontadas indevidamente (repetição do indébito em dobro, art. 42 do CDC).
// Juros de mora desde cada desconto (Súmula 54 do STJ) e correção monetária desde cada desconto (Súmula 43 do STJ).
// A partir de 09/2024 (Lei 14.905/2024, em vigor em 30/08/2024): correção pelo IPCA (art. 389, parágrafo único, do CC)
// e juros pela taxa legal = Selic − IPCA-15, nunca negativa (art. 406, §§ 1º e 3º, do CC; Resolução CMN 5.171/2024).

export type Indices = { ipca: Record<string, number>; ipca15: Record<string, number>; ipcae: Record<string, number>; selic: Record<string, number>; fonte?: string };
export type Regime = "jf" | "lei" | "ipcae1";
export const REGIMES: Record<Regime, { nome: string; texto: string }> = {
  jf: { nome: "Justiça Federal: Selic até 08/2024; depois IPCA + taxa legal",
    texto: "Até 08/2024, atualização pela taxa Selic, que engloba juros e correção monetária (art. 406 do CC na redação anterior, conforme o Manual de Orientação de Procedimentos para os Cálculos na Justiça Federal). A partir de 09/2024, correção monetária pelo IPCA (art. 389, parágrafo único, do CC) e juros de mora pela taxa legal, correspondente à Selic deduzido o IPCA-15 e considerada zero quando negativa (art. 406, §§ 1º e 3º, do CC, na redação da Lei 14.905/2024, e Resolução CMN 5.171/2024)." },
  lei: { nome: "Lei 14.905/2024 em todo o período: IPCA + taxa legal",
    texto: "Correção monetária pelo IPCA (art. 389, parágrafo único, do CC) e juros de mora pela taxa legal, correspondente à Selic deduzido o IPCA-15 e considerada zero quando negativa (art. 406, §§ 1º e 3º, do CC, na redação da Lei 14.905/2024, e Resolução CMN 5.171/2024), em todo o período." },
  ipcae1: { nome: "IPCA-E + juros de 1% a.m. até 08/2024; depois IPCA + taxa legal",
    texto: "Até 08/2024, correção monetária pelo IPCA-E e juros de mora de 1% ao mês (art. 406 do CC c/c art. 161, § 1º, do CTN). A partir de 09/2024, correção pelo IPCA e juros pela taxa legal (Selic deduzido o IPCA-15, considerada zero quando negativa; Lei 14.905/2024 e Resolução CMN 5.171/2024)." },
};
export const INICIO_LEI = "2024-09";
/** STJ, EAREsp 676.608/RS: dobro independentemente de má-fé para cobranças posteriores a 30/03/2021 */
export const MODULACAO = "2021-04";

export type ContratoCalc = { numero: string; parcela: number; inicio: string; qtd: number };
export type Opcoes = { ate: string; regime: Regime; dobro: boolean; modulacao: boolean };
export type Linha = { contrato: string; comp: string; valor: number; base: number; dobro: boolean; correcao: number; juros: number; total: number; fator: number; jurosPct: number };
export type Resultado = { linhas: Linha[]; porContrato: { contrato: string; n: number; valor: number; base: number; correcao: number; juros: number; total: number }[]; tot: { valor: number; base: number; correcao: number; juros: number; total: number }; faltam: string[]; ultimoMes: string };

export const somaMes = (m: string, n: number) => { const [a, b] = m.split("-").map(Number); const d = new Date(Date.UTC(a, b - 1 + n, 1)); return d.toISOString().slice(0, 7); };
export const mesBR = (m: string) => m.slice(5, 7) + "/" + m.slice(0, 4);
const r2 = (v: number) => Math.round(v * 100) / 100;

/** taxa legal do mês m: max(fator Selic do mês anterior / fator IPCA-15 do mês anterior − 1, 0) */
export function taxaLegal(ix: Indices, m: string): number | null {
  const a = somaMes(m, -1); const s = ix.selic[a], i = ix.ipca15[a];
  if (s == null || i == null) return null;
  return Math.max((1 + s) / (1 + i) - 1, 0);
}

export function calcular(contratos: ContratoCalc[], ix: Indices, o: Opcoes): Resultado {
  const faltam = new Set<string>(); const linhas: Linha[] = []; const ultimoMes = somaMes(o.ate, -1);
  const v = (serie: Record<string, number>, m: string, nome: string) => { const x = serie[m]; if (x == null) { faltam.add(`${nome} de ${mesBR(m)}`); return 0; } return x; };
  for (const c of contratos) {
    if (!c.parcela || !c.inicio || !c.qtd) continue;
    for (let k = 0; k < c.qtd; k++) {
      const comp = somaMes(c.inicio, k); if (comp >= o.ate) break;
      const emDobro = o.dobro && (!o.modulacao || comp >= MODULACAO);
      const base = c.parcela * (emDobro ? 2 : 1);
      // meses de atualização: do mês do desconto até o mês anterior à data do cálculo
      let fatorAntes = 1, selicAntes = 0, jurosAntes = 0, fatorDepois = 1, tlDepois = 0;
      for (let m = comp; m <= ultimoMes; m = somaMes(m, 1)) {
        const novo = o.regime === "lei" || m >= INICIO_LEI;
        if (novo) { fatorDepois *= 1 + v(ix.ipca, m, "IPCA"); const tl = taxaLegal(ix, m); if (tl == null) faltam.add(`taxa legal de ${mesBR(m)}`); tlDepois += tl || 0; }
        else if (o.regime === "jf") selicAntes += v(ix.selic, m, "Selic");
        else { fatorAntes *= 1 + v(ix.ipcae, m, "IPCA-E"); jurosAntes += 0.01; }
      }
      let correcao: number, juros: number;
      if (o.regime === "jf") {
        // Selic simples até 08/2024 (juros + correção); depois o principal e a Selic acumulada são corrigidos pelo IPCA e o principal corrigido rende a taxa legal
        const selicVal = base * selicAntes; const pc = base * fatorDepois;
        correcao = pc - base + (selicVal * fatorDepois - selicVal); juros = selicVal + pc * tlDepois;
      } else {
        const fator = fatorAntes * fatorDepois; const pc = base * fator;
        correcao = pc - base; juros = pc * (jurosAntes + tlDepois);
      }
      linhas.push({ contrato: c.numero || "—", comp, valor: r2(c.parcela), base: r2(base), dobro: emDobro, correcao: r2(correcao), juros: r2(juros), total: r2(base + correcao + juros), fator: (base + correcao) / base, jurosPct: base ? juros / (base + correcao) : 0 });
    }
  }
  const porContrato = [...new Set(linhas.map((l) => l.contrato))].map((ct) => { const ls = linhas.filter((l) => l.contrato === ct);
    return { contrato: ct, n: ls.length, valor: r2(ls.reduce((s, l) => s + l.valor, 0)), base: r2(ls.reduce((s, l) => s + l.base, 0)), correcao: r2(ls.reduce((s, l) => s + l.correcao, 0)), juros: r2(ls.reduce((s, l) => s + l.juros, 0)), total: r2(ls.reduce((s, l) => s + l.total, 0)) }; });
  const tot = { valor: r2(linhas.reduce((s, l) => s + l.valor, 0)), base: r2(linhas.reduce((s, l) => s + l.base, 0)), correcao: r2(linhas.reduce((s, l) => s + l.correcao, 0)), juros: r2(linhas.reduce((s, l) => s + l.juros, 0)), total: r2(linhas.reduce((s, l) => s + l.total, 0)) };
  return { linhas, porContrato, tot, faltam: [...faltam], ultimoMes };
}
