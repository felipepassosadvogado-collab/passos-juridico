// Petição intermediária em modo econômico: no máximo N páginas dos autos vão para o Claude.
// Ficam o começo do processo (inicial), as páginas do ato que a peça enfrenta (laudo, sentença, contestação…)
// e, completando, os atos mais recentes (fim do arquivo). O resto é marcado como omitido.

export type Pagina = { arquivo: number; n: number; texto: string | null }; // texto null = página só imagem (escaneada)
export type Selecao = { escolhidas: Pagina[]; total: number; motivo: string };

/** palavras que identificam o ato que cada tipo de peça enfrenta */
export function palavrasDoTipo(tipo: string): RegExp | null {
  const t = tipo.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  if (/laudo|peric|quesit|grafot/.test(t)) return /laudo|perit[oa]|pericia|grafot|quesito|assinatura questionada|padr[oõ]es/gi;
  if (/embargo/.test(t)) return /senten[cç]a|ac[oó]rd[aã]o|julgo|omiss[aã]o|contradi[cç][aã]o|obscuridade/gi;
  if (/recurso|contrarraz|apela|inominado/.test(t)) return /senten[cç]a|julgo (im)?procedente|dispositivo|ante o exposto|recurso inominado|raz[oõ]es recursais/gi;
  if (/replica|contestac/.test(t)) return /contesta[cç][aã]o|preliminar|impugna|prescri[cç][aã]o|decad[eê]ncia/gi;
  if (/cumprimento|calculo|rpv|alvara/.test(t)) return /c[aá]lculo|tr[aâ]nsito em julgado|rpv|precat[oó]rio|alvar[aá]|dep[oó]sito/gi;
  if (/audiencia|alegac/.test(t)) return /audi[eê]ncia|depoimento|testemunh|termo de/gi;
  return null;
}

const INICIO = 3; // primeiras páginas do primeiro arquivo (petição inicial)
const MAX_RELEVANTES = 24;

/** arquivo "escaneado": metade ou mais das páginas sem texto (ex.: laudo digitalizado). Nele, as páginas vão como imagem. */
export function arquivosEscaneados(paginas: Pagina[]): Set<number> {
  const c = new Map<number, [number, number]>(); for (const p of paginas) { const x = c.get(p.arquivo) || [0, 0]; x[0]++; if (p.texto == null) x[1]++; c.set(p.arquivo, x); }
  return new Set([...c].filter(([, [t, s]]) => s / t >= 0.5).map(([a]) => a));
}

export function selecionarPaginas(todas: Pagina[], tipo: string, max = 40): Selecao {
  // em PDF de texto (cópia do eproc), página sem texto é capa de evento, página em branco ou foto: não ocupa vaga
  const esc = arquivosEscaneados(todas);
  const paginas = todas.filter((p) => p.texto != null || esc.has(p.arquivo));
  const puladas = todas.length - paginas.length;
  if (paginas.length <= max) return { escolhidas: paginas, total: todas.length, motivo: puladas ? `${puladas} página(s) sem texto puladas` : "" };
  const chave = (p: Pagina) => p.arquivo + ":" + p.n; const escolhe = new Set<string>(); const idx = new Map(paginas.map((p, i) => [chave(p), i]));
  const add = (p: Pagina | undefined) => { if (p && escolhe.size < max) escolhe.add(chave(p)); };
  // 1) começo: a inicial dá os fatos e os pedidos
  paginas.filter((p) => p.arquivo === paginas[0].arquivo).slice(0, INICIO).forEach(add);
  // 2) o ato que a peça enfrenta: páginas com mais ocorrências das palavras do tipo (e a página seguinte, que costuma continuar o texto)
  const rx = palavrasDoTipo(tipo); let relevantes = 0;
  if (rx) {
    const pontos = paginas.map((p, i) => ({ i, n: p.texto ? (p.texto.match(rx) || []).length : 0 })).filter((x) => x.n >= 2)
      .sort((a, b) => b.n - a.n || b.i - a.i);
    for (const x of pontos) {
      if (relevantes >= MAX_RELEVANTES || escolhe.size >= max) break;
      for (const j of [x.i, x.i + 1]) { const p = paginas[j]; if (p && !escolhe.has(chave(p)) && relevantes < MAX_RELEVANTES) { add(p); relevantes++; } }
    }
  }
  // 3) completa com os atos mais recentes (fim dos autos)
  for (let i = paginas.length - 1; i >= 0 && escolhe.size < max; i--) add(paginas[i]);
  const escolhidas = paginas.filter((p) => escolhe.has(chave(p))).sort((a, b) => idx.get(chave(a))! - idx.get(chave(b))!);
  return { escolhidas, total: todas.length, motivo: `início do processo${relevantes ? ", páginas do ato da peça" : ""} e atos mais recentes` };
}

/** monta o texto enviado ao Claude, marcando os trechos omitidos */
export function textoSelecionado(sel: Selecao, nomes: string[]): { nome: string; paginas: number; semTexto: number[]; texto: string }[] {
  const porArq = new Map<number, Pagina[]>(); for (const p of sel.escolhidas) (porArq.get(p.arquivo) || porArq.set(p.arquivo, []).get(p.arquivo)!).push(p);
  return [...porArq].map(([a, ps]) => {
    const partes: string[] = []; let ant = 0;
    for (const p of ps) {
      if (p.n > ant + 1) partes.push(`[… páginas ${ant + 1}${p.n - 1 > ant + 1 ? " a " + (p.n - 1) : ""} omitidas (modo econômico) …]`);
      partes.push(p.texto != null ? `--- página ${p.n} ---\n${p.texto}` : `--- página ${p.n}: só imagem (vai anexada) ---`); ant = p.n;
    }
    return { nome: nomes[a] || "autos.pdf", paginas: ps.length, semTexto: ps.filter((p) => p.texto == null).map((p) => p.n), texto: partes.join("\n") };
  });
}
