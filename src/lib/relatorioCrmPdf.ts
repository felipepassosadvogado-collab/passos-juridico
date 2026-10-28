"use client";
// Relatório de gestão do CRM em PDF, no papel do escritório (pdf-lib, no navegador).
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { paraPng } from "./relatorioPdf";
import { processosParaMeta, type Grupo, type RelatorioCrm } from "./relatorioCrm";

const limpa = (s: string) => String(s ?? "").replace(/[−–—]/g, "-").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/…/g, "...").replace(/≈/g, "~").replace(/[^\x20-\x7E\xA0-\xFF§º°ª•]/g, "");
const brl = (v: number) => "R$ " + v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl0 = (v: number) => "R$ " + Math.round(v).toLocaleString("pt-BR");
const curto = (v: number) => v >= 1e6 ? "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + " mi" : v >= 1e4 ? "R$ " + (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : brl0(v);
const n1 = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const mesRot = (m: string) => MESES[Number(m.slice(5, 7)) - 1] + "/" + m.slice(2, 4);
const dataBR = (d: string) => d.split("-").reverse().join("/");

export type OpcoesPdfCrm = { emitidoPor: string; descricaoFiltros: string[]; metas: number[]; exito: number; anexo: boolean };

/** média a usar no planejamento: a dos cumprimentos (valor já calculado) quando a amostra é boa; senão, a dos processos em andamento ajustada pelo fator de realização */
export function mediaPlanejamento(r: RelatorioCrm): { valor: number; base: string } {
  if (r.cumprimento.comValor >= 5) return { valor: r.cumprimento.media, base: `média dos ${r.cumprimento.comValor} cumprimentos de sentença, pelo valor da condenação` };
  if (r.cumprimento.comValor && r.andamento.media && r.cumpr.fatorRealizacao) return { valor: r.andamento.media * r.cumpr.fatorRealizacao, base: `média dos processos em andamento × fator de realização ${n1(r.cumpr.fatorRealizacao * 100)}%` };
  if (r.andamento.comValor) return { valor: r.andamento.media, base: `média dos ${r.andamento.comValor} processos em andamento, pelo valor da causa` };
  return { valor: r.total.media, base: "média geral da carteira" };
}

export async function pdfRelatorioCrm(r: RelatorioCrm, o: OpcoesPdfCrm): Promise<Uint8Array> {
  const doc = await PDFDocument.create(); doc.setTitle("Relatório de gestão - carteira de processos"); doc.setAuthor("Passos Advocacia");
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 595.28, H = 841.89, M = 40;
  const ouro = rgb(0.6, 0.47, 0.2), ouroClaro = rgb(0.96, 0.93, 0.86), cinza = rgb(0.4, 0.4, 0.4), linha = rgb(0.86, 0.84, 0.79), preto = rgb(0.1, 0.1, 0.1);
  const verde = rgb(0.2, 0.55, 0.33), laranja = rgb(0.85, 0.55, 0.15), azul = rgb(0.25, 0.42, 0.62);
  const logoPng = await paraPng("/marca/fp.png", false); const logo: PDFImage | null = logoPng ? await doc.embedPng(logoPng) : null;

  let pg!: PDFPage; let y = 0; const paginas: PDFPage[] = [];
  const txt = (s: string, x: number, yy: number, tam = 9, fn: PDFFont = f, cor = preto) => pg.drawText(limpa(s), { x, y: yy, size: tam, font: fn, color: cor });
  const larg = (s: string, tam: number, fn: PDFFont = f) => fn.widthOfTextAtSize(limpa(s), tam);
  const dir = (s: string, xr: number, yy: number, tam = 9, fn: PDFFont = f, cor = preto) => txt(s, xr - larg(s, tam, fn), yy, tam, fn, cor);
  const meio = (s: string, xc: number, yy: number, tam = 9, fn: PDFFont = f, cor = preto) => txt(s, xc - larg(s, tam, fn) / 2, yy, tam, fn, cor);
  const corta = (s: string, max: number, tam: number, fn: PDFFont = f) => { let t = limpa(s); if (larg(t, tam, fn) <= max) return t; while (t.length > 1 && larg(t + "...", tam, fn) > max) t = t.slice(0, -1); return t + "..."; };
  const quebra = (s: string, max: number, tam: number, fn: PDFFont = f) => { const out: string[] = []; let ln = ""; for (const w of limpa(s).split(/\s+/)) { const t = ln ? ln + " " + w : w; if (larg(t, tam, fn) > max && ln) { out.push(ln); ln = w; } else ln = t; } if (ln) out.push(ln); return out; };
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
  const secao = (s: string, min = 80) => { precisa(min); y -= 6; txt(s.toUpperCase(), M, y, 10, fb, ouro); y -= 6; pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: linha }); y -= 14; };
  const paragrafo = (s: string, tam = 8, cor = cinza, fn: PDFFont = f) => { for (const l of quebra(s, W - 2 * M, tam, fn)) { precisa(tam + 4); txt(l, M, y, tam, fn, cor); y -= tam + 2.5; } y -= 4; };
  const tiles = (itens: { rot: string; v: string; sub?: string; cor?: ReturnType<typeof rgb> }[], h = 58) => {
    precisa(h + 10); const gap = 8, w = (W - 2 * M - gap * (itens.length - 1)) / itens.length;
    itens.forEach((it, i) => {
      const x = M + i * (w + gap);
      pg.drawRectangle({ x, y: y - h, width: w, height: h, borderColor: linha, borderWidth: 0.7, color: rgb(1, 1, 1) });
      pg.drawRectangle({ x, y: y - h, width: 3, height: h, color: it.cor || ouro });
      txt(corta(it.rot, w - 16, 8), x + 10, y - 14, 8, f, cinza);
      let tv = 18; while (tv > 9 && larg(it.v, tv, fb) > w - 16) tv -= 1;
      txt(it.v, x + 10, y - 35, tv, fb, it.cor || preto);
      if (it.sub) { const ls = quebra(it.sub, w - 16, 6.8); ls.slice(0, 2).forEach((l, k) => txt(l, x + 10, y - 47 - k * 8, 6.8, f, cinza)); }
    });
    y -= h + 10;
  };
  const tabela = (cols: { t: string; w: number; dir?: boolean }[], linhas: string[][], opc: { negrito?: (i: number) => boolean; cor?: (i: number, c: number) => ReturnType<typeof rgb> | null } = {}) => {
    const tw = W - 2 * M; const soma = cols.reduce((s, c) => s + c.w, 0); const ws = cols.map((c) => (c.w / soma) * tw);
    const cab = () => { precisa(34); pg.drawRectangle({ x: M, y: y - 16, width: tw, height: 18, color: ouroClaro }); let x = M; cols.forEach((c, i) => { if (c.dir) dir(c.t, x + ws[i] - 5, y - 11, 7.5, fb, ouro); else txt(c.t, x + 5, y - 11, 7.5, fb, ouro); x += ws[i]; }); y -= 20; };
    cab();
    linhas.forEach((l, li) => {
      if (y - 15 < M + 24) { cabecalho(); cab(); }
      const fn = opc.negrito?.(li) ? fb : f; let x = M;
      l.forEach((v, i) => { const t = corta(v, ws[i] - 10, 8, fn); const cor = opc.cor?.(li, i) || preto; if (cols[i].dir) dir(t, x + ws[i] - 5, y - 9, 8, fn, cor); else txt(t, x + 5, y - 9, 8, fn, cor); x += ws[i]; });
      y -= 13; pg.drawLine({ start: { x: M, y: y + 1 }, end: { x: W - M, y: y + 1 }, thickness: 0.3, color: linha });
    });
    y -= 10;
  };
  const colsGrupo = (primeira: string) => [{ t: primeira, w: 30 }, { t: "Processos", w: 11, dir: true }, { t: "Com valor", w: 11, dir: true }, { t: "Valor das causas", w: 17, dir: true }, { t: "Honorários", w: 16, dir: true }, { t: "Média", w: 14, dir: true }, { t: "Mediana", w: 14, dir: true }];
  const linhaGrupo = (g: Grupo) => [g.nome, String(g.n), String(g.comValor), curto(g.valor), curto(g.hon), g.comValor ? brl0(g.media) : "-", g.comValor ? brl0(g.mediana) : "-"];
  const tabelaGrupos = (primeira: string, gs: Grupo[], total?: Grupo) => tabela(colsGrupo(primeira), [...gs.map(linhaGrupo), ...(total ? [linhaGrupo({ ...total, nome: "Total" })] : [])], { negrito: (i) => !!total && i === gs.length });

  // ───── capa ─────
  cabecalho();
  txt("RELATÓRIO DE GESTÃO", M, y, 16, fb); y -= 15;
  txt("Carteira de processos, honorários esperados e planejamento", M, y, 10, f, cinza); y -= 18;
  const fl = o.descricaoFiltros; const ch = 22 + fl.length * 11;
  pg.drawRectangle({ x: M, y: y - ch, width: W - 2 * M, height: ch, color: ouroClaro, borderColor: linha, borderWidth: 0.6 });
  txt("FILTROS APLICADOS", M + 12, y - 14, 7.5, fb, ouro);
  fl.forEach((l, i) => txt(corta(l, W - 2 * M - 24, 8.5), M + 12, y - 27 - i * 11, 8.5, i === 0 ? fb : f));
  y -= ch + 16;

  const plan = mediaPlanejamento(r);
  secao("Visão geral");
  tiles([
    { rot: "Processos", v: String(r.total.n), sub: `${r.total.comValor} com valor da causa cadastrado` },
    { rot: "Valor das causas", v: curto(r.total.valor), sub: "soma dos que têm valor" },
    { rot: "Honorários esperados", v: curto(r.total.hon), sub: `percentual de cada caso, ou ${n1(r.pctPadrao)}% (padrão)`, cor: verde },
    { rot: "Média de honorários / processo", v: r.total.comValor ? brl0(r.total.media) : "-", sub: r.total.comValor ? "mediana " + brl0(r.total.mediana) : "sem valores", cor: ouro },
  ]);

  // ───── a pergunta principal: quanto vale, em média, cada processo ─────
  secao("Quanto vale, em média, cada processo");
  tiles([
    { rot: "Em andamento (valor pedido)", v: r.andamento.comValor ? brl0(r.andamento.media) : "-", sub: `${r.andamento.comValor} processos · mediana ${brl0(r.andamento.mediana)}`, cor: azul },
    { rot: "Cumprimento de sentença", v: r.cumprimento.comValor ? brl0(r.cumprimento.media) : "-", sub: r.cumprimento.comValor ? `${r.cumprimento.comValor} processos · ${r.cumpr.calculados} com cálculo do sistema` : "nenhum no filtro", cor: verde },
    { rot: "Fator de realização", v: r.cumpr.fatorRealizacao ? n1(r.cumpr.fatorRealizacao * 100) + "%" : "-", sub: r.cumpr.pareados.length ? `condenação ÷ valor da causa inicial (${r.cumpr.pareados.length} casos)` : "aparece quando houver cálculos que alteraram o valor da causa", cor: laranja },
    { rot: "Média para planejar", v: brl0(plan.valor), sub: plan.base, cor: ouro },
  ], 64);
  y -= 6; paragrafo("Leitura: a média dos processos em andamento usa o valor pedido na inicial (expectativa). A dos cumprimentos de sentença usa o valor da condenação, que o cálculo do sistema grava como novo valor da causa: é a amostra mais próxima do que efetivamente se recebe. O fator de realização compara, nos mesmos processos, a condenação calculada com o valor que estava na causa antes do cálculo. A mediana mostra o processo 'típico' e não é puxada por casos muito grandes.");

  // ───── metas ─────
  if (plan.valor > 0 && o.metas.length) {
    secao("Quantos processos para atingir a meta");
    const ex = Math.max(0.01, Math.min(1, o.exito));
    tabela([{ t: "Meta de honorários", w: 24 }, { t: "Processos (100% de êxito)", w: 22, dir: true }, { t: `Processos (êxito de ${n1(ex * 100)}%)`, w: 22, dir: true }, { t: "Meses no ritmo atual", w: 18, dir: true }, { t: "Pela mediana", w: 14, dir: true }],
      o.metas.map((m) => { const a = processosParaMeta(m, plan.valor), b = processosParaMeta(m, plan.valor, ex); const med = processosParaMeta(m, r.cumprimento.comValor >= 5 ? r.cumprimento.mediana : r.andamento.mediana, ex);
        return [brl0(m), a == null ? "-" : String(a), b == null ? "-" : String(b), b != null && r.ritmoMensal > 0 ? n1(b / r.ritmoMensal) : "-", med == null ? "-" : String(med)]; }));
    paragrafo(`Média usada: ${brl(plan.valor)} por processo (${plan.base}). Ritmo atual: ${n1(r.ritmoMensal)} iniciais protocoladas por mês (média de ${r.mesesRitmo} mês(es) completo(s) do período). Nesse ritmo, a carteira ganha cerca de ${brl0(r.ritmoMensal * plan.valor * ex)} por mês em honorários esperados. "Meses" é o tempo para protocolar os processos necessários; o recebimento vem depois, no fim de cada processo${r.cumpr.tempoMedioMeses ? ` (hoje, cerca de ${n1(r.cumpr.tempoMedioMeses)} meses do protocolo até o cumprimento de sentença, em ${r.cumpr.amostraTempo} caso(s))` : ""}.`);
  }

  // ───── protocolos por mês ─────
  const pm = r.protocolosMes;
  if (pm.length) {
    secao("Iniciais protocoladas por mês", 190); const gh = 110; precisa(gh + 40);
    const max = Math.max(1, ...pm.map((s) => s.n)); const x0 = M + 22, bw = (W - M - x0) / pm.length; const yb = y - gh; const esc = (v: number) => (v / max) * (gh - 16);
    const passo = max <= 5 ? 1 : Math.ceil(max / 4);
    for (let v = 0; v <= max; v += passo) { const yy = yb + esc(v); pg.drawLine({ start: { x: x0, y: yy }, end: { x: W - M, y: yy }, thickness: 0.4, color: linha }); dir(String(v), x0 - 4, yy - 3, 7, f, cinza); }
    pm.forEach((s, i) => { const w = Math.max(3, bw * 0.62); const x = x0 + i * bw + (bw - w) / 2;
      if (s.n) { pg.drawRectangle({ x, y: yb, width: w, height: esc(s.n), color: ouro }); if (bw > 12) meio(String(s.n), x + w / 2, yb + esc(s.n) + 2, 6.5, fb, ouro); }
      if (pm.length <= 18 || i % 2 === 0) meio(mesRot(s.mes), x0 + i * bw + bw / 2, yb - 10, 6.5, f, cinza); });
    y = yb - 24;
    if (pm.length <= 24) tabela([{ t: "Mês", w: 20 }, { t: "Iniciais protocoladas", w: 26, dir: true }, { t: "Honorários esperados", w: 27, dir: true }, { t: "Média por processo", w: 27, dir: true }],
      [...pm.map((s) => [mesRot(s.mes), String(s.n), s.hon ? brl0(s.hon) : "-", s.n && s.hon ? brl0(s.hon / s.n) : "-"]), ["Total", String(pm.reduce((a, s) => a + s.n, 0)), brl0(pm.reduce((a, s) => a + s.hon, 0)), ""]], { negrito: (i) => i === pm.length });
    if (r.semData.ano || r.semData.aprox) paragrafo(`${r.semData.ano ? `${r.semData.ano} processo(s) só têm o ano do protocolo (pelo nº CNJ) e não aparecem no gráfico mensal. ` : ""}${r.semData.aprox ? `${r.semData.aprox} têm data aproximada (1ª publicação no DJEN).` : ""}`);
  }

  // ───── fases ─────
  secao("Carteira por fase");
  tabelaGrupos("Fase", r.porFase, r.total);

  // ───── cumprimento de sentença ─────
  const cl = r.linhas.filter((l) => l.fase === "Cumprimento de sentença").sort((a, b) => b.hon - a.hon);
  if (cl.length) {
    secao("Cumprimento de sentença · amostra do que se recebe", 140);
    tiles([
      { rot: "Processos em cumprimento", v: String(r.cumprimento.n), sub: `${r.cumpr.calculados} com cálculo feito no sistema`, cor: verde },
      { rot: "Honorários a receber", v: curto(r.cumprimento.hon), sub: "soma das condenações × percentual", cor: verde },
      { rot: "Média · mediana", v: brl0(r.cumprimento.media), sub: "mediana " + brl0(r.cumprimento.mediana) },
      { rot: "Menor · maior", v: brl0(r.cumprimento.min) + " - " + brl0(r.cumprimento.max), sub: r.cumpr.tempoMedioMeses ? `~${n1(r.cumpr.tempoMedioMeses)} meses do protocolo ao cumprimento` : "honorários por processo" },
    ]);
    if (r.cumpr.pareados.length) {
      tabela([{ t: "Cliente", w: 36 }, { t: "Processo", w: 24 }, { t: "Antes do cálculo", w: 15, dir: true }, { t: "Condenação", w: 15, dir: true }, { t: "Variação", w: 10, dir: true }],
        r.cumpr.pareados.map((p) => [p.cliente, p.numero, brl0(p.de), brl0(p.para), (p.para >= p.de ? "+" : "") + n1((p.para / p.de - 1) * 100) + "%"]),
        { cor: (i, c) => (c === 4 ? (r.cumpr.pareados[i].para >= r.cumpr.pareados[i].de ? verde : laranja) : null) });
    }
    tabela([{ t: "Cliente", w: 34 }, { t: "Processo", w: 24 }, { t: "Réu", w: 10 }, { t: "Valor", w: 13, dir: true }, { t: "Honorários", w: 13, dir: true }, { t: "Cálculo", w: 8 }],
      cl.map((l) => [l.cliente, l.mascara, l.banco, l.valor ? brl0(l.valor) : "-", l.hon ? brl0(l.hon) : "-", l.calculado ? "sim" : "-"]));
  }

  secao("Por réu (banco)"); tabelaGrupos("Réu", r.porBanco);
  if (r.porResp.length > 1) { secao("Por responsável"); tabelaGrupos("Responsável", r.porResp); }
  if (r.porJustica.length > 1) { secao("Por justiça"); tabelaGrupos("Justiça", r.porJustica); }
  secao("Distribuição dos honorários por processo");
  tabela([{ t: "Faixa de honorários", w: 40 }, { t: "Processos", w: 20, dir: true }, { t: "% dos processos", w: 20, dir: true }, { t: "Honorários", w: 20, dir: true }],
    r.faixas.map((x) => [x.faixa, String(x.n), r.total.comValor ? n1((x.n / r.total.comValor) * 100) + "%" : "-", x.hon ? curto(x.hon) : "-"]));
  if (r.pre.some((x) => x.n)) {
    secao("Pré-processual · atendimentos ainda não protocolados");
    tabela([{ t: "Etapa", w: 50 }, { t: "Atendimentos", w: 25, dir: true }, { t: "Honorários esperados", w: 25, dir: true }], r.pre.filter((x) => x.n).map((x) => [x.etapa, String(x.n), x.hon ? curto(x.hon) : "-"]));
  }

  secao("Como os números foram obtidos", 100);
  paragrafo("Honorários = valor da causa × percentual contratual do caso (ou o padrão do escritório). Processos sem valor da causa não entram nas médias. Data do protocolo da inicial, da fonte mais segura para a menos segura: tarefa 'Protocolo da inicial' concluída; atendimento marcado como protocolado; cadastro do processo a partir do atendimento; lista de distribuição publicada no DJEN; 1ª publicação no mesmo ano do nº CNJ (aproximada); só o ano do nº CNJ. No filtro por período, processos com apenas o ano entram quando o ano inteiro está dentro do período.");
  if (r.semData.nenhuma) paragrafo(`${r.semData.nenhuma} processo(s) sem nenhuma data de protocolo identificável.`);
  paragrafo("Estimativa gerencial, não contábil: o valor efetivamente recebido depende do êxito, de acordos, de impugnações ao cálculo e do pagamento pelo réu.");

  if (o.anexo && r.linhas.length) {
    cabecalho(); txt(`ANEXO · PROCESSOS DO FILTRO (${r.linhas.length})`, M, y, 11, fb, ouro); y -= 18;
    const ls = [...r.linhas].sort((a, b) => a.fase.localeCompare(b.fase) || b.hon - a.hon);
    tabela([{ t: "Cliente", w: 21 }, { t: "Processo", w: 22 }, { t: "Réu", w: 8 }, { t: "Fase", w: 16 }, { t: "Protocolo", w: 13 }, { t: "Valor", w: 10, dir: true }, { t: "Honorários", w: 10, dir: true }],
      ls.map((l) => [l.cliente, l.mascara, l.banco, ({ "Cumprimento de sentença": "Cumprimento", "Petição nos próprios autos": "Petição p. autos", "Protocolo / citação": "Citação", "Perícia / instrução": "Perícia/instrução" } as Record<string, string>)[l.fase] || l.fase || "A classificar", l.protocolo ? (l.protocolo.precisao === "ano" ? l.protocolo.data.slice(0, 4) : dataBR(l.protocolo.data) + (l.protocolo.precisao === "aprox" ? "*" : "")) : "-", l.valor ? brl0(l.valor) : "-", l.hon ? brl0(l.hon) : "-"]));
    if (ls.some((l) => l.protocolo?.precisao === "aprox")) paragrafo("* data aproximada (1ª publicação no DJEN). Ano sozinho: só o ano do nº CNJ.");
  }

  paginas.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: M + 4 }, end: { x: W - M, y: M + 4 }, thickness: 0.5, color: linha });
    p.drawText(limpa("Passos Advocacia · Relatório de gestão · " + (o.descricaoFiltros[0] || "")), { x: M, y: M - 8, size: 7, font: f, color: cinza });
    const s = `página ${i + 1} de ${paginas.length}`; p.drawText(s, { x: W - M - f.widthOfTextAtSize(s, 7), y: M - 8, size: 7, font: f, color: cinza });
  });
  return doc.save();
}
