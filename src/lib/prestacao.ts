// Prestação de contas ao cliente (processos de consignado): quanto o cliente recebeu, quanto fica de honorários e
// quanto é repassado. Regra do escritório:
//  - honorários contratuais = % (em geral 30%) sobre o PROVEITO ECONÔMICO = valor líquido recebido pelo cliente no
//    processo + valor do empréstimo que foi creditado na conta dele / compensado em favor do banco;
//  - honorários de sucumbência são do advogado e ficam FORA da base dos 30%;
//  - cada desconto aparece explicado no documento.

export type Credito = { descricao: string; valor: number; data?: string | null; sucumbencia?: boolean };
export type Despesa = { descricao: string; valor: number };
export type DadosPrestacao = {
  creditos: Credito[];            // alvarás / RPV / depósitos levantados (os de sucumbência marcados)
  emprestimo: number;             // valor do empréstimo creditado na conta do cliente ou compensado em favor do banco
  emprestimoDescricao?: string;   // ex.: "valor creditado na conta da autora em 05/2021 (compensado na sentença)"
  pct: number;                    // % dos honorários contratuais (padrão 30)
  despesas: Despesa[];            // despesas adiantadas pelo escritório e descontadas do cliente (perícia, custas…)
  sucumbenciaAReceber?: number;   // sucumbência fixada mas ainda não paga (só informativa)
};
export type ResultadoPrestacao = {
  bruto: number; sucumbencia: number; liquidoCliente: number; base: number; honorarios: number; despesas: number;
  repasse: number; aDevolver: number; totalEscritorio: number;
};

const r2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export function calcularPrestacao(d: DadosPrestacao): ResultadoPrestacao {
  const bruto = r2(d.creditos.reduce((s, c) => s + (c.valor || 0), 0));
  const sucumbencia = r2(d.creditos.filter((c) => c.sucumbencia).reduce((s, c) => s + (c.valor || 0), 0));
  const liquidoCliente = r2(bruto - sucumbencia);          // o que é do cliente no processo
  const base = r2(liquidoCliente + (d.emprestimo || 0));    // proveito econômico
  const honorarios = r2(base * (d.pct || 0) / 100);
  const despesas = r2(d.despesas.reduce((s, x) => s + (x.valor || 0), 0));
  const saldo = r2(liquidoCliente - honorarios - despesas); // pode ficar negativo quando o empréstimo é grande
  return { bruto, sucumbencia, liquidoCliente, base, honorarios, despesas, repasse: Math.max(0, saldo), aDevolver: Math.max(0, -saldo), totalEscritorio: r2(honorarios + sucumbencia) };
}

/** lançamentos que a prestação gera no Financeiro (honorários contratuais e sucumbência recebidos) */
export function lancamentosDaPrestacao(r: ResultadoPrestacao, pct: number, cliente: string, data: string) {
  const out: { tipo: "receita"; categoria: string; descricao: string; valor: number; status: "recebido" | "previsto"; data: string }[] = [];
  const recebidoContratual = Math.min(r.honorarios, Math.max(0, r.liquidoCliente - r.despesas)); // só entra o que saiu do valor levantado
  if (recebidoContratual > 0) out.push({ tipo: "receita", categoria: "Honorários contratuais", descricao: `Honorários contratuais (${String(pct).replace(".", ",")}%) · ${cliente}`, valor: r2(recebidoContratual), status: "recebido", data });
  if (r.honorarios - recebidoContratual > 0.004) out.push({ tipo: "receita", categoria: "Honorários contratuais", descricao: `Honorários contratuais a receber do cliente (parte que excede o levantado) · ${cliente}`, valor: r2(r.honorarios - recebidoContratual), status: "previsto", data });
  if (r.sucumbencia > 0) out.push({ tipo: "receita", categoria: "Honorários de sucumbência", descricao: `Honorários de sucumbência · ${cliente}`, valor: r.sucumbencia, status: "recebido", data });
  return out;
}
