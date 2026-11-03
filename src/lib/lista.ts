// Paginação das listas e tabelas (só a exibição: os dados e os filtros continuam os mesmos)
// e o filtro de dígitos usado para o banco devolver só as fichas candidatas (telefone/CPF).

export const TAMANHOS = [25, 50, 100] as const;

/** recorte de uma página: índices, total de páginas e a página corrigida (nunca passa do fim) */
export function recorte(total: number, pagina: number, porPagina: number) {
  const pp = Math.max(1, Math.floor(porPagina) || 50);
  const paginas = Math.max(1, Math.ceil(total / pp));
  const p = Math.min(Math.max(1, Math.floor(pagina) || 1), paginas);
  const ini = (p - 1) * pp; const fim = Math.min(total, ini + pp);
  return { pagina: p, paginas, ini, fim, porPagina: pp };
}

/** números de página a mostrar (1 … 4 5 6 … 20), com "…" onde há salto */
export function numerosPagina(pagina: number, paginas: number): (number | "…")[] {
  if (paginas <= 7) return Array.from({ length: paginas }, (_, i) => i + 1);
  const s = new Set([1, paginas, pagina - 1, pagina, pagina + 1].filter((x) => x >= 1 && x <= paginas));
  const l = [...s].sort((a, b) => a - b); const out: (number | "…")[] = [];
  l.forEach((n, i) => { if (i && n - l[i - 1] > 1) out.push("…"); out.push(n); });
  return out;
}

/**
 * Padrão ILIKE com os dígitos em ordem e qualquer coisa entre eles ("%4%7%9%…%").
 * Casa com o número em qualquer formatação ("(47) 9 9999-1111", "47999991111", "123.456.789-01"),
 * então o banco devolve um SUPERCONJUNTO das fichas certas — a comparação exata continua sendo feita depois,
 * igual antes. Só diminui o que trafega. Sem dígitos suficientes, devolve null (aí busca como antes).
 */
export function padraoDigitos(digitos: string, minimo = 8): string | null {
  const d = String(digitos || "").replace(/\D/g, "");
  if (d.length < minimo) return null;
  return "%" + d.split("").join("%") + "%";
}
