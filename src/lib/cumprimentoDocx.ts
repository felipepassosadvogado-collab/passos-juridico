// Petição de cumprimento de sentença em Word, no modelo do escritório (papel timbrado, Arial 12, justificado).
// O título executivo vem redigido pelo Claude; a memória de cálculo, a tabela e os requerimentos saem do cálculo.
import JSZip from "jszip";
import { MODELO_CUMPRIMENTO_DOCX } from "@/modelos/modeloCumprimento";
import { mesBR } from "./calculo";
import { REGIMES_CS, MODULACAO_CS, type ParamsCs, type ResultadoCs } from "./cumprimento";
import { moeda, porExtenso } from "./formato";

export type DadosPeticaoCs = {
  enderecamento: string; autos: string;
  qualificacao: { nome: string; resto: string };
  executado: string; inss: "subsidiaria" | "solidaria" | "nenhuma"; jef: boolean; idoso: boolean; feminino: boolean;
  titulo: string[]; custas: string; pisoTexto?: string; fonteExtrato: string; nb: string; oficiarInss: boolean;
  params: ParamsCs; r: ResultadoCs;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rpr = (b: boolean, i = false, extra = "") => `<w:rPr><w:rFonts w:ascii="Arial" w:eastAsia="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b ? "<w:b/><w:bCs/>" : ""}${i ? "<w:i/><w:iCs/>" : ""}${extra}<w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr>`;
/** texto com **negrito** em runs */
const runs = (t: string, italico = false, extra = "") => t.split(/(\*\*[^*]+\*\*)/).filter(Boolean).map((s) => {
  const b = s.startsWith("**") && s.endsWith("**"); const x = b ? s.slice(2, -2) : s;
  return `<w:r>${rpr(b, italico, extra)}<w:t xml:space="preserve">${esc(x)}</w:t></w:r>`;
}).join("");
type OpP = { jc?: "both" | "center" | "right" | "left"; ind?: number; antes?: number; depois?: number; italico?: boolean };
const par = (t: string, o: OpP = {}) => `<w:p><w:pPr><w:spacing ${o.antes ? `w:before="${o.antes}" ` : ""}w:after="${o.depois ?? 240}"/>${o.ind ? `<w:ind w:left="${o.ind}"/>` : ""}${o.jc ? `<w:jc w:val="${o.jc}"/>` : ""}</w:pPr>${runs(t, o.italico)}</w:p>`;
const vazio = () => `<w:p><w:pPr><w:spacing w:after="0"/></w:pPr></w:p>`;
const secao = (t: string) => par(`**${t}**`, { antes: 200, jc: "left" });

function tabela(linhas: { item: string; valor: string; tipo: "normal" | "total" | "final" }[]) {
  const mar = `<w:tcMar><w:top w:w="80" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="80" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tcMar><w:vAlign w:val="center"/>`;
  const cel = (w: number, txt: string, fill: string | null, b: boolean, cor: string | null, jc: string) =>
    `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ""}${mar}</w:tcPr><w:p><w:pPr><w:jc w:val="${jc}"/></w:pPr><w:r>${rpr(b, false, cor ? `<w:color w:val="${cor}"/>` : "")}<w:t xml:space="preserve">${esc(txt)}</w:t></w:r></w:p></w:tc>`;
  const cab = `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${cel(6556, "Item", "1F3864", true, "FFFFFF", "center")}${cel(2550, "Valor (R$)", "1F3864", true, "FFFFFF", "center")}</w:tr>`;
  const corpo = linhas.map((l) => {
    const fill = l.tipo === "total" ? "D9E2F3" : l.tipo === "final" ? "1F3864" : null; const cor = l.tipo === "final" ? "FFFFFF" : null; const b = l.tipo !== "normal";
    return `<w:tr><w:trPr><w:cantSplit/></w:trPr>${cel(6556, l.item, fill, b, cor, "left")}${cel(2550, l.valor, fill, b, cor, "right")}</w:tr>`;
  }).join("");
  const bord = ["top", "left", "bottom", "right", "insideH", "insideV"].map((k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="9106" w:type="dxa"/><w:tblBorders>${bord}</w:tblBorders><w:tblCellMar><w:left w:w="10" w:type="dxa"/><w:right w:w="10" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="0"/></w:tblPr><w:tblGrid><w:gridCol w:w="6556"/><w:gridCol w:w="2550"/></w:tblGrid>${cab}${corpo}</w:tbl>`;
}

const rs = (v: number) => `R$ ${moeda(v)} (${porExtenso(v)})`;
const NUM_EXT = ["zero", "uma", "duas", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez"];
const qtd = (n: number) => (n <= 10 ? `${n} (${NUM_EXT[n]})` : `${n} (${porExtenso(n).replace(/ (de )?reais?.*$/, "").replace(/\bum$/, "uma").replace(/\bdois$/, "duas")})`);

export function corpoCumprimento(d: DadosPeticaoCs): string {
  const { params: p, r } = d; const exe = d.feminino ? "da exequente" : "do exequente"; const o: string[] = [];
  const crit = REGIMES_CS[p.regime].curto;
  o.push(par(`**${d.enderecamento.toUpperCase()}**`, { jc: "both" }), vazio(), vazio(), vazio(), par(d.autos, { italico: true }));
  const contraInss = d.inss === "subsidiaria" ? " e, subsidiariamente, do **INSTITUTO NACIONAL DO SEGURO SOCIAL – INSS**" : d.inss === "solidaria" ? " e do **INSTITUTO NACIONAL DO SEGURO SOCIAL – INSS**" : "";
  o.push(par(`**${d.qualificacao.nome.toUpperCase()}**${d.qualificacao.resto}, já ${d.feminino ? "qualificada" : "qualificado"} nos autos em epígrafe, vem, respeitosamente, perante Vossa Excelência, por meio de seu procurador habilitado (instrumento de mandato já acostado aos autos), apresentar o competente **CUMPRIMENTO DE SENTENÇA** em face de **${d.executado.toUpperCase()}**${contraInss}, nos termos dos arts. 523 e seguintes do Código de Processo Civil${d.jef ? ", combinados com o art. 52 da Lei nº 9.099/95 e o art. 1º da Lei nº 10.259/2001" : ""}, pelos fatos e fundamentos a seguir expostos${d.idoso ? `, requerendo, desde já, a tramitação prioritária em razão da idade ${exe} (art. 71 da Lei nº 10.741/2003 — Estatuto da Pessoa Idosa)` : ""}.`, { jc: "both" }));

  o.push(secao("I – DO TÍTULO EXECUTIVO JUDICIAL"));
  for (const t of d.titulo.filter((x) => x.trim())) o.push(par(t.trim(), { jc: "both" }));

  o.push(secao("II – DA MEMÓRIA DE CÁLCULO E DA LIQUIDAÇÃO"));
  o.push(par(`O cálculo do valor devido observa rigorosamente os parâmetros fixados no título executivo, com data-base em ${mesBR(p.base)} (último índice publicado), a saber:`, { jc: "both" }));
  const letras = "abcdefgh"; let k = 0; const L = () => letras[k++] + ") ";
  if (r.linhas.length) {
    const forma = p.restituicao === "simples" ? "**simples**" : p.restituicao === "dobro" ? "**em dobro**" : `**em dobro** a partir de ${mesBR(MODULACAO_CS)} (e simples antes disso)`;
    const cts = r.porContrato.map((c) => `${qtd(c.n)} parcelas de R$ ${moeda(c.parcela)} descontadas do contrato nº ${c.contrato}, relativas às competências ${mesBR(c.ini)} a ${mesBR(c.fim)}`);
    const juros = p.jurosMateriais === "citacao" && p.citacao ? `corrigida monetariamente desde a sua competência e acrescida de juros de mora desde a citação (${mesBR(p.citacao)})` : "corrigida monetariamente e acrescida de juros de mora a partir de sua própria competência";
    o.push(par(`**${L()}Danos materiais:** conforme ${d.fonteExtrato || "o extrato de créditos do benefício (HISCRE)"}, foram identificadas ${cts.join("; e ")}. Cada parcela foi atualizada pelos critérios do título (${crit}), ${juros}, na forma da restituição ${forma} determinada no título judicial, totalizando ${rs(r.materiais)};`, { jc: "both" }));
  }
  if (r.moral && p.moral) o.push(par(`**${L()}Danos morais:** o valor de R$ ${moeda(p.moral.valor)}, fixado no título, foi atualizado com juros de mora desde ${mesBR(p.moral.jurosDesde)} e correção monetária desde ${mesBR(p.moral.correcaoDesde)}, resultando no valor de ${rs(r.moral.total)};`, { jc: "both" }));
  if (r.compensacao && p.compensacao) o.push(par(`**${L()}Compensação:** nos termos do título, foi deduzido o valor creditado na conta ${exe} (R$ ${moeda(p.compensacao.valor)}, em ${mesBR(p.compensacao.mes)}), atualizado pelos mesmos critérios, no total de R$ ${moeda(r.compensacao.total)};`, { jc: "both" }));
  if (r.honorarios) {
    const h = p.honorarios;
    o.push(par(`**${L()}Honorários sucumbenciais:** ${h.tipo === "percentual"
      ? `nos termos do título, arbitrados em ${h.pct}% sobre o valor atualizado da condenação (R$ ${moeda(r.honorarios.pctValor)})${h.minimo ? `, com piso de ${d.pisoTexto?.trim() || "R$ " + moeda(h.minimo)}${h.minimoDesde ? `, atualizado monetariamente a partir de ${mesBR(h.minimoDesde)} (R$ ${moeda(r.honorarios.minimoAtual)})` : ""}, prevalecendo o que for maior. ${r.honorarios.prevaleceMinimo ? "Como o piso supera o percentual sobre a condenação, é este o valor devido" : "O percentual sobre a condenação supera o piso e é o valor devido"}` : ""}`
      : `fixados no título em R$ ${moeda(h.valor)}${h.valorDesde ? `, atualizados monetariamente desde ${mesBR(h.valorDesde)}` : ""}`}, totalizando ${rs(r.honorarios.valor)};`, { jc: "both" }));
  }
  if (d.custas.trim()) o.push(par(`**${L()}Custas${r.compensacao ? "" : " e compensação"}:** ${d.custas.trim().replace(/[.;]?$/, ".")}`, { jc: "both" }));
  if (r.linhas.length) o.push(par(`O detalhamento mês a mês de cada uma das ${r.linhas.length} parcelas, com os respectivos fatores de correção monetária e juros aplicados, bem como as fontes dos índices utilizados (IPCA-E — IBGE, BCB-SGS nº 10764; SELIC acumulada no mês — BCB-SGS nº 4390${p.regime !== "ipcae_selic" ? "; IPCA — BCB-SGS nº 433; IPCA-15 — BCB-SGS nº 7478" : ""}), consta da memória de cálculo que segue anexa a esta petição como parte integrante.`, { jc: "both" }));

  const linhas: { item: string; valor: string; tipo: "normal" | "total" | "final" }[] = [];
  if (r.linhas.length) linhas.push({ item: `Danos materiais — restituição ${p.restituicao === "simples" ? "simples" : "em dobro"} (${r.porContrato.map((c) => `${c.n} parcelas de R$ ${moeda(c.parcela)}, competências ${mesBR(c.ini)} a ${mesBR(c.fim)}`).join("; ")}, atualizadas pelos critérios do título, cada parcela desde sua própria competência)`, valor: moeda(r.materiais), tipo: "normal" });
  if (r.moral && p.moral) linhas.push({ item: `Danos morais — R$ ${moeda(p.moral.valor)} (valor fixado no título), com juros desde ${mesBR(p.moral.jurosDesde)} e correção monetária desde ${mesBR(p.moral.correcaoDesde)}`, valor: moeda(r.moral.total), tipo: "normal" });
  if (r.compensacao && p.compensacao) linhas.push({ item: `(-) Compensação do valor creditado (R$ ${moeda(p.compensacao.valor)}, ${mesBR(p.compensacao.mes)}), atualizado`, valor: "-" + moeda(r.compensacao.total), tipo: "normal" });
  linhas.push({ item: "TOTAL DA CONDENAÇÃO", valor: moeda(r.condenacao), tipo: "total" });
  if (r.honorarios) linhas.push({ item: p.honorarios.tipo === "percentual" ? `Honorários sucumbenciais — ${p.honorarios.pct}% sobre o valor da condenação (R$ ${moeda(r.honorarios.pctValor)})${p.honorarios.minimo ? ` ou o piso de R$ ${moeda(r.honorarios.minimoAtual)}, o que for maior; prevalece ${r.honorarios.prevaleceMinimo ? "o piso" : "o percentual"}` : ""}` : "Honorários sucumbenciais fixados no título", valor: moeda(r.honorarios.valor), tipo: "normal" });
  linhas.push({ item: "TOTAL LÍQUIDO EXEQUENDO", valor: moeda(r.total), tipo: "final" });
  o.push(tabela(linhas), vazio());
  o.push(par(`Dá-se à execução, para todos os efeitos legais, o valor líquido de **${rs(r.total)}**, devendo o montante ser atualizado, se necessário, até a data do efetivo pagamento.`, { jc: "both" }));

  o.push(secao("III – DOS REQUERIMENTOS"), par("Diante do exposto, requer-se:", { jc: "both" }));
  const req: string[] = [
    `a intimação do ${d.executado}, na pessoa de seu advogado constituído nos autos, para que, no prazo de 15 (quinze) dias, efetue o pagamento do valor de ${rs(r.total)}, conforme memória de cálculo anexa, sob pena de incidência da multa de 10% (dez por cento) e de honorários advocatícios de execução de 10% (dez por cento) sobre o montante da condenação, nos termos do art. 523, § 1º, do Código de Processo Civil;`,
    "não havendo pagamento voluntário no prazo legal, o prosseguimento do feito com a adoção de medidas executivas e constritivas, especialmente a penhora on-line de valores via sistema SISBAJUD, nos termos do art. 523, § 3º, c/c art. 835 do CPC;",
  ];
  if (d.inss === "subsidiaria") req.push("persistindo o inadimplemento do banco, a intimação do INSS para o cumprimento da obrigação subsidiária estabelecida no título executivo;");
  if (d.inss === "solidaria") req.push("a intimação do INSS, responsável solidário, para o cumprimento da obrigação estabelecida no título executivo;");
  const nums = [...new Set(p.contratos.map((c) => c.numero).filter(Boolean))];
  if (d.oficiarInss && nums.length) req.push(`seja oficiado o INSS para que, no prazo de 10 (dez) dias, comprove nos autos a cessação dos descontos ${nums.length > 1 ? "dos contratos nºs " + nums.join(", ") : "do contrato nº " + nums[0]} e confirme a baixa definitiva da averbação e a integral liberação da respectiva margem consignável${d.nb ? " do benefício nº " + d.nb : ""};`);
  req.push(`efetuado o depósito, a expedição de alvará de levantamento (ou transferência eletrônica) em favor ${exe}${r.honorarios ? " e dos honorários sucumbenciais em favor de seu procurador" : ""}.`);
  req.forEach((t, i) => o.push(par(`**${letras[i]}) **${t}`, { jc: "both", ind: 700, depois: 200 })));
  o.push(par("Nestes termos, pede deferimento.", { jc: "both" }), par("Joinville/SC, data e hora no sistema.", { jc: "both" }),
    par("(assinado eletronicamente)", { jc: "center", depois: 0 }), par("**FELIPE DOS PASSOS SILVA**", { jc: "center", depois: 0 }), par("OAB/SC 58.547", { jc: "center" }));
  return o.join("");
}

export async function montarCumprimento(d: DadosPeticaoCs): Promise<Buffer> {
  const zip = await JSZip.loadAsync(Buffer.from(MODELO_CUMPRIMENTO_DOCX, "base64"));
  const xml = (await zip.file("word/document.xml")!.async("string")).replace(/<w:p><w:r><w:t>\{\{CORPO\}\}<\/w:t><\/w:r><\/w:p>/, corpoCumprimento(d));
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
