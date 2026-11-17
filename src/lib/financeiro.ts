// Financeiro do escritório: lançamentos de receita e despesa (manuais ou vindos da prestação de contas) e o resumo do período.
export type Lancamento = {
  id: string; data: string; tipo: "receita" | "despesa"; categoria: string; descricao: string; valor: number; status: "previsto" | "recebido";
  processo_numero: string | null; cliente_id: string | null; origem: "manual" | "prestacao"; documento_caminho: string | null; obs: string | null; criado_em: string;
};
export const CATEGORIAS_RECEITA = ["Honorários contratuais", "Honorários de sucumbência", "Honorários iniciais / consulta", "Reembolso de despesas", "Outras receitas"];
export const CATEGORIAS_DESPESA = ["Aluguel / coworking", "Salários e pró-labore", "Sistemas e assinaturas", "Custas e despesas processuais", "Impostos", "Marketing", "Outras despesas"];

export type ResumoFin = { recebido: number; aReceber: number; pago: number; aPagar: number; resultado: number; dosProcessos: number;
  porCategoria: { tipo: "receita" | "despesa"; categoria: string; valor: number }[] };

const r2 = (v: number) => Math.round(v * 100) / 100;
export function resumirFinanceiro(ls: Pick<Lancamento, "tipo" | "categoria" | "valor" | "status" | "processo_numero">[]): ResumoFin {
  const soma = (f: (l: (typeof ls)[number]) => boolean) => r2(ls.filter(f).reduce((s, l) => s + Number(l.valor), 0));
  const recebido = soma((l) => l.tipo === "receita" && l.status === "recebido"), pago = soma((l) => l.tipo === "despesa" && l.status === "recebido");
  const m = new Map<string, { tipo: "receita" | "despesa"; categoria: string; valor: number }>();
  for (const l of ls.filter((x) => x.status === "recebido")) { const k = l.tipo + "|" + l.categoria; const x = m.get(k) || { tipo: l.tipo, categoria: l.categoria, valor: 0 }; x.valor = r2(x.valor + Number(l.valor)); m.set(k, x); }
  return { recebido, aReceber: soma((l) => l.tipo === "receita" && l.status === "previsto"), pago, aPagar: soma((l) => l.tipo === "despesa" && l.status === "previsto"), resultado: r2(recebido - pago),
    dosProcessos: soma((l) => l.tipo === "receita" && l.status === "recebido" && !!l.processo_numero), porCategoria: [...m.values()].sort((a, b) => (a.tipo === b.tipo ? b.valor - a.valor : a.tipo === "receita" ? -1 : 1)) };
}
