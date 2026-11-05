"use client";
// Relatório de protocolos (aba Processos) em PDF: quantos processos, em quais cidades e varas, e em que mês.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { paraPng } from "./relatorioPdf";
import type { ResumoProtocolos } from "./protocolos";

const limpa = (s: string) => String(s ?? "").replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF§º°ª•]/g, "");
const dataBR = (d: string) => d.split("-").reverse().join("/");
const pct = (n: number, t: number) => (t ? Math.round((n / t) * 1000) / 10 : 0).toLocaleString("pt-BR") + "%";

export async function pdfProtocolos(r: ResumoProtocolos, o: { titulo: string; filtros: string[]; emitidoPor: string; anexo: boolean }): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); doc.setTitle("Relatório de protocolos - " + o.titulo); doc.setAuthor("Passos Advocacia");
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  const ouro = rgb(0.6, 0.47, 0.2), ouroClaro = rgb(0.96, 0.93, 0.86), cinza = rgb(0.4, 0.4, 0.4), linha = rgb(0.86, 0.84, 0.79), preto = rgb(0.1, 0.1, 0.1), azul = rgb(0.25, 0.42, 0.62);
  const logoPng = await paraPng("/marca/fp.png", false); const logo: PDFImage | null = logoPng ? await doc.embedPng(logoPng) : null;
  let pg!: PDFPage; let y = 0; const paginas: PDFPage[] = [];
  const txt = (s: string, x: number, yy: number, tam = 9, fn: PDFFont = f, cor = preto) => pg.drawText(limpa(s), { x, y: yy, size: tam, font: fn, color: cor });
  const larg = (s: string, tam: number, fn: PDFFont = f) => fn.widthOfTextAtSize(limpa(s), tam);
  const dir = (s: string, xr: number, yy: number, tam = 9, fn: PDFFont = f, cor = preto) => txt(s, xr - larg(s, tam, fn), yy, tam, fn, cor);
  const corta = (s: string, max: number, tam: number, fn: PDFFont = f) => { let t = limpa(s); if (larg(t, tam, fn) <= max) return t; while (t.length > 1 && larg(t + "...", tam, fn) > max) t = t.slice(0, -1); return t + "..."; };
  const cabecalho = () => {
    pg = doc.addPage([W, H]); paginas.push(pg); y = H - M;
    if (logo) { const h = 30, w = (logo.width / logo.height) * h; pg.drawImage(logo, { x: M, y: y - h + 6, width: w, height: h }); }
    const xl = M + (logo ? 44 : 0);
    txt("PASSOS ADVOCACIA", xl, y - 6, 13, fb, ouro);
    txt("Felipe dos Passos Silva · OAB/SC 58.547 · Rua Dona Francisca, 260, sala 1804, Centro, Joinville/SC", xl, y - 18, 7.5, f, cinza);
    dir("Emitido em " + new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às"), W - M, y - 6, 8, f, cinza);
    dir("por " + o.emitidoPor, W - M, y - 18, 8, f, cinza);
    y -= 30; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: ouro }); y -= 20;
  };
  const precisa = (h: number) => { if (y - h < M + 24) cabecalho(); };
  const secao = (s: string, min = 70) => { precisa(min); y -= 6; txt(s.toUpperCase(), M, y, 10, fb, ouro); y -= 6; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: linha }); y -= 14; };
  const nota = (s: string) => { precisa(12); txt(s, M, y, 7.5, f, cinza); y -= 11; };
  const tiles = (itens: { rot: string; v: string; sub?: string }[], h = 54) => {
    precisa(h + 10); const gap = 8, w = (W - 2 * M - gap * (itens.length - 1)) / itens.length;
    itens.forEach((it, i) => {
      const x = M + i * (w + gap);
      pg.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: linha, borderWidth: 0.7, color: rgb(1, 1, 1) }); pg.drawRectangle({ x, y: y - h, width: 3, height: h, color: ouro });
      txt(corta(it.rot, w - 16, 8), x + 10, y - 14, 8, f, cinza); txt(it.v, x + 10, y - 34, 18, fb, preto);
      if (it.sub) txt(corta(it.sub, w - 16, 6.8), x + 10, y - 46, 6.8, f, cinza);
    });
    y -= h + 12;
  };
  type Col = { t: string; w: number; dir?: boolean };
  const tabela = (cols: Col[], linhas: { v: string[]; negrito?: boolean; recuo?: boolean; barra?: number }[]) => {
    const tw = W - 2 * M; const soma = cols.reduce((s, c) => s + c.w, 0); const ws = cols.map((c) => (c.w / soma) * tw);
    const cab = () => { precisa(34); pg.drawRectangle({ x: M, y: y - 16, width: tw, height: 18, color: ouroClaro }); let x = M; cols.forEach((c, i) => { if (c.dir) dir(c.t, x + ws[i] - 5, y - 11, 7.5, fb, ouro); else txt(c.t, x + 5, y - 11, 7.5, fb, ouro); x += ws[i]; }); y -= 20; };
    cab();
    for (const l of linhas) {
      if (y - 15 < M + 24) { cabecalho(); cab(); }
      const fn = l.negrito ? fb : f; let x = M;
      if (l.barra != null) pg.drawRectangle({ x: M + ws[0] + ws[1] + 5, y: y - 10, width: Math.max(1, (ws[2] - 10) * l.barra), height: 7, color: azul, opacity: 0.55 });
      l.v.forEach((v, i) => { const xi = x + (i === 0 && l.recuo ? 14 : 0); const t = corta(v, ws[i] - 10 - (i === 0 && l.recuo ? 14 : 0), 8, fn); if (cols[i].dir) dir(t, x + ws[i] - 5, y - 9, 8, fn); else txt(t, xi + 5, y - 9, 8, fn, l.recuo ? cinza : preto); x += ws[i]; });
      y -= 13; pg.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.3, color: linha });
    }
    y -= 10;
  };

  cabecalho();
  txt("Relatório de protocolos", M, y, 17, fb, preto); y -= 16;
  txt(o.titulo, M, y, 10, fb, ouro); y -= 13;
  for (const fl of o.filtros) { txt(fl, M, y, 8, f, cinza); y -= 11; }
  y -= 6;
  const fed = r.porJustica.find((x) => x.nome === "Federal")?.n || 0, est = r.porJustica.find((x) => x.nome === "Estadual")?.n || 0;
  tiles([
    { rot: "Processos protocolados", v: String(r.total) },
    { rot: "Justiça Federal", v: String(fed), sub: pct(fed, r.total) + " do total" },
    { rot: "Justiça Estadual", v: String(est), sub: pct(est, r.total) + " do total" },
    { rot: "Cidades", v: String(r.porCidade.length), sub: r.porVara.length + " varas/órgãos" },
  ]);
  if (!r.total) { nota("Nenhum processo com esses filtros."); }
  else {
    if (r.porMes.length) {
      secao("Por mês do protocolo", 40 + r.porMes.length * 13);
      const max = Math.max(...r.porMes.map((m) => m.n));
      tabela([{ t: "Mês", w: 22 }, { t: "Processos", w: 12, dir: true }, { t: "", w: 50 }, { t: "% do período", w: 16, dir: true }],
        r.porMes.map((m) => ({ v: [m.nome, String(m.n), "", pct(m.n, r.total)], barra: m.n / max })));
    }
    secao("Por cidade e vara");
    tabela([{ t: "Cidade / vara", w: 60 }, { t: "Processos", w: 14, dir: true }, { t: "% do total", w: 14, dir: true }],
      r.porCidade.flatMap((c) => [{ v: [c.nome, String(c.n), pct(c.n, r.total)], negrito: true }, ...(c.detalhe || []).map((v) => ({ v: [v.nome, String(v.n), pct(v.n, r.total)], recuo: true }))]));
    secao("Ranking das varas", 60);
    const maxV = Math.max(...r.porVara.map((v) => v.n));
    tabela([{ t: "Vara / órgão", w: 46 }, { t: "Processos", w: 12, dir: true }, { t: "", w: 30 }, { t: "%", w: 12, dir: true }],
      r.porVara.map((v) => ({ v: [v.nome, String(v.n), "", pct(v.n, r.total)], barra: v.n / maxV })));
    if (r.aprox || r.soAno || r.semData) {
      precisa(40); y -= 2;
      if (r.aprox) nota(`* ${r.aprox} processo(s) com data aproximada: a 1ª publicação no DJEN (sem tarefa de protocolo nem lista de distribuição).`);
      if (r.soAno) nota(`${r.soAno} processo(s) só com o ano do nº CNJ: entram nos filtros de ano, mas não aparecem na tabela por mês.`);
      if (r.semData) nota(`${r.semData} processo(s) sem data de protocolo identificada.`);
    }
    if (o.anexo) {
      cabecalho(); txt(`PROCESSOS DO RELATÓRIO (${r.total})`, M, y, 11, fb, ouro); y -= 18;
      const ls = [...r.linhas].sort((a, b) => a.cidade.localeCompare(b.cidade) || a.vara.localeCompare(b.vara) || (a.protocolo?.data || "").localeCompare(b.protocolo?.data || ""));
      tabela([{ t: "Protocolo", w: 10 }, { t: "Cliente", w: 22 }, { t: "Processo", w: 25 }, { t: "Cidade", w: 11 }, { t: "Vara / órgão", w: 25 }, { t: "Réu", w: 7 }],
        ls.map((l) => ({ v: [l.protocolo ? (l.protocolo.precisao === "ano" ? l.protocolo.data.slice(0, 4) : dataBR(l.protocolo.data) + (l.protocolo.precisao === "aprox" ? "*" : "")) : "-", l.cliente, l.mascara, l.cidade, l.vara, l.banco] })));
    }
  }
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 4 }, end: { x: W - M, y: M + 4 }, thickness: 0.5, color: linha });
    p.drawText(limpa("Passos Advocacia · Relatório de protocolos · " + o.titulo), { x: M, y: M - 8, size: 7, font: f, color: cinza });
    const s = `página ${i + 1} de ${paginas.length}`; p.drawText(s, { x: W - M - f.widthOfTextAtSize(s, 7), y: M - 8, size: 7, font: f, color: cinza });
  });
  return doc.save();
}
