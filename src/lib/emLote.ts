// Gravações em lote: em vez de uma consulta por registro (N+1), uma consulta por grupo de registros
// que recebem a mesma alteração. O resultado gravado é o mesmo de antes.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Cliente = { from: (t: string) => any };
type Linha = Record<string, any>;

export const pedacos = <T>(l: T[], n: number): T[][] => { const out: T[][] = []; for (let i = 0; i < l.length; i += n) out.push(l.slice(i, i + n)); return out; };

/**
 * Atualiza vários registros: agrupa os que recebem exatamente os mesmos campos e grava cada grupo
 * com uma consulta só (… where chave in (…)), em pedaços de "tam". Devolve as linhas gravadas e o 1º erro.
 */
export async function atualizarAgrupado(sb: Cliente, tabela: string, chave: string, itens: { id: string | number; campos: Linha }[], tam = 200): Promise<{ linhas: Linha[]; erro: unknown | null }> {
  const grupos = new Map<string, { campos: Linha; ids: (string | number)[] }>();
  for (const it of itens) { const k = JSON.stringify(it.campos); const g = grupos.get(k) || grupos.set(k, { campos: it.campos, ids: [] }).get(k)!; g.ids.push(it.id); }
  const linhas: Linha[] = []; let erro: unknown | null = null;
  for (const g of grupos.values()) for (const ids of pedacos(g.ids, tam)) {
    const { data, error } = await sb.from(tabela).update(g.campos).in(chave, ids).select();
    if (error) { erro = erro || error; continue; }
    linhas.push(...(data || []));
  }
  return { linhas, erro };
}

/** insere várias linhas numa consulta só (em pedaços de "tam") e devolve as linhas criadas */
export async function inserirEmLote(sb: Cliente, tabela: string, linhas: Linha[], tam = 500, colunas = "*"): Promise<{ linhas: Linha[]; erro: unknown | null }> {
  const out: Linha[] = []; let erro: unknown | null = null;
  for (const p of pedacos(linhas, tam)) {
    if (!p.length) continue;
    const { data, error } = await sb.from(tabela).insert(p).select(colunas);
    if (error) { erro = erro || error; continue; }
    out.push(...(data || []));
  }
  return { linhas: out, erro };
}
