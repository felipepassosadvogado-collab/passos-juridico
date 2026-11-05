// Contas do painel de consumo do Claude (sem acesso ao banco: recebe as linhas de uso_claude e os preços).
export type LinhaUso = { em: string; operacao: string; modelo: string; entrada: number; saida: number; cache_leitura: number; cache_escrita: number };
export type Preco = { entrada: number; saida: number; cacheLeitura: number; cacheEscrita: number }; // US$ por milhão de tokens
/** preços de tabela da Anthropic em 11/2026 (o titular pode ajustar no painel) */
export const PRECOS_PADRAO: Record<string, Preco> = {
  "claude-opus-5-5": { entrada: 4, saida: 20, cacheLeitura: 0.2, cacheEscrita: 5 },
  "claude-sonnet-5-5": { entrada: 2, saida: 10, cacheLeitura: 0.1, cacheEscrita: 2.5 },
};
export const NOME_MODELO: Record<string, string> = { "claude-opus-5-5": "Opus 5.5", "claude-sonnet-5-5": "Sonnet 5.5" };

/** nome amigável da função do sistema, pelo nome técnico da operação */
export function nomeFuncao(op: string): string {
  if (op.startsWith("peticao.peca")) return "Petições intermediárias";
  if (op.startsWith("peticao.inicial") || op === "peticao") return "Petição inicial";
  if (op.startsWith("cumprimento")) return "Cumprimento de sentença";
  if (op.startsWith("whatsapp.agente")) return "Assistente do WhatsApp";
  if (op.startsWith("djen") || op === "claude.analisar") return "Análise das publicações";
  if (op === "claude.ler") return "Leitura de documentos e extratos";
  if (op === "claude.mensagem") return "Mensagens de aviso ao cliente";
  if (op === "claude.resposta_cliente") return "Respostas ao cliente (processo e atendimento)";
  if (op === "claude.fases") return "Sugestão de fases (CRM)";
  return "Outros";
}

export function custo(l: Pick<LinhaUso, "modelo" | "entrada" | "saida" | "cache_leitura" | "cache_escrita">, precos: Record<string, Preco>): number {
  const p = precos[l.modelo] || (/opus/.test(l.modelo) ? precos["claude-opus-5-5"] : precos["claude-sonnet-5-5"]) || PRECOS_PADRAO["claude-sonnet-5-5"];
  return (l.entrada * p.entrada + l.saida * p.saida + l.cache_leitura * p.cacheLeitura + l.cache_escrita * p.cacheEscrita) / 1e6;
}

export type Grupo = { nome: string; chamadas: number; tokens: number; custo: number };
export type ResumoConsumo = { total: Grupo; porFuncao: Grupo[]; porModelo: Grupo[]; porDia: { dia: string; custo: number; chamadas: number }[] };

const dia = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });

export function resumirConsumo(linhas: LinhaUso[], precos: Record<string, Preco>): ResumoConsumo {
  const soma = (nome: string, l: LinhaUso[]): Grupo => ({ nome, chamadas: l.length, tokens: l.reduce((s, x) => s + x.entrada + x.saida + x.cache_leitura + x.cache_escrita, 0), custo: l.reduce((s, x) => s + custo(x, precos), 0) });
  const agrupa = (chave: (l: LinhaUso) => string) => { const m = new Map<string, LinhaUso[]>(); for (const l of linhas) { const k = chave(l); (m.get(k) || m.set(k, []).get(k)!).push(l); } return [...m].map(([k, l]) => soma(k, l)).sort((a, b) => b.custo - a.custo); };
  const porDiaMap = new Map<string, { custo: number; chamadas: number }>();
  for (const l of linhas) { const d = dia(l.em); const x = porDiaMap.get(d) || { custo: 0, chamadas: 0 }; x.custo += custo(l, precos); x.chamadas++; porDiaMap.set(d, x); }
  return { total: soma("Total", linhas), porFuncao: agrupa((l) => nomeFuncao(l.operacao)), porModelo: agrupa((l) => NOME_MODELO[l.modelo] || l.modelo),
    porDia: [...porDiaMap].map(([d, x]) => ({ dia: d, ...x })).sort((a, b) => a.dia.localeCompare(b.dia)) };
}
