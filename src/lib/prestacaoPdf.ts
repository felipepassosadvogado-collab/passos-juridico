"use client";
// PDF da prestação de contas ao cliente, no papel do escritório: o que entrou no processo, como se chega ao proveito
// econômico, cada desconto explicado (honorários contratuais, despesas), a sucumbência à parte e o valor final.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { paraPng } from "./relatorioPdf";
import type { DadosPrestacao, ResultadoPrestacao } from "./prestacao";

const limpa = (s: string) => String(s ?? "").replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/[^\x20-\x7E\xA0-\xFF§º°ª•]/g, "");
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dataBR = (d: string) => d.split("-").reverse().join("/");

export async function pdfPrestacao(o: { dados: DadosPrestacao; r: ResultadoPrestacao; cliente: string; cpf: string; processo: string; orgao: string; reu: string; resumo: string }): Promise<Uint8Array> {
  const { dados, r } = o;
  const doc = await PDFDocument.create(); doc.setTitle("Prestação de contas - " + o.cliente); doc.setAuthor("Passos Advocacia");
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 50;
  const ouro = rgb(0.6, 0.47, 0.2), ouroClaro = rgb(0.96, 0.93, 0.86), cinza = rgb(0.4, 0.4, 0.4), linha = rgb(0.86, 0.84, 0.79), preto = rgb(0.1, 0.1, 0.1), verde = rgb(0.14, 0.5, 0.29), verm = rgb(0.7, 0.2, 0.15);
  const logoPng = await paraPng("/marca/fp.png", false); const logo: PDFImage | null = logoPng ? await doc.embedPng(logoPng) : null;
  let pg!: PDFPage; let y = 0;
  const txt = (s: string, x: number, yy: number, tam = 10, fn: PDFFont = f, cor = preto) => pg.drawText(limpa(s), { x, y: yy, size: tam, font: fn, color: cor });
  const larg = (s: string, tam: number, fn: PDFFont = f) => fn.widthOfTextAtSize(limpa(s), tam);
  const dir = (s: string, xr: number, yy: number, tam = 10, fn: PDFFont = f, cor = preto) => txt(s, xr - larg(s, tam, fn), yy, tam, fn, cor);
  const pagina = () => {
    pg = doc.addPage([W, H]); y = H - M;
    if (logo) { const h = 32, w = (logo.width / logo.height) * h; pg.drawImage(logo, { x: M, y: y - h + 6, width: w, height: h }); }
    const xl = M + (logo ? 46 : 0);
    txt("PASSOS ADVOCACIA", xl, y - 6, 13, fb, ouro);
    txt("Felipe dos Passos Silva · OAB/SC 58.547 · Rua Dona Francisca, 260, sala 1804, Centro, Joinville/SC · (47) 99642-4673", xl, y - 18, 7.5, f, cinza);
    y -= 32; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1.2, color: ouro }); y -= 26;
  };
  const precisa = (h: number) => { if (y - h < M + 40) pagina(); };
  /** parágrafo com quebra de linha automática */
  const par = (s: string, tam = 10, fn: PDFFont = f, cor = preto, recuo = 0) => {
    const palavras = limpa(s).split(/\s+/); let l = ""; const max = W - 2 * M - recuo;
    for (const p of palavras) { const t = l ? l + " " + p : p; if (larg(t, tam, fn) > max) { precisa(tam + 4); txt(l, M + recuo, y, tam, fn, cor); y -= tam + 4; l = p; } else l = t; }
    if (l) { precisa(tam + 4); txt(l, M + recuo, y, tam, fn, cor); y -= tam + 4; }
  };
  const secao = (s: string) => { precisa(40); y -= 6; txt(s.toUpperCase(), M, y, 10.5, fb, ouro); y -= 6; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: linha }); y -= 15; };
  const item = (rot: string, valor: string, o2: { negrito?: boolean; cor?: ReturnType<typeof rgb>; recuo?: number } = {}) => {
    precisa(16); const fn = o2.negrito ? fb : f;
    const max = W - 2 * M - (o2.recuo || 0) - 110; let t = limpa(rot); while (larg(t, 10, fn) > max && t.length > 4) t = t.slice(0, -4) + "...";
    txt(t, M + (o2.recuo || 0), y, 10, fn, o2.cor || preto); dir(valor, W - M, y, 10, fn, o2.cor || preto); y -= 15;
  };
  const traco = () => { pg.drawLine({ start: { x: M + 250, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.5, color: linha }); };

  pagina();
  txt("PRESTAÇÃO DE CONTAS", M, y, 17, fb, preto); y -= 20;
  for (const [k, v] of [["Cliente", o.cliente + (o.cpf ? " · CPF " + o.cpf : "")], ["Processo", o.processo + (o.orgao ? " · " + o.orgao : "")], ["Parte contrária", o.reu], ["Data", new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })]]) {
    txt(k + ":", M, y, 9.5, fb, cinza); txt(v, M + 95, y, 9.5); y -= 13;
  }
  y -= 4;
  if (o.resumo.trim()) { secao("O processo"); par(o.resumo.trim()); }

  secao("1. Valores recebidos no processo");
  for (const c of dados.creditos.filter((x) => !x.sucumbencia)) item(c.descricao + (c.data ? " (" + dataBR(c.data) + ")" : ""), brl(c.valor));
  traco(); item("Total recebido para o(a) cliente", brl(r.liquidoCliente), { negrito: true });

  secao("2. Proveito econômico (base dos honorários)");
  par("Pelo contrato de honorários, os honorários contratuais incidem sobre todo o benefício econômico obtido com a ação. Além dos valores recebidos, esse benefício inclui o valor do empréstimo que foi creditado na conta do(a) cliente e que, com o reconhecimento da fraude, não precisa ser devolvido ao banco (ou foi compensado no processo).", 9.5, f, cinza);
  y -= 2;
  item("Valores recebidos no processo", brl(r.liquidoCliente));
  item("Empréstimo creditado na conta / compensado", brl(dados.emprestimo));
  if (dados.emprestimoDescricao) par(dados.emprestimoDescricao, 8.5, f, cinza, 12);
  traco(); item("Proveito econômico", brl(r.base), { negrito: true });

  secao("3. Descontos");
  item(`Honorários contratuais: ${String(dados.pct).replace(".", ",")}% de ${brl(r.base)}`, "- " + brl(r.honorarios));
  par(`Percentual combinado no contrato de honorários, calculado sobre o proveito econômico do item 2.`, 8.5, f, cinza, 12);
  for (const d of dados.despesas) { item(`Despesa: ${d.descricao}`, "- " + brl(d.valor)); }
  if (dados.despesas.length) par("Despesas do processo adiantadas pelo escritório e reembolsadas com os valores recebidos.", 8.5, f, cinza, 12);

  secao("4. Resultado");
  item("Total recebido para o(a) cliente", brl(r.liquidoCliente));
  item("(-) Honorários contratuais", "- " + brl(r.honorarios));
  if (r.despesas) item("(-) Despesas", "- " + brl(r.despesas));
  precisa(46); y -= 4;
  const final = r.aDevolver > 0;
  pg.drawRectangle({ x: M, y: y - 22, width: W - 2 * M, height: 30, color: ouroClaro, borderColor: final ? verm : verde, borderWidth: 1 });
  txt(final ? "SALDO A PAGAR PELO(A) CLIENTE AO ESCRITÓRIO" : "VALOR A REPASSAR AO(À) CLIENTE", M + 10, y - 12, 11, fb, final ? verm : verde);
  dir(brl(final ? r.aDevolver : r.repasse), W - M - 10, y - 12, 13, fb, final ? verm : verde); y -= 40;
  if (final) par("Os honorários contratuais (calculados também sobre o empréstimo que permaneceu com o(a) cliente) superam os valores recebidos no processo; a diferença acima é devida ao escritório.", 9, f, cinza);

  if (r.sucumbencia > 0) {
    secao("Honorários de sucumbência");
    par(`Além do valor acima, a parte contrária pagou ${brl(r.sucumbencia)} de honorários de sucumbência. Esse valor pertence ao advogado (art. 23 da Lei 8.906/94), não sai do valor do(a) cliente e não entra na base dos honorários contratuais.`, 9.5);
  }
  secao("Forma de pagamento");
  par(final ? "Pagamento ao escritório por PIX: ______________________________________ ." : "Repasse por PIX para a chave do(a) cliente: ______________________________________ .", 10);
  y -= 30; precisa(70);
  const meio = W / 2;
  pg.drawLine({ start: { x: M, y }, end: { x: meio - 20, y }, thickness: 0.6, color: preto });
  pg.drawLine({ start: { x: meio + 20, y }, end: { x: W - M, y }, thickness: 0.6, color: preto });
  txt("Felipe dos Passos Silva · OAB/SC 58.547", M, y - 12, 8.5, f, cinza);
  txt("De acordo: " + o.cliente, meio + 20, y - 12, 8.5, f, cinza);
  const pags = doc.getPages();
  pags.forEach((p2, i) => { const s = `Prestação de contas · ${o.cliente} · página ${i + 1} de ${pags.length}`; p2.drawText(limpa(s), { x: M, y: M - 14, size: 7, font: f, color: cinza }); });
  return doc.save();
}
