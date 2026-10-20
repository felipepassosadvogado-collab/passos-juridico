"use client";
// Memória de cálculo em PDF (pdf-lib, no navegador).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { MODULACAO, REGIMES, mesBR, type Opcoes, type Resultado } from "./calculo";

const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** a fonte padrão do PDF só tem o alfabeto latino (WinAnsi): troca o que não cabe nele */
const limpa = (s: string) => s.replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF§º°ª€•]/g, "");

export type Cabecalho = { autor: string; cpf?: string | null; reus: string; processo?: string | null; nb?: string | null; moral?: number };

export async function pdfCalculo(r: Resultado, o: Opcoes, h: Cabecalho, fonte: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); doc.setTitle("Memória de cálculo - " + limpa(h.autor)); doc.setAuthor("Passos Advocacia");
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 42; const ouro = rgb(0.54, 0.42, 0.17), cinza = rgb(0.38, 0.38, 0.38), linha = rgb(0.85, 0.83, 0.78);
  let pg: PDFPage = doc.addPage([W, H]); let y = H - M;
  const txt = (s: string, x: number, yy: number, tam = 9, fn: PDFFont = f, cor = rgb(0.1, 0.1, 0.1)) => pg.drawText(limpa(s), { x, y: yy, size: tam, font: fn, color: cor });
  const larg = (s: string, tam: number, fn: PDFFont = f) => fn.widthOfTextAtSize(limpa(s), tam);
  const dir = (s: string, xr: number, yy: number, tam = 9, fn: PDFFont = f) => txt(s, xr - larg(s, tam, fn), yy, tam, fn);
  const quebra = (s: string, max: number, tam: number, fn: PDFFont = f) => { const out: string[] = []; let l = ""; for (const p of limpa(s).split(/\s+/)) { const t = l ? l + " " + p : p; if (larg(t, tam, fn) > max && l) { out.push(l); l = p; } else l = t; } if (l) out.push(l); return out; };
  const nova = () => { pg = doc.addPage([W, H]); y = H - M; };
  const precisa = (h2: number) => { if (y - h2 < M + 30) { nova(); return true; } return false; };
  const paragrafo = (s: string, tam = 9, fn: PDFFont = f, rec = 0) => { for (const l of quebra(s, W - 2 * M - rec, tam, fn)) { precisa(tam + 4); txt(l, M + rec, y, tam, fn); y -= tam + 4; } };

  // cabeçalho
  txt("PASSOS ADVOCACIA", M, y, 13, fb, ouro); dir("Cálculo em " + new Date().toLocaleDateString("pt-BR"), W - M, y, 9); y -= 14;
  txt("Felipe dos Passos Silva · OAB/SC 58.547 · Rua Dona Francisca, 260, sala 1804, Centro, Joinville/SC", M, y, 8, f, cinza); y -= 10;
  pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: ouro }); y -= 22;
  txt("MEMÓRIA DE CÁLCULO - REPETIÇÃO DO INDÉBITO" + (o.dobro ? " EM DOBRO" : ""), M, y, 12, fb); y -= 18;
  const kv = (k: string, v: string) => { txt(k, M, y, 9, fb); for (const [i, l] of quebra(v, W - 2 * M - 95, 9).entries()) { txt(l, M + 95, y, 9); if (i >= 0) y -= 13; } };
  kv("Parte autora", h.autor + (h.cpf ? " · CPF " + h.cpf : "")); kv("Réus", h.reus);
  if (h.processo) kv("Processo", h.processo); if (h.nb) kv("Benefício", "NB " + h.nb);
  kv("Atualizado até", mesBR(r.ultimoMes) + " (último mês com índice aplicado; data-base " + mesBR(o.ate) + ")");
  y -= 6;

  // critérios
  txt("CRITÉRIOS", M, y, 10, fb, ouro); y -= 14;
  const crit = [
    o.dobro ? `Restituição em dobro dos valores descontados (art. 42, parágrafo único, do CDC)${o.modulacao ? `, aplicada aos descontos a partir de ${mesBR(MODULACAO)}, conforme a modulação do STJ no EAREsp 676.608/RS (cobranças posteriores a 30/03/2021); antes disso, restituição simples` : ""}.` : "Restituição simples dos valores descontados.",
    "Correção monetária desde cada desconto (Súmula 43 do STJ) e juros de mora desde cada desconto, por se tratar de responsabilidade extracontratual (Súmula 54 do STJ). Juros simples, não capitalizados, calculados sobre o valor corrigido.",
    REGIMES[o.regime].texto,
    "Cada parcela é considerada descontada no mês de competência indicado no extrato do INSS; atualização do mês do desconto até o mês anterior à data-base.",
    "Índices: " + fonte + ".",
  ];
  for (const c of crit) { const ls = quebra(c, W - 2 * M - 12, 8.5); precisa(ls.length * 12); txt("•", M, y, 8.5); for (const l of ls) { txt(l, M + 12, y, 8.5); y -= 12; } y -= 2; }
  if (r.faltam.length) { y -= 2; paragrafo("Índices ainda não divulgados, considerados zero: " + r.faltam.slice(0, 12).join(", ") + (r.faltam.length > 12 ? "..." : "") + ".", 8, f); }
  y -= 8;

  // tabela
  const cols = [{ t: "Contrato", x: M, w: 92 }, { t: "Compet.", x: M + 92, w: 50 }, { t: "Parcela", x: M + 142, w: 62, r: true }, { t: o.dobro ? "Valor (dobro)" : "Valor", x: M + 204, w: 72, r: true }, { t: "Correção", x: M + 276, w: 66, r: true }, { t: "Juros", x: M + 342, w: 66, r: true }, { t: "Total", x: M + 408, w: W - 2 * M - 408, r: true }];
  const topo = () => { pg.drawRectangle({ x: M, y: y - 4, width: W - 2 * M, height: 16, color: rgb(0.95, 0.92, 0.85) }); for (const c of cols) c.r ? dir(c.t, c.x + c.w - 4, y, 8, fb) : txt(c.t, c.x + 4, y, 8, fb); y -= 16; };
  const linhaT = (v: string[], negrito = false) => { if (precisa(14)) topo(); const fn = negrito ? fb : f; v.forEach((s, i) => { const c = cols[i]; c.r ? dir(s, c.x + c.w - 4, y, 8, fn) : txt(s.length > 18 ? s.slice(0, 17) + "…" : s, c.x + 4, y, 8, fn); }); pg.drawLine({ start: { x: M, y: y - 4 }, end: { x: W - M, y: y - 4 }, thickness: 0.4, color: linha }); y -= 13; };
  txt("RESUMO POR CONTRATO", M, y, 10, fb, ouro); y -= 14; topo();
  for (const c of r.porContrato) linhaT([c.contrato, c.n + " parc.", brl(c.valor), brl(c.base), brl(c.correcao), brl(c.juros), brl(c.total)]);
  linhaT(["TOTAL", r.linhas.length + " parc.", brl(r.tot.valor), brl(r.tot.base), brl(r.tot.correcao), brl(r.tot.juros), brl(r.tot.total)], true);
  y -= 10;
  // quadro final
  precisa(90);
  const caixa = (k: string, v: string, forte = false) => { txt(k, M + 10, y, forte ? 10 : 9, forte ? fb : f); dir(v, W - M - 10, y, forte ? 10 : 9, forte ? fb : f); y -= forte ? 16 : 13; };
  const y0 = y + 12; const linhasCx = 3 + (h.moral ? 2 : 0); pg.drawRectangle({ x: M, y: y0 - linhasCx * 14 - 12, width: W - 2 * M, height: linhasCx * 14 + 12, borderColor: ouro, borderWidth: 1 });
  caixa("Total descontado (valor nominal)", brl(r.tot.valor)); caixa(o.dobro ? "Indébito em dobro (nominal)" : "Indébito (nominal)", brl(r.tot.base));
  caixa("INDÉBITO ATUALIZADO (com correção e juros)", brl(r.tot.total), true);
  if (h.moral) { caixa("Danos morais (pedido)", brl(h.moral)); caixa("TOTAL (indébito atualizado + danos morais)", brl(r.tot.total + h.moral), true); }
  y -= 14;

  // detalhe
  precisa(60); txt("DEMONSTRATIVO MÊS A MÊS", M, y, 10, fb, ouro); y -= 14; topo();
  for (const l of r.linhas) linhaT([l.contrato, mesBR(l.comp), brl(l.valor), brl(l.base) + (o.dobro && !l.dobro ? "*" : ""), brl(l.correcao), brl(l.juros), brl(l.total)]);
  if (o.dobro && o.modulacao && r.linhas.some((l) => !l.dobro)) { y -= 4; paragrafo("* restituição simples (desconto anterior a " + mesBR(MODULACAO) + ").", 7.5); }
  y -= 8; paragrafo("Cálculo estimativo elaborado pelo escritório para instruir o pedido, sujeito à conferência pela Contadoria do Juízo e à atualização até o efetivo pagamento.", 7.5, f);

  const n = doc.getPageCount();
  doc.getPages().forEach((p, i) => p.drawText(limpa(`Passos Advocacia · memória de cálculo · página ${i + 1} de ${n}`), { x: M, y: 24, size: 7.5, font: f, color: cinza }));
  return doc.save();
}
