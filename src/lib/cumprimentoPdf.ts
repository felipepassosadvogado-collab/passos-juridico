"use client";
// Memória de cálculo do cumprimento de sentença em PDF (pdf-lib, no navegador).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { mesBR } from "./calculo";
import { MODULACAO_CS, REGIMES_CS, textoAtualizacaoComp, type ItemCs, type ParamsCs, type ResultadoCs } from "./cumprimento";

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num = (v: number, d = 6) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v: number) => (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + "%";
const limpa = (s: string) => s.replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/×/g, "x").replace(/[^\x20-\x7E\xA0-\xFF§º°ª€•]/g, "");

export type CabecalhoCs = { exequente: string; cpf?: string | null; executados: string; processo: string; juizo?: string | null; nb?: string | null };

export async function pdfCumprimento(r: ResultadoCs, p: ParamsCs, h: CabecalhoCs, fonte: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); doc.setTitle("Memória de cálculo - cumprimento de sentença - " + limpa(h.exequente)); doc.setAuthor("Passos Advocacia");
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40; const ouro = rgb(0.54, 0.42, 0.17), cinza = rgb(0.38, 0.38, 0.38), linha = rgb(0.85, 0.83, 0.78);
  let pg: PDFPage = doc.addPage([W, H]); let y = H - M;
  const txt = (s: string, x: number, yy: number, tam = 9, fn: PDFFont = f, cor = rgb(0.1, 0.1, 0.1)) => pg.drawText(limpa(s), { x, y: yy, size: tam, font: fn, color: cor });
  const larg = (s: string, tam: number, fn: PDFFont = f) => fn.widthOfTextAtSize(limpa(s), tam);
  const dir = (s: string, xr: number, yy: number, tam = 9, fn: PDFFont = f) => txt(s, xr - larg(s, tam, fn), yy, tam, fn);
  const quebra = (s: string, max: number, tam: number, fn: PDFFont = f) => { const out: string[] = []; let l = ""; for (const w of limpa(s).split(/\s+/)) { const t = l ? l + " " + w : w; if (larg(t, tam, fn) > max && l) { out.push(l); l = w; } else l = t; } if (l) out.push(l); return out; };
  const precisa = (h2: number) => { if (y - h2 < M + 30) { pg = doc.addPage([W, H]); y = H - M; return true; } return false; };
  const paragrafo = (s: string, tam = 9, fn: PDFFont = f, rec = 0) => { for (const l of quebra(s, W - 2 * M - rec, tam, fn)) { precisa(tam + 4); txt(l, M + rec, y, tam, fn); y -= tam + 4; } };
  const titulo = (s: string) => { precisa(40); y -= 4; txt(s, M, y, 10, fb, ouro); y -= 15; };

  txt("PASSOS ADVOCACIA", M, y, 13, fb, ouro); dir("Cálculo em " + new Date().toLocaleDateString("pt-BR"), W - M, y, 9); y -= 14;
  txt("Felipe dos Passos Silva · OAB/SC 58.547 · Rua Dona Francisca, 260, sala 1804, Centro, Joinville/SC", M, y, 8, f, cinza); y -= 10;
  pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: ouro }); y -= 22;
  txt("MEMÓRIA DE CÁLCULO - CUMPRIMENTO DE SENTENÇA", M, y, 12, fb); y -= 18;
  const kv = (k: string, v: string) => { txt(k, M, y, 9, fb); for (const l of quebra(v, W - 2 * M - 100, 9)) { txt(l, M + 100, y, 9); y -= 13; } };
  kv("Exequente", h.exequente + (h.cpf ? " · CPF " + h.cpf : "")); kv("Executado(s)", h.executados); kv("Processo", h.processo + (h.juizo ? " · " + h.juizo : ""));
  if (h.nb) kv("Benefício", "NB " + h.nb);
  kv("Data-base", mesBR(p.base) + " (último mês com índice aplicado)"); y -= 4;

  titulo("CRITÉRIOS (CONFORME O TÍTULO EXECUTIVO)");
  const crit = [
    REGIMES_CS[p.regime].texto,
    p.restituicao === "nenhuma" ? "" : (p.restituicao === "simples" ? "Danos materiais: restituição simples" : p.restituicao === "dobro" ? "Danos materiais: restituição em dobro (art. 42, parágrafo único, do CDC)" : `Danos materiais: restituição em dobro a partir de ${mesBR(MODULACAO_CS)} (STJ, EAREsp 676.608/RS) e simples antes disso`)
      + `, cada parcela corrigida desde a sua competência e com juros ${p.jurosMateriais === "citacao" && p.citacao ? "desde a citação (" + mesBR(p.citacao) + ")" : "desde a sua competência (Súmula 54 do STJ)"}.`,
    r.moral && p.moral ? `Danos morais: ${brl(p.moral.valor)}, com correção monetária desde ${mesBR(p.moral.correcaoDesde)} e juros de mora desde ${mesBR(p.moral.jurosDesde)}.` : "",
    r.compensacao && p.compensacao ? `Compensação: valor creditado de ${brl(p.compensacao.valor)} em ${mesBR(p.compensacao.mes)}, ${textoAtualizacaoComp(p.compensacao.atualizacao)}, deduzido da condenação.` : "",
    p.honorarios.tipo === "percentual" ? `Honorários sucumbenciais: ${p.honorarios.pct}% sobre o valor atualizado da condenação${p.honorarios.minimo ? `, com piso de ${brl(p.honorarios.minimo)}${p.honorarios.minimoDesde ? " (" + mesBR(p.honorarios.minimoDesde) + ", atualizado monetariamente desde então)" : ""}, prevalecendo o maior` : ""}.`
      : p.honorarios.tipo === "fixo" ? `Honorários sucumbenciais fixados em ${brl(p.honorarios.valor)}${p.honorarios.valorDesde ? ", atualizados monetariamente desde " + mesBR(p.honorarios.valorDesde) : ""}.` : "Sem honorários sucumbenciais no título.",
    "Cada valor é atualizado a partir do mês seguinte ao seu marco inicial até a data-base, inclusive; correção composta mês a mês e juros simples sobre o valor corrigido.",
    "Índices: " + fonte + ".",
  ].filter(Boolean);
  for (const c of crit) { const ls = quebra(c, W - 2 * M - 12, 8.5); precisa(ls.length * 12); txt("•", M, y, 8.5); for (const l of ls) { txt(l, M + 12, y, 8.5); y -= 12; } y -= 2; }
  if (r.faltam.length) paragrafo("Índices ainda não divulgados, considerados zero: " + r.faltam.slice(0, 12).join(", ") + (r.faltam.length > 12 ? "..." : "") + ".", 8);

  // quadro resumo
  titulo("RESUMO");
  const linhasResumo: [string, number, boolean][] = [];
  if (r.linhas.length) linhasResumo.push([`Danos materiais (${r.linhas.length} parcelas atualizadas)`, r.materiais, false]);
  if (r.moral) linhasResumo.push(["Danos morais atualizados", r.moral.total, false]);
  if (r.compensacao) linhasResumo.push([p.compensacao?.atualizacao === "historico" ? "(-) Compensação do valor creditado (valor histórico)" : p.compensacao?.atualizacao === "correcao" ? "(-) Compensação do valor creditado, corrigido" : "(-) Compensação do valor creditado, atualizado", -r.compensacao.total, false]);
  linhasResumo.push(["TOTAL DA CONDENAÇÃO", r.condenacao, true]);
  if (r.honorarios) linhasResumo.push([`Honorários sucumbenciais${r.honorarios.prevaleceMinimo ? " (piso)" : p.honorarios.tipo === "percentual" ? ` (${p.honorarios.pct}%)` : ""}`, r.honorarios.valor, false]);
  linhasResumo.push(["TOTAL LÍQUIDO EXEQUENDO", r.total, true]);
  precisa(linhasResumo.length * 16 + 16);
  const y0 = y + 12; pg.drawRectangle({ x: M, y: y0 - linhasResumo.length * 16 - 10, width: W - 2 * M, height: linhasResumo.length * 16 + 10, borderColor: ouro, borderWidth: 1 });
  for (const [k, v, forte] of linhasResumo) { txt(k, M + 10, y, forte ? 10 : 9, forte ? fb : f); dir(brl(v), W - M - 10, y, forte ? 10 : 9, forte ? fb : f); y -= 16; }
  y -= 10;

  // tabela genérica
  type Col = { t: string; w: number; r?: boolean };
  const tabela = (cols: Col[], linhas: string[][], negrito: number[] = []) => {
    const xs: number[] = []; let x = M; for (const c of cols) { xs.push(x); x += c.w; }
    const topo = () => { pg.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: rgb(0.95, 0.92, 0.85) }); cols.forEach((c, i) => c.r ? dir(c.t, xs[i] + c.w - 4, y, 7.5, fb) : txt(c.t, xs[i] + 4, y, 7.5, fb)); y -= 16; };
    precisa(40); topo();
    linhas.forEach((v, li) => { if (precisa(14)) topo(); const fn = negrito.includes(li) ? fb : f; v.forEach((s, i) => { const c = cols[i]; c.r ? dir(s, xs[i] + c.w - 4, y, 7.5, fn) : txt(s.length > 22 ? s.slice(0, 21) + "…" : s, xs[i] + 4, y, 7.5, fn); }); pg.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.4, color: linha }); y -= 13; });
  };
  const item = (nome: string, it: ItemCs, marcos: string) => {
    titulo(nome); paragrafo(marcos, 8.5);
    tabela([{ t: "Valor", w: 85, r: true }, { t: "Fator de correção", w: 85, r: true }, { t: "Corrigido", w: 85, r: true }, { t: "Juros (%)", w: 85, r: true }, { t: "Juros", w: 85, r: true }, { t: "Total", w: W - 2 * M - 425, r: true }],
      [[brl(it.valor), num(it.fator), brl(it.corrigido), pct(it.jurosPct), brl(it.juros), brl(it.total)]], [0]);
  };

  if (r.linhas.length) {
    titulo("DANOS MATERIAIS - RESUMO POR CONTRATO");
    tabela([{ t: "Contrato", w: 110 }, { t: "Competências", w: 110 }, { t: "Parcelas", w: 55, r: true }, { t: "Parcela", w: 70, r: true }, { t: "Nominal", w: 80, r: true }, { t: "Atualizado", w: W - 2 * M - 425, r: true }],
      [...r.porContrato.map((c) => [c.contrato, mesBR(c.ini) + " a " + mesBR(c.fim), String(c.n), brl(c.parcela), brl(c.base), brl(c.total)]),
        ["TOTAL", "", String(r.linhas.length), "", brl(r.porContrato.reduce((s, c) => s + c.base, 0)), brl(r.materiais)]], [r.porContrato.length]);
    y -= 8;
    titulo("DANOS MATERIAIS - DEMONSTRATIVO MÊS A MÊS");
    tabela([{ t: "Contrato", w: 80 }, { t: "Compet.", w: 48 }, { t: "Valor", w: 60, r: true }, { t: "Fator corr.", w: 62, r: true }, { t: "Corrigido", w: 66, r: true }, { t: "Juros %", w: 60, r: true }, { t: "Juros", w: 62, r: true }, { t: "Total", w: W - 2 * M - 438, r: true }],
      r.linhas.map((l) => [l.contrato, mesBR(l.comp), brl(l.base) + (p.restituicao === "dobro_modulado" && !l.dobro ? "*" : ""), num(l.fator), brl(l.corrigido), pct(l.jurosPct), brl(l.juros), brl(l.total)]));
    if (p.restituicao === "dobro_modulado" && r.linhas.some((l) => !l.dobro)) paragrafo("* restituição simples (desconto anterior a " + mesBR(MODULACAO_CS) + ").", 7.5);
  }
  if (r.moral && p.moral) item("DANOS MORAIS", r.moral, `Correção monetária desde ${mesBR(p.moral.correcaoDesde)} e juros de mora desde ${mesBR(p.moral.jurosDesde)}, até ${mesBR(p.base)}.`);
  if (r.compensacao && p.compensacao) item("COMPENSAÇÃO (VALOR CREDITADO)", r.compensacao, `Valor creditado em ${mesBR(p.compensacao.mes)}, ${textoAtualizacaoComp(p.compensacao.atualizacao)}, deduzido da condenação.`);
  if (r.honorarios) {
    titulo("HONORÁRIOS SUCUMBENCIAIS");
    if (p.honorarios.tipo === "percentual") paragrafo(`${p.honorarios.pct}% sobre a condenação atualizada (${brl(r.condenacao)}) = ${brl(r.honorarios.pctValor)}.${p.honorarios.minimo ? ` Piso: ${brl(p.honorarios.minimo)}${p.honorarios.minimoDesde ? " atualizado desde " + mesBR(p.honorarios.minimoDesde) : ""} = ${brl(r.honorarios.minimoAtual)}.` : ""} Devido: ${brl(r.honorarios.valor)}${r.honorarios.prevaleceMinimo ? " (prevalece o piso)" : ""}.`, 8.5);
    else paragrafo(`Honorários fixados em ${brl(p.honorarios.valor)}${p.honorarios.valorDesde ? ", atualizados desde " + mesBR(p.honorarios.valorDesde) : ""}: ${brl(r.honorarios.valor)}.`, 8.5);
  }
  y -= 8; paragrafo("Cálculo elaborado pelo escritório com base no título executivo, sujeito à conferência pela Contadoria do Juízo e à atualização até o efetivo pagamento.", 7.5);
  const n = doc.getPageCount();
  doc.getPages().forEach((pp, i) => pp.drawText(limpa(`Passos Advocacia · memória de cálculo do cumprimento de sentença · página ${i + 1} de ${n}`), { x: M, y: 22, size: 7.5, font: f, color: cinza }));
  return doc.save();
}
