// Geração de peças processuais em Word no papel timbrado do escritório.
// O Claude redige o conteúdo em blocos (seções, parágrafos, citações, alíneas);
// aqui os blocos viram parágrafos com a mesma formatação da manifestação-modelo.
import JSZip from "jszip";
import { MODELO_PECA_DOCX } from "@/modelos/modeloPeca";
import { EXEMPLO_PECA } from "@/modelos/exemploPeca";

export type Bloco = { tipo: "secao" | "paragrafo" | "citacao" | "marcador" | "alinea" | "centro"; texto: string; rotulo?: string };
export type Peca = {
  enderecamento: string; preambulo: string; titulo: string; abertura?: string; blocos: Bloco[];
  fecho?: string; pendencias?: string[]; nomeArquivo?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SP = (antes = 0, linha = 360) => `<w:spacing${antes ? ` w:before="${antes}"` : ""} w:after="120" w:line="${linha}" w:lineRule="auto"/>`;

/** texto com **negrito** → runs do Word */
function runs(texto: string, base = "", tudoNegrito = false): string {
  const partes = texto.split(/(\*\*[^*]+\*\*)/g).filter((x) => x !== "");
  return partes.map((p) => {
    const b = tudoNegrito || /^\*\*.*\*\*$/.test(p); const t = p.replace(/^\*\*|\*\*$/g, "");
    return `<w:r><w:rPr>${b ? "<w:b/>" : ""}${base}</w:rPr><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  }).join("");
}
const par = (ppr: string, conteudo: string) => `<w:p><w:pPr>${ppr}</w:pPr>${conteudo}</w:p>`;
const recuo = `<w:ind w:firstLine="1417"/><w:jc w:val="both"/>`;

export function corpoXml(p: Peca, autos: string, prioridade: boolean, assinatura: { cidade: string; nome: string; oab: string }): string {
  const out: string[] = [];
  out.push(par(SP(), runs(p.enderecamento.toUpperCase(), "", true)));
  out.push(par(SP(), ""));
  out.push(par(SP(), runs(autos, "", true)));
  if (prioridade) out.push(par(SP(), runs("TRAMITAÇÃO PRIORITÁRIA – IDOSO", "", true)));
  out.push(par(SP() + recuo, runs(p.preambulo)));
  out.push(par(SP() + `<w:jc w:val="center"/>`, runs(p.titulo.toUpperCase(), "", true)));
  if (p.abertura) out.push(par(SP() + recuo, runs(p.abertura)));
  for (const b of p.blocos || []) {
    const t = String(b.texto || "").trim(); if (!t) continue;
    if (b.tipo === "secao") out.push(par(SP(240) + `<w:jc w:val="both"/>`, runs(t.replace(/\*\*/g, "").toUpperCase(), "", true)));
    else if (b.tipo === "citacao") out.push(par(SP(0, 240) + `<w:ind w:left="2268"/><w:jc w:val="both"/>`, runs(t, `<w:i/><w:sz w:val="20"/>`)));
    else if (b.tipo === "marcador") out.push(par(SP() + `<w:ind w:left="850" w:hanging="283"/><w:jc w:val="both"/>`, `<w:r><w:t>•</w:t></w:r><w:r><w:tab/></w:r>` + runs(t)));
    else if (b.tipo === "alinea") out.push(par(SP() + `<w:ind w:left="850" w:hanging="283"/><w:jc w:val="both"/>`, `<w:r><w:t>${esc(b.rotulo || "a)")}</w:t></w:r><w:r><w:tab/></w:r>` + runs(t)));
    else if (b.tipo === "centro") out.push(par(SP() + `<w:jc w:val="center"/>`, runs(t)));
    else out.push(par(SP() + recuo, runs(t)));
  }
  out.push(par(SP() + recuo, runs(p.fecho || "Nestes termos, pede deferimento.")));
  out.push(par(SP() + recuo, runs(`${assinatura.cidade}, data e hora do sistema.`)));
  out.push(par(SP() + `<w:jc w:val="center"/>`, runs("(assinado eletronicamente)")));
  out.push(par(SP() + `<w:jc w:val="center"/>`, runs(assinatura.nome, "", true)));
  out.push(par(SP() + `<w:jc w:val="center"/>`, runs(assinatura.oab, "", true)));
  return out.join("");
}

/** monta o .docx no papel timbrado: troca só o corpo, mantendo cabeçalho, rodapé e estilos */
export async function montarDocx(p: Peca, autos: string, prioridade: boolean): Promise<Buffer> {
  const zip = await JSZip.loadAsync(Buffer.from(MODELO_PECA_DOCX, "base64"));
  const xml = await zip.file("word/document.xml")!.async("string");
  const ini = xml.indexOf("<w:body>") + 8; const sect = xml.lastIndexOf("<w:sectPr");
  const novo = xml.slice(0, ini) + corpoXml(p, autos, prioridade, { cidade: "Joinville/SC", nome: "FELIPE DOS PASSOS SILVA", oab: "OAB/SC 58.547" }) + xml.slice(sect);
  zip.file("word/document.xml", novo);
  for (const f of ["docProps/core.xml"]) { const c = await zip.file(f)?.async("string"); if (c) zip.file(f, c.replace(/<dc:title>[^<]*<\/dc:title>/, "<dc:title>" + esc(p.titulo) + "</dc:title>")); }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

export const INSTRUCOES_PECA = `Você é advogado do escritório Passos Advocacia (Felipe dos Passos Silva, OAB/SC 58.547, Joinville/SC), que representa a parte AUTORA — em geral aposentados e pensionistas — em ações contra bancos e o INSS por empréstimos consignados não contratados (fraude, assinatura falsificada), quase sempre no Juizado Especial Federal (eproc, TRF4).
Redija a peça pedida, pronta para revisão do advogado, no mesmo estilo e estrutura do exemplo do escritório: endereçamento ao juízo, preâmbulo com o nome do autor e dos réus em negrito, título da peça centralizado, seções numeradas ("1. DA TEMPESTIVIDADE", "2. ..."), parágrafos objetivos, citações literais em recuo quando houver trecho a transcrever, e pedidos em alíneas "a)", "b)"...
Regras do escritório:
- Use somente os fatos que estão nas publicações, nos documentos enviados e nas orientações. Não invente números de evento, datas, valores, nomes de perito, trechos de laudo ou de sentença. Quando faltar uma informação, escreva o marcador entre colchetes, ex.: [nº do evento], [data], e liste em "pendencias".
- Não cite jurisprudência com número de processo, relator ou data, a menos que esteja nos documentos enviados. Pode citar artigos de lei (CPC, CDC, Lei 10.259/2001, Lei 9.099/1995, CC).
- Manifestação ao laudo pericial: trate só do laudo (síntese, higidez técnica, concordância ou impugnação fundamentada, pedidos ligados ao laudo, como homologação, tutela de urgência e julgamento antecipado). Não repita os argumentos de mérito da inicial — isso soa como alegações finais.
- Recursos (recurso inominado, embargos): abra a fundamentação impugnando especificamente a decisão recorrida — transcreva o trecho atacado e rebata cada fundamento (dialeticidade). Sem a decisão nos documentos, deixe [transcrever o trecho da sentença] e avise em "pendencias".
- Inclua a tempestividade quando houver prazo, usando o prazo informado; se não souber as datas, use marcadores.
- Linguagem formal, clara, sem floreios; parágrafos de tamanho médio; use **negrito** só em nomes das partes e em expressões decisivas.
- Use aspas tipográficas “ ” dentro do texto (nunca aspas retas), para não quebrar o JSON.
Responda só com JSON, sem comentários:
{"enderecamento": string (ex.: "AO JUÍZO DA 6ª VARA FEDERAL DE JOINVILLE/SC – JUIZADO ESPECIAL FEDERAL CÍVEL"), "preambulo": string (do nome do autor até o verbo "apresentar"/"interpor"/"opor"), "titulo": string (nome da peça), "abertura": string ou "" (continuação logo após o título, ex.: "juntado no evento 69, pelos fundamentos de fato e de direito a seguir expostos."), "blocos": [{"tipo": "secao"|"paragrafo"|"citacao"|"marcador"|"alinea", "texto": string, "rotulo": string só para alinea, ex. "a)"}], "fecho": "Nestes termos, pede deferimento.", "pendencias": [string], "nomeArquivo": string curto sem extensão, ex. "Manifestacao_Laudo_-_Joao_Zacarias_x_C6"}

Exemplo de peça do escritório (referência de estilo e de estrutura; os fatos dele são de outro processo):
<<<
${EXEMPLO_PECA}
>>>`;
