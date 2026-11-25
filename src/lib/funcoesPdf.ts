// PDF do roteiro de funções da equipe, no papel do escritório.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { lerFuncoes, type Funcoes } from "./funcoes";

const limpa = (s: string) => String(s ?? "").replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF§º°ª•]/g, "");

export async function pdfFuncoes(f: Funcoes, logoPng?: Uint8Array | null): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); doc.setTitle(f.titulo); doc.setAuthor("Passos Advocacia");
  const fn = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 50;
  const ouro = rgb(0.6, 0.47, 0.2), ouroClaro = rgb(0.96, 0.93, 0.86), cinza = rgb(0.4, 0.4, 0.4), linha = rgb(0.86, 0.84, 0.79), preto = rgb(0.1, 0.1, 0.1);
  const logo: PDFImage | null = logoPng ? await doc.embedPng(logoPng).catch(() => null) : null;
  let pg!: PDFPage; let y = 0; const paginas: PDFPage[] = [];
  const larg = (s: string, t: number, f2: PDFFont) => f2.widthOfTextAtSize(limpa(s), t);
  const txt = (s: string, x: number, yy: number, t: number, f2: PDFFont = fn, cor = preto) => pg.drawText(limpa(s), { x, y: yy, size: t, font: f2, color: cor });
  const quebra = (s: string, max: number, t: number, f2: PDFFont) => { const out: string[] = []; let l = ""; for (const p of limpa(s).split(/\s+/)) { const c = l ? l + " " + p : p; if (larg(c, t, f2) > max && l) { out.push(l); l = p; } else l = c; } if (l) out.push(l); return out; };
  const pagina = () => {
    pg = doc.addPage([W, H]); paginas.push(pg); y = H - M;
    if (logo) { const h = 32, w = (logo.width / logo.height) * h; pg.drawImage(logo, { x: M, y: y - h + 6, width: w, height: h }); }
    const xl = M + (logo ? 46 : 0);
    txt("PASSOS ADVOCACIA", xl, y - 6, 13, fb, ouro);
    txt("Felipe dos Passos Silva · OAB/SC 58.547 · Rua Dona Francisca, 260, sala 1804, Centro, Joinville/SC", xl, y - 18, 7.5, fn, cinza);
    y -= 32; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: ouro }); y -= 26;
  };
  const precisa = (h: number) => { if (y - h < M + 30) pagina(); };
  pagina();
  for (const l of quebra(f.titulo, W - 2 * M, 16, fb)) { txt(l, M, y, 16, fb); y -= 20; }
  if (f.atualizado_em) { txt("Atualizado em " + new Date(f.atualizado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }), M, y, 8.5, fn, cinza); y -= 14; }
  y -= 4;
  for (const b of lerFuncoes(f.texto)) {
    if (b.texto) { precisa(44); y -= 6; txt(b.texto.toUpperCase(), M, y, 10.5, fb, ouro); y -= 6; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: linha }); y -= 15; }
    for (const it of b.itens) {
      if (it.tipo === "destaque") {
        const ls = quebra(it.texto, W - 2 * M - 24, 10, fb); const h = ls.length * 14 + 14; precisa(h + 6);
        pg.drawRectangle({ x: M, y: y - h + 10, width: W - 2 * M, height: h, color: ouroClaro }); pg.drawRectangle({ x: M, y: y - h + 10, width: 3, height: h, color: ouro });
        let yy = y - 4; for (const l of ls) { txt(l, M + 14, yy, 10, fb); yy -= 14; } y -= h + 6; continue;
      }
      const recuo = it.tipo === "item" ? 16 : 0; const ls = quebra(it.texto, W - 2 * M - recuo, 10, fn);
      precisa(ls.length * 14 + 2);
      if (it.tipo === "item") pg.drawRectangle({ x: M + 4, y: y + 2.5, width: 4, height: 4, color: ouro });
      for (const l of ls) { txt(l, M + recuo, y, 10, fn); y -= 14; }
      y -= 3;
    }
    y -= 4;
  }
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 4 }, end: { x: W - M, y: M + 4 }, thickness: 0.5, color: linha });
    p.drawText(limpa("Passos Advocacia · " + f.titulo), { x: M, y: M - 8, size: 7, font: fn, color: cinza });
    const s = `página ${i + 1} de ${paginas.length}`; p.drawText(s, { x: W - M - fn.widthOfTextAtSize(s, 7), y: M - 8, size: 7, font: fn, color: cinza });
  });
  return doc.save();
}
