"use client";
// Relatório de produtividade da Gestão em PDF, no papel do escritório (pdf-lib, no navegador).
import { FAIXAS, type Produtividade } from "./produtividade";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";

const limpa = (s: string) => String(s ?? "").replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF§º°ª•]/g, "");

export type LinhaTarefa = { cliente: string; tarefa: string; prazo: string; conclusao: string; situacao: string; atraso: boolean; responsavel?: string };
export type DadosRelatorio = {
  periodo: string; emitidoPor: string;
  pessoa: { nome: string; funcao?: string; foto?: string | null } | null; // null = toda a equipe
  hoje: { rot: string; n: number }; mes: { rot: string; n: number };
  conc: number; emDia: number; emAtraso: number; pend: number; atrasadas: number; taxa: number | null;
  mediaCumpr: string; mediaAtraso: string;
  acessos?: { dias: number; tempo: string; entradaMedia: string; saidaMedia: string } | null;
  serie: { rot: string; n: number; venc: number }[]; serieTitulo: string;
  porTipo: { tipo: string; conc: number; atraso: number }[];
  porPessoa: { nome: string; emDia: number; emAtraso: number; pend: number; atrasadas: number; taxa: number | null }[];
  concluidas: LinhaTarefa[]; atrasadasLista: LinhaTarefa[];
  prod?: Produtividade | null;
};

/** imagem (qualquer formato) → PNG, recortada em círculo quando pedido */
export async function paraPng(url: string, circulo: boolean, lado = 240): Promise<Uint8Array | null> {
  try {
    const blob = await (await fetch(url, { cache: "force-cache" })).blob();
    const bmp = await createImageBitmap(blob);
    const cv = document.createElement("canvas");
    const w = circulo ? lado : bmp.width, h = circulo ? lado : bmp.height; cv.width = w; cv.height = h;
    const g = cv.getContext("2d")!;
    if (circulo) {
      g.beginPath(); g.arc(lado / 2, lado / 2, lado / 2, 0, Math.PI * 2); g.closePath(); g.clip();
      const s = Math.max(lado / bmp.width, lado / bmp.height); const dw = bmp.width * s, dh = bmp.height * s;
      g.drawImage(bmp, (lado - dw) / 2, (lado - dh) / 2, dw, dh);
    } else g.drawImage(bmp, 0, 0);
    const b64 = cv.toDataURL("image/png").split(",")[1]; const bin = atob(b64); const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  } catch { return null; }
}

export async function pdfRelatorio(d: DadosRelatorio): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); doc.setTitle("Relatório de produtividade - " + limpa(d.pessoa?.nome || "equipe")); doc.setAuthor("Passos Advocacia");
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  const ouro = rgb(0.6, 0.47, 0.2), ouroClaro = rgb(0.96, 0.93, 0.86), cinza = rgb(0.4, 0.4, 0.4), linha = rgb(0.86, 0.84, 0.79), preto = rgb(0.1, 0.1, 0.1);
  const verde = rgb(0.2, 0.55, 0.33), vermelho = rgb(0.75, 0.25, 0.2), laranja = rgb(0.85, 0.55, 0.15), azul = rgb(0.6, 0.47, 0.2);
  const [logoPng, fotoPng] = await Promise.all([paraPng("/marca/fp.png", false), d.pessoa?.foto ? paraPng(d.pessoa.foto, true) : Promise.resolve(null)]);
  const logo: PDFImage | null = logoPng ? await doc.embedPng(logoPng) : null; const foto: PDFImage | null = fotoPng ? await doc.embedPng(fotoPng) : null;

  let pg!: PDFPage; let y = 0; const paginas: PDFPage[] = [];
  const txt = (s: string, x: number, yy: number, tam = 9, fn: PDFFont = f, cor = preto) => pg.drawText(limpa(s), { x, y: yy, size: tam, font: fn, color: cor });
  const larg = (s: string, tam: number, fn: PDFFont = f) => fn.widthOfTextAtSize(limpa(s), tam);
  const dir = (s: string, xr: number, yy: number, tam = 9, fn: PDFFont = f, cor = preto) => txt(s, xr - larg(s, tam, fn), yy, tam, fn, cor);
  const meio = (s: string, xc: number, yy: number, tam = 9, fn: PDFFont = f, cor = preto) => txt(s, xc - larg(s, tam, fn) / 2, yy, tam, fn, cor);
  const corta = (s: string, max: number, tam: number, fn: PDFFont = f) => { let t = limpa(s); if (larg(t, tam, fn) <= max) return t; while (t.length > 1 && larg(t + "...", tam, fn) > max) t = t.slice(0, -1); return t + "..."; };
  const cabecalho = () => {
    pg = doc.addPage([W, H]); paginas.push(pg); y = H - M;
    if (logo) { const h = 30, w = (logo.width / logo.height) * h; pg.drawImage(logo, { x: M, y: y - h + 6, width: w, height: h }); }
    const xl = M + (logo ? 44 : 0);
    txt("PASSOS ADVOCACIA", xl, y - 6, 13, fb, ouro);
    txt("Felipe dos Passos Silva · OAB/SC 58.547 · Rua Dona Francisca, 260, sala 1804, Centro, Joinville/SC", xl, y - 18, 7.5, f, cinza);
    dir("Emitido em " + new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).replace(",", " às"), W - M, y - 6, 8, f, cinza);
    dir("por " + d.emitidoPor, W - M, y - 18, 8, f, cinza);
    y -= 30; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: ouro }); y -= 20;
  };
  const precisa = (h: number) => { if (y - h < M + 24) cabecalho(); };
  const secao = (s: string) => { precisa(80); y -= 6; txt(s.toUpperCase(), M, y, 10, fb, ouro); y -= 6; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: linha }); y -= 14; };

  // ───── capa: pessoa e período ─────
  cabecalho();
  txt("RELATÓRIO DE PRODUTIVIDADE", M, y, 15, fb); y -= 26;
  const cartaoH = 74; pg.drawRectangle({ x: M, y: y - cartaoH, width: W - 2 * M, height: cartaoH, color: ouroClaro, borderColor: linha, borderWidth: 0.6 });
  const cx = M + 14, cy = y - cartaoH / 2, r = 26;
  if (foto) pg.drawImage(foto, { x: cx, y: cy - r, width: r * 2, height: r * 2 });
  else { pg.drawCircle({ x: cx + r, y: cy, size: r, color: rgb(0.85, 0.78, 0.62) }); const ini = (d.pessoa?.nome || "Equipe").split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("").toUpperCase(); meio(ini, cx + r, cy - 6, 16, fb, rgb(1, 1, 1)); }
  pg.drawCircle({ x: cx + r, y: cy, size: r, borderColor: ouro, borderWidth: 1.2 });
  const tx = cx + r * 2 + 14;
  txt(d.pessoa ? d.pessoa.nome : "Toda a equipe", tx, cy + 10, 14, fb);
  txt(d.pessoa?.funcao || (d.pessoa ? "Colaborador(a)" : "Todos os colaboradores do escritório"), tx, cy - 4, 9, f, cinza);
  txt("Período: " + d.periodo, tx, cy - 18, 9, fb, ouro);
  y -= cartaoH + 18;

  // ───── números ─────
  const tiles = (itens: { rot: string; v: string; sub?: string; cor?: ReturnType<typeof rgb> }[], h = 58) => {
    precisa(h + 10); const gap = 8, w = (W - 2 * M - gap * (itens.length - 1)) / itens.length;
    itens.forEach((it, i) => {
      const x = M + i * (w + gap);
      pg.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: linha, borderWidth: 0.7, color: rgb(1, 1, 1) });
      pg.drawRectangle({ x, y: y - h, width: 3, height: h, color: it.cor || ouro });
      txt(corta(it.rot, w - 16, 8), x + 10, y - 14, 8, f, cinza);
      let tv = 20; while (tv > 10 && larg(it.v, tv, fb) > w - 16) tv -= 1;
      txt(it.v, x + 10, y - 36, tv, fb, it.cor || preto);
      if (it.sub) txt(corta(it.sub, w - 16, 7), x + 10, y - 49, 7, f, cinza);
    });
    y -= h + 10;
  };
  secao("Tarefas concluídas");
  tiles([
    { rot: "Hoje · " + d.hoje.rot, v: String(d.hoje.n), sub: "tarefas concluídas no dia", cor: verde },
    { rot: "No mês · " + d.mes.rot, v: String(d.mes.n), sub: "tarefas concluídas no mês", cor: verde },
    { rot: "No período", v: String(d.conc), sub: d.periodo },
    { rot: "Cumpridas no prazo", v: d.taxa == null ? "-" : d.taxa + "%", sub: "das que venceram no período", cor: d.taxa == null ? cinza : d.taxa >= 90 ? verde : d.taxa >= 70 ? laranja : vermelho },
  ]);
  secao("Situação no período");
  tiles([
    { rot: "Concluídas em dia", v: String(d.emDia), cor: verde },
    { rot: "Concluídas em atraso", v: String(d.emAtraso), cor: laranja },
    { rot: "Pendentes no prazo", v: String(d.pend), cor: azul },
    { rot: "Atrasadas (não cumpridas)", v: String(d.atrasadas), cor: vermelho },
  ], 50);
  tiles([
    { rot: "Média de cumprimento", v: d.mediaCumpr, sub: "da criação à conclusão" },
    { rot: "Média de atraso", v: d.mediaAtraso, sub: "nas concluídas fora do prazo", cor: laranja },
    ...(d.acessos ? [{ rot: "Dias com acesso ao sistema", v: String(d.acessos.dias), sub: "tempo ativo: " + d.acessos.tempo }, { rot: "Entrada / saída média", v: d.acessos.entradaMedia, sub: "saída provável: " + d.acessos.saidaMedia }] : []),
  ], 54);

  // ───── gráfico ─────
  if (d.serie.length > 1) {
    secao(d.serieTitulo); const gh = 120; precisa(gh + 30);
    const max = Math.max(1, ...d.serie.map((s) => Math.max(s.n, s.venc))); const x0 = M + 22, larguraG = W - M - x0; const bw = larguraG / d.serie.length;
    const yb = y - gh; const esc = (v: number) => (v / max) * (gh - 14);
    const passo = max <= 5 ? 1 : Math.ceil(max / 4);
    for (let v = 0; v <= max; v += passo) { const yy = yb + esc(v); pg.drawLine({ start: { x: x0, y: yy }, end: { x: W - M, y: yy }, thickness: 0.4, color: linha }); dir(String(v), x0 - 4, yy - 3, 7, f, cinza); }
    d.serie.forEach((s, i) => {
      const w = Math.max(2, (bw * 0.72 - 1) / 2); const x = x0 + i * bw + bw * 0.14;
      if (s.n) { pg.drawRectangle({ x, y: yb, width: w, height: esc(s.n), color: verde }); if (bw > 14) meio(String(s.n), x + w / 2, yb + esc(s.n) + 2, 6, fb, verde); }
      if (s.venc) pg.drawRectangle({ x: x + w + 1, y: yb, width: w, height: esc(s.venc), color: vermelho });
      if (s.rot && (d.serie.length <= 16 || i % 2 === 0)) meio(s.rot, x0 + i * bw + bw / 2, yb - 10, 6.5, f, cinza);
    });
    y = yb - 22;
    pg.drawRectangle({ x: M, y: y + 1, width: 8, height: 8, color: verde }); txt("concluídas", M + 12, y + 2, 8, f, cinza);
    pg.drawRectangle({ x: M + 72, y: y + 1, width: 8, height: 8, color: vermelho }); txt("vencidas sem cumprir", M + 84, y + 2, 8, f, cinza); y -= 18;
  }

  // ───── tabelas ─────
  const tabela = (cols: { t: string; w: number; dir?: boolean }[], linhas: string[][], destaque?: (i: number) => ReturnType<typeof rgb> | null) => {
    const tw = W - 2 * M; const soma = cols.reduce((s, c) => s + c.w, 0); const ws = cols.map((c) => (c.w / soma) * tw);
    const cab = () => { precisa(34); pg.drawRectangle({ x: M, y: y - 16, width: tw, height: 18, color: ouroClaro }); let x = M; cols.forEach((c, i) => { if (c.dir) dir(c.t, x + ws[i] - 5, y - 11, 7.5, fb, ouro); else txt(c.t, x + 5, y - 11, 7.5, fb, ouro); x += ws[i]; }); y -= 20; };
    cab();
    linhas.forEach((l, li) => {
      if (y - 15 < M + 24) { cabecalho(); cab(); }
      const cor = destaque?.(li) || preto; let x = M;
      l.forEach((v, i) => { const t = corta(v, ws[i] - 10, 8); if (cols[i].dir) dir(t, x + ws[i] - 5, y - 9, 8, f, i === l.length - 1 ? cor : preto); else txt(t, x + 5, y - 9, 8, f, i === l.length - 1 ? cor : preto); x += ws[i]; });
      y -= 13; pg.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.3, color: linha });
    });
    y -= 10;
  };
  // ───── produtividade estimada (só no relatório individual) ─────
  if (d.prod && d.pessoa) {
    const pr = d.prod; const hm = (m: number) => { const x = Math.round(m); return x < 60 ? x + " min" : Math.floor(x / 60) + "h" + String(x % 60).padStart(2, "0"); };
    const corNota = pr.nota === "Ótima" ? verde : pr.nota === "Boa" ? ouro : pr.nota === "Regular" ? laranja : vermelho;
    precisa(190);
    secao(`Produtividade estimada · jornada de ${hm(pr.jornadaMin)} por dia`);
    tiles([
      { rot: "Tempo produtivo por dia", v: hm(pr.mediaMin), sub: `média de ${pr.diasTrabalhados} dia(s) trabalhado(s)` },
      { rot: "Aproveitamento da jornada", v: Math.round(pr.aproveitamento * 100) + "%", sub: pr.nota.toUpperCase(), cor: corNota },
      { rot: "Sistema aberto por dia", v: pr.mediaSistemaMin == null ? "-" : hm(pr.mediaSistemaMin), sub: "aba do sistema visível" },
      { rot: "Ritmo por tarefa", v: pr.minPorTarefa == null ? "-" : hm(pr.minPorTarefa), sub: pr.emLote ? `${pr.emLote} fechadas em sequência rápida` : "tempo real médio por tarefa" },
    ], 58);
    // régua da jornada: faixas e a posição do colaborador
    y -= 10; precisa(46); const rx = M, rw = W - 2 * M, ry = y - 14, rh = 10;
    const faixas: [number, number, ReturnType<typeof rgb>, string][] = [[0, FAIXAS.regular, rgb(0.93, 0.8, 0.78), "abaixo do esperado"], [FAIXAS.regular, FAIXAS.boa, rgb(0.97, 0.88, 0.75), "regular"], [FAIXAS.boa, FAIXAS.otima, rgb(0.93, 0.89, 0.78), "boa"], [FAIXAS.otima, 1, rgb(0.8, 0.9, 0.82), "ótima"]];
    for (const [a, b, c, nm] of faixas) { pg.drawRectangle({ x: rx + a * rw, y: ry, width: (b - a) * rw, height: rh, color: c }); meio(nm, rx + ((a + b) / 2) * rw, ry - 10, 6.5, f, cinza); }
    const px = rx + pr.aproveitamento * rw; pg.drawRectangle({ x: rx, y: ry + 3, width: Math.max(1, px - rx), height: rh - 6, color: corNota });
    pg.drawCircle({ x: px, y: ry + rh / 2, size: 5, color: corNota, borderColor: rgb(1, 1, 1), borderWidth: 1.2 });
    txt("0h", rx, ry + rh + 4, 6.5, f, cinza); dir(hm(pr.jornadaMin), rx + rw, ry + rh + 4, 6.5, f, cinza);
    y = ry - 22;
    const expl = "Como é calculado: cada atividade concluída pela pessoa no sistema (tarefas, intimações tratadas e mensagens enviadas aos clientes) tem um tempo de referência, considerando o apoio do Claude na redação (ex.: réplica ou manifestação ao laudo 60 min, petição simples 20 min, contato com cliente 10 min, leitura de intimação 3 min). Vale o MENOR entre essa referência e o tempo real decorrido desde a atividade anterior do dia, para que baixas em lote ou tarefas fechadas em sequência não inflem o resultado. Atividades fora do sistema (telefone, atendimento presencial, organização de documentos) não entram: trate o número como um piso, não como medida exata. Régua realista para 8 horas: 6h ou mais de trabalho efetivo é ótima, de 4h30 a 6h é boa, de 2h45 a 4h30 é regular.";
    for (const l of (() => { const out: string[] = []; let ln = ""; for (const w0 of limpa(expl).split(/\s+/)) { const t = ln ? ln + " " + w0 : w0; if (larg(t, 7.5) > W - 2 * M && ln) { out.push(ln); ln = w0; } else ln = t; } if (ln) out.push(ln); return out; })()) { precisa(11); txt(l, M, y, 7.5, f, cinza); y -= 10; }
    y -= 8;
    if (pr.porCategoria.length) tabela([{ t: "Atividade", w: 46 }, { t: "Quantidade", w: 18, dir: true }, { t: "Tempo de referência", w: 18, dir: true }, { t: "Tempo considerado", w: 18, dir: true }],
      pr.porCategoria.map((c) => [c.nome, String(c.n), hm(c.refMin), hm(c.realMin)]));
    if (pr.dias.length > 1) tabela([{ t: "Dia", w: 16 }, { t: "Entrada", w: 10, dir: true }, { t: "Tarefas", w: 10, dir: true }, { t: "Intimações", w: 11, dir: true }, { t: "Mensagens", w: 11, dir: true }, { t: "Tempo produtivo", w: 15, dir: true }, { t: "Sistema aberto", w: 14, dir: true }, { t: "Jornada", w: 13, dir: true }],
      pr.dias.map((x) => [x.dia.split("-").reverse().join("/"), x.entrada ? new Date(x.entrada).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }) : "-", String(x.tarefas), String(x.publicacoes), String(x.mensagens), hm(x.minutos), x.sistemaMin == null ? "-" : hm(x.sistemaMin), Math.round(Math.min(1, x.minutos / pr.jornadaMin) * 100) + "%"]),
      (i) => { const a = pr.dias[i].minutos / pr.jornadaMin; return a >= FAIXAS.otima ? verde : a >= FAIXAS.boa ? ouro : a >= FAIXAS.regular ? laranja : vermelho; });
  }

  if (!d.pessoa && d.porPessoa.length) {
    secao("Por colaborador");
    tabela([{ t: "Colaborador", w: 34 }, { t: "Em dia", w: 12, dir: true }, { t: "Em atraso", w: 12, dir: true }, { t: "Pendentes", w: 12, dir: true }, { t: "Atrasadas", w: 12, dir: true }, { t: "No prazo", w: 12, dir: true }],
      d.porPessoa.map((p) => [p.nome, String(p.emDia), String(p.emAtraso), String(p.pend), String(p.atrasadas), p.taxa == null ? "-" : p.taxa + "%"]));
  }
  if (d.porTipo.length) {
    secao("Concluídas por tipo de tarefa");
    tabela([{ t: "Tipo de tarefa", w: 60 }, { t: "Concluídas", w: 20, dir: true }, { t: "Fora do prazo", w: 20, dir: true }], d.porTipo.map((t) => [t.tipo, String(t.conc), t.atraso ? String(t.atraso) : "-"]));
  }
  const colsT = [{ t: "Conclusão", w: 15 }, { t: "Cliente", w: 22 }, { t: "Tarefa", w: 33 }, { t: "Prazo", w: 11 }, { t: "Situação", w: 19 }];
  if (d.atrasadasLista.length) {
    secao(`Tarefas atrasadas, ainda não cumpridas (${d.atrasadasLista.length})`);
    tabela([{ t: "Prazo", w: 11 }, { t: "Cliente", w: 24 }, { t: "Tarefa", w: 33 }, ...(d.pessoa ? [] : [{ t: "Responsável", w: 13 }]), { t: "Situação", w: 19 }],
      d.atrasadasLista.map((t) => [t.prazo, t.cliente, t.tarefa, ...(d.pessoa ? [] : [t.responsavel || ""]), t.situacao]), () => vermelho);
  }
  if (d.concluidas.length) {
    secao(`Tarefas concluídas no período (${d.concluidas.length})`);
    tabela(colsT, d.concluidas.map((t) => [t.conclusao, t.cliente, t.tarefa + (d.pessoa || !t.responsavel ? "" : " · " + t.responsavel), t.prazo, t.situacao]), (i) => (d.concluidas[i].atraso ? laranja : verde));
  }

  // rodapé com a numeração
  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 4 }, end: { x: W - M, y: M + 4 }, thickness: 0.5, color: linha });
    p.drawText(limpa("Passos Advocacia · Relatório de produtividade · " + (d.pessoa?.nome || "Toda a equipe") + " · " + d.periodo), { x: M, y: M - 8, size: 7, font: f, color: cinza });
    const s = `página ${i + 1} de ${paginas.length}`; p.drawText(s, { x: W - M - f.widthOfTextAtSize(s, 7), y: M - 8, size: 7, font: f, color: cinza });
  });
  return doc.save();
}
