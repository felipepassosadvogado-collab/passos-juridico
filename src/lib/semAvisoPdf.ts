"use client";
// Relatório "Clientes sem aviso" (aba Processos): processos cujo cliente não recebeu nenhum aviso enviado,
// para cobrar a equipe. Mostra os que não têm aviso nenhum e os que têm aviso criado e não enviado.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

export type LinhaSemAviso = { cliente: string; telefone: string; processo: string; reu: string; fase: string; data: string; rotData: string; situacao: "nenhum" | "pendente"; pendente?: string };

const limpa = (s: string) => String(s ?? "").replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF§º°ª•]/g, "");

export async function pdfSemAviso(ls: LinhaSemAviso[], o: { filtros: string[]; emitidoPor: string; logoPng?: Uint8Array | null }): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); doc.setTitle("Clientes sem aviso"); doc.setAuthor("Passos Advocacia");
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 841.89, H = 595.28, M = 36; // paisagem: cabe a tabela
  const ouro = rgb(0.6, 0.47, 0.2), ouroClaro = rgb(0.96, 0.93, 0.86), cinza = rgb(0.4, 0.4, 0.4), linha = rgb(0.86, 0.84, 0.79), preto = rgb(0.1, 0.1, 0.1), verm = rgb(0.7, 0.2, 0.15), amar = rgb(0.62, 0.45, 0.05);
  const logo: PDFImage | null = o.logoPng ? await doc.embedPng(o.logoPng).catch(() => null) : null;
  let pg!: PDFPage; let y = 0; const paginas: PDFPage[] = [];
  const larg = (s: string, t: number, fn: PDFFont = f) => fn.widthOfTextAtSize(limpa(s), t);
  const txt = (s: string, x: number, yy: number, t = 8.5, fn: PDFFont = f, cor = preto) => pg.drawText(limpa(s), { x, y: yy, size: t, font: fn, color: cor });
  const corta = (s: string, max: number, t: number, fn: PDFFont = f) => { let x = limpa(s); if (larg(x, t, fn) <= max) return x; while (x.length > 1 && larg(x + "...", t, fn) > max) x = x.slice(0, -1); return x + "..."; };
  const cols = [{ t: "Cliente", w: 170 }, { t: "Telefone", w: 88 }, { t: "Processo", w: 135 }, { t: "Réu", w: 80 }, { t: "Fase", w: 110 }, { t: "Data", w: 70 }, { t: "Situação", w: 117 }];
  const cab = () => { pg.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 18, color: ouroClaro }); let x = M; for (const c of cols) { txt(c.t, x + 5, y - 11, 7.5, fb, ouro); x += c.w; } y -= 20; };
  const pagina = () => {
    pg = doc.addPage([W, H]); paginas.push(pg); y = H - M;
    if (logo) { const h = 28, w = (logo.width / logo.height) * h; pg.drawImage(logo, { x: M, y: y - h + 6, width: w, height: h }); }
    const xl = M + (logo ? 40 : 0);
    txt("PASSOS ADVOCACIA", xl, y - 6, 12, fb, ouro); txt("Felipe dos Passos Silva · OAB/SC 58.547 · Joinville/SC", xl, y - 17, 7.5, f, cinza);
    const em = "Emitido em " + new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às") + " por " + o.emitidoPor;
    txt(em, W - M - larg(em, 7.5), y - 6, 7.5, f, cinza);
    y -= 28; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.1, color: ouro }); y -= 18;
  };
  pagina();
  txt("Clientes sem aviso", M, y, 16, fb); y -= 15;
  txt("Processos em que o cliente ainda não recebeu nenhum aviso enviado pelo sistema. Avisar pelo botão de aviso (sino) na aba Processos.", M, y, 8.5, f, cinza); y -= 12;
  for (const fl of o.filtros) { txt(fl, M, y, 8, f, cinza); y -= 11; }
  y -= 4;
  const nenhum = ls.filter((l) => l.situacao === "nenhum").length;
  const tiles = [["Sem aviso enviado", String(ls.length)], ["Nenhum aviso criado", String(nenhum)], ["Aviso criado e não enviado", String(ls.length - nenhum)]];
  const tw = 170; tiles.forEach(([r, v], i) => { const x = M + i * (tw + 8); pg.drawRectangle({ x, y: y - 44, width: tw, height: 44, borderColor: linha, borderWidth: 0.7 }); pg.drawRectangle({ x, y: y - 44, width: 3, height: 44, color: i === 1 ? verm : i === 2 ? amar : ouro }); txt(r, x + 10, y - 13, 8, f, cinza); txt(v, x + 10, y - 34, 17, fb); });
  y -= 56;
  if (!ls.length) { txt("Todos os clientes destes processos já foram avisados.", M, y, 10, f, cinza); }
  else {
    cab();
    for (const l of ls) {
      if (y - 14 < M + 20) { pagina(); cab(); }
      let x = M; const vals = [l.cliente, l.telefone || "sem telefone", l.processo, l.reu, l.fase || "-", l.data ? l.rotData : "-", l.situacao === "nenhum" ? "Nenhum aviso" : "Não enviado" + (l.pendente ? " (" + l.pendente + ")" : "")];
      vals.forEach((v, i) => { const cor = i === 6 ? (l.situacao === "nenhum" ? verm : amar) : i === 1 && !l.telefone ? cinza : preto; txt(corta(v, cols[i].w - 10, 8, i === 0 || i === 6 ? fb : f), x + 5, y - 9, 8, i === 0 || i === 6 ? fb : f, cor); x += cols[i].w; });
      y -= 14; pg.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.3, color: linha });
    }
  }
  paginas.forEach((p, i) => {
    const s = `Passos Advocacia · Clientes sem aviso · página ${i + 1} de ${paginas.length}`;
    p.drawText(limpa(s), { x: M, y: M - 16, size: 7, font: f, color: cinza });
  });
  return doc.save();
}
