"use client";
// PDF do relatório "Enviadas por": resumo (mensagens, clientes, dias, média por dia útil), tabela por dia e a lista
// das mensagens enviadas, dia a dia, com hora, cliente e texto.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { paraPng } from "./relatorioPdf";
import { horaBR, diaBR, type MsgEnviada, type ResumoEnviadas } from "./enviadas";

const limpa = (s: string) => String(s ?? "").replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/\r/g, "").replace(/[^\n\x20-\x7E\xA0-\xFF§º°ª•]/g, "");
const dataBR = (d: string) => d.split("-").reverse().join("/");
const SEMANA = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const semana = (d: string) => SEMANA[new Date(d + "T12:00:00Z").getUTCDay()];
const ROT: Record<string, string> = { imagem: "[foto]", audio: "[áudio]", video: "[vídeo]", documento: "[documento]", figurinha: "[figurinha]" };

export async function pdfEnviadas(o: { pessoa: string; periodo: string; de: string; ate: string; r: ResumoEnviadas; msgs: MsgEnviada[]; nomeConversa: (id: string) => string; emitidoPor: string }): Promise<Uint8Array> {
  const { r } = o;
  const doc = await PDFDocument.create(); doc.setTitle("Mensagens enviadas - " + o.pessoa); doc.setAuthor("Passos Advocacia");
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  const ouro = rgb(0.6, 0.47, 0.2), ouroClaro = rgb(0.96, 0.93, 0.86), cinza = rgb(0.4, 0.4, 0.4), linha = rgb(0.86, 0.84, 0.79), preto = rgb(0.1, 0.1, 0.1), azul = rgb(0.25, 0.42, 0.62);
  const logoPng = await paraPng("/marca/fp.png", false); const logo: PDFImage | null = logoPng ? await doc.embedPng(logoPng) : null;
  let pg!: PDFPage; let y = 0; const paginas: PDFPage[] = [];
  const txt = (s: string, x: number, yy: number, tam = 9, fn: PDFFont = f, cor = preto) => pg.drawText(limpa(s).replace(/\n/g, " "), { x, y: yy, size: tam, font: fn, color: cor });
  const larg = (s: string, tam: number, fn: PDFFont = f) => fn.widthOfTextAtSize(limpa(s).replace(/\n/g, " "), tam);
  const dir = (s: string, xr: number, yy: number, tam = 9, fn: PDFFont = f, cor = preto) => txt(s, xr - larg(s, tam, fn), yy, tam, fn, cor);
  const corta = (s: string, max: number, tam: number, fn: PDFFont = f) => { let t = limpa(s).replace(/\n/g, " "); if (larg(t, tam, fn) <= max) return t; while (t.length > 1 && larg(t + "...", tam, fn) > max) t = t.slice(0, -1); return t + "..."; };
  const quebra = (s: string, max: number, tam: number) => {
    const out: string[] = [];
    for (const par of limpa(s).split("\n")) { let l = ""; for (const p of par.split(/\s+/).filter(Boolean)) { const t = l ? l + " " + p : p; if (larg(t, tam) > max && l) { out.push(l); l = p; } else l = t; } out.push(l); }
    return out.filter((x, i, a) => x || (i > 0 && a[i - 1]));
  };
  const cabecalho = () => {
    pg = doc.addPage([W, H]); paginas.push(pg); y = H - M;
    if (logo) { const h = 30, w = (logo.width / logo.height) * h; pg.drawImage(logo, { x: M, y: y - h + 6, width: w, height: h }); }
    const xl = M + (logo ? 44 : 0);
    txt("PASSOS ADVOCACIA", xl, y - 6, 13, fb, ouro);
    txt("Felipe dos Passos Silva · OAB/SC 58.547 · Joinville/SC", xl, y - 18, 7.5, f, cinza);
    dir("Emitido em " + new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às"), W - M, y - 6, 8, f, cinza);
    dir("por " + o.emitidoPor, W - M, y - 18, 8, f, cinza);
    y -= 30; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: ouro }); y -= 20;
  };
  const precisa = (h: number) => { if (y - h < M + 24) cabecalho(); };
  const secao = (s: string, min = 60) => { precisa(min); y -= 6; txt(s.toUpperCase(), M, y, 10, fb, ouro); y -= 6; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: linha }); y -= 14; };
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

  cabecalho();
  txt("Mensagens enviadas pelo WhatsApp do escritório", M, y, 16, fb, preto); y -= 17;
  txt(o.pessoa, M, y, 11, fb, ouro); y -= 13;
  txt(`${o.periodo}: ${dataBR(o.de)} a ${dataBR(o.ate)}`, M, y, 8.5, f, cinza); y -= 16;
  tiles([
    { rot: "Mensagens enviadas", v: String(r.total), sub: r.anexos ? `${r.anexos} com arquivo` : undefined },
    { rot: "Clientes / conversas", v: String(r.conversas) },
    { rot: "Dias com envio", v: String(r.diasComEnvio), sub: `de ${r.diasUteis} dia(s) útil(eis) no período` },
    { rot: "Média por dia útil", v: r.mediaDiaUtil.toLocaleString("pt-BR"), sub: "mensagens" },
  ]);
  if (r.peloAssistente) { txt(`${r.peloAssistente} mensagem(ns) enviada(s) pelo assistente virtual a pedido dela(e).`, M, y, 7.5, f, cinza); y -= 12; }

  if (!r.total) { txt("Nenhuma mensagem enviada no período.", M, y, 10, f, cinza); y -= 14; }
  else {
    // por dia
    secao("Por dia", 40 + Math.min(r.dias.length, 10) * 13);
    const cols = [{ t: "Dia", w: 150 }, { t: "Mensagens", w: 70 }, { t: "Clientes", w: 60 }, { t: "Primeira", w: 60 }, { t: "Última", w: 60 }];
    const cab = () => { precisa(34); pg.drawRectangle({ x: M, y: y - 16, width: W - 2 * M, height: 18, color: ouroClaro }); let x = M; for (const c of cols) { txt(c.t, x + 5, y - 11, 7.5, fb, ouro); x += c.w; } y -= 20; };
    cab(); const max = Math.max(...r.dias.map((d) => d.n));
    for (const d of r.dias) {
      if (y - 15 < M + 24) { cabecalho(); cab(); }
      let x = M;
      [`${dataBR(d.dia)} (${semana(d.dia)})`, String(d.n), String(d.conversas), d.primeira, d.ultima].forEach((v, i) => { txt(v, x + 5, y - 9, 8, i === 1 ? fb : f); x += cols[i].w; });
      pg.drawRectangle({ x: x + 5, y: y - 10, width: Math.max(1, (W - M - x - 10) * (d.n / max)), height: 7, color: azul, opacity: 0.5 });
      y -= 13; pg.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.3, color: linha });
    }
    y -= 8;
    // clientes com mais mensagens
    secao("Clientes com mais mensagens", 50);
    for (const c of r.porConversa.slice(0, 15)) { precisa(13); txt(corta(o.nomeConversa(c.conversa_id), 400, 8.5), M + 5, y, 8.5); dir(String(c.n), W - M - 5, y, 8.5, fb); y -= 12; }
    if (r.porConversa.length > 15) { txt(`… e mais ${r.porConversa.length - 15} cliente(s).`, M + 5, y, 7.5, f, cinza); y -= 12; }
    // mensagens
    cabecalho(); txt(`MENSAGENS ENVIADAS (${r.total})`, M, y, 11, fb, ouro); y -= 16;
    let diaAtual = "";
    for (const m of [...o.msgs].sort((a, b) => b.em.localeCompare(a.em))) {
      const d = diaBR(m.em);
      if (d !== diaAtual) { diaAtual = d; precisa(40); y -= 4; pg.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 16, color: ouroClaro }); txt(`${dataBR(d)} · ${semana(d)} · ${r.dias.find((x) => x.dia === d)?.n || 0} mensagem(ns)`, M + 6, y, 8.5, fb, ouro); y -= 18; }
      const corpo = (m.tipo !== "texto" ? (m.anexo_nome ? "[arquivo: " + m.anexo_nome + "]" : ROT[m.tipo] || "[" + m.tipo + "]") + (m.texto ? " " : "") : "") + (m.texto || "");
      const ls = quebra(corpo.length > 1200 ? corpo.slice(0, 1200) + " [...]" : corpo, W - 2 * M - 70, 8);
      precisa(14 + Math.min(ls.length, 4) * 10);
      txt(horaBR(m.em), M + 4, y, 8, fb, cinza); txt(corta(o.nomeConversa(m.conversa_id) + (m.agente ? " (assistente)" : ""), W - 2 * M - 70, 8.5, fb), M + 62, y, 8.5, fb); y -= 11;
      for (const l of ls) { precisa(11); txt(l, M + 62, y, 8, f, preto); y -= 10; }
      y -= 1; pg.drawLine({ start: { x: M + 62, y }, end: { x: W - M, y }, thickness: 0.25, color: linha }); y -= 11;
    }
  }
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 4 }, end: { x: W - M, y: M + 4 }, thickness: 0.5, color: linha });
    p.drawText(limpa(`Passos Advocacia · Mensagens enviadas por ${o.pessoa} · ${dataBR(o.de)} a ${dataBR(o.ate)}`), { x: M, y: M - 8, size: 7, font: f, color: cinza });
    const s = `página ${i + 1} de ${paginas.length}`; p.drawText(s, { x: W - M - f.widthOfTextAtSize(s, 7), y: M - 8, size: 7, font: f, color: cinza });
  });
  return doc.save();
}
