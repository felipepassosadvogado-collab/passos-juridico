// Kit procuração (procuração, contrato de honorários, declaração de hipossuficiência e declaração de residência)
// a partir do modelo do escritório, com os dados da ficha do cliente.
import JSZip from "jszip";

export type DadosKit = {
  nome: string; nacionalidade?: string; estadoCivil?: string; profissao?: string; cpf?: string; endereco?: string; cep?: string; cidade?: string;
  telefone?: string; email?: string; feminino: boolean; banco: string; pct: number; contratos: { numero: string; averbacao: string; parcela: string }[];
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const U = ["", "um", "dois", "três", "quatro", "cinco", "seis", "sete", "oito", "nove", "dez", "onze", "doze", "treze", "quatorze", "quinze", "dezesseis", "dezessete", "dezoito", "dezenove"];
const D = ["", "", "vinte", "trinta", "quarenta", "cinquenta", "sessenta", "setenta", "oitenta", "noventa"];
function ate100(n: number) { if (n === 100) return "cem"; if (n < 20) return U[n] || "zero"; const d = Math.floor(n / 10), u = n % 10; return u ? `${D[d]} e ${U[u]}` : D[d]; }
/** "30% (trinta por cento)"; aceita uma casa decimal: "33,5% (trinta e três vírgula cinco por cento)" */
export function pctExtenso(p: number) {
  const n = Math.round(p * 10) / 10; const i = Math.floor(n), dec = Math.round((n - i) * 10);
  return `${String(n).replace(".", ",")}% (${ate100(i)}${dec ? " vírgula " + U[dec] : ""} por cento)`;
}
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export function faltasKit(d: DadosKit) {
  return [["nome", d.nome], ["CPF", d.cpf], ["endereço", d.endereco], ["CEP", d.cep], ["cidade", d.cidade], ["banco réu", d.banco]].filter(([, v]) => !String(v || "").trim()).map(([k]) => k as string);
}

export async function montarKit(modeloBase64: string, d: DadosKit): Promise<Blob> {
  const zip = await JSZip.loadAsync(modeloBase64, { base64: true });
  let xml = await zip.file("word/document.xml")!.async("string");
  const hoje = new Date(); const dia = hoje.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric" });
  const mes = MESES[+hoje.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(5, 7) - 1]; const ano = hoje.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 4);
  const f = d.feminino; const ph = (s?: string, falta = "") => (s || "").trim() || falta;
  const qualif = [ph(d.nacionalidade, f ? "brasileira" : "brasileiro"), ph(d.estadoCivil, "[estado civil]"), ph(d.profissao, "[profissão]")].join(", ").toLowerCase();
  const endereco = [ph(d.endereco, "[endereço]"), "CEP " + ph(d.cep, "[CEP]"), ph(d.cidade, "[cidade/UF]")].join(", ");
  const V: Record<string, string> = {
    NOME: ph(d.nome, "[NOME]").toUpperCase(), QUALIF: qualif, CPF: ph(d.cpf, "[CPF]"), ENDERECO: endereco, O: f ? "a" : "o",
    BANCO: ph(d.banco, "[banco réu]"), BANCO_MAI: ph(d.banco, "[BANCO RÉU]").toUpperCase(), PCT: pctExtenso(d.pct),
    FONE: ph(d.telefone, "________________"), EMAIL: ph(d.email, "________________________________"),
    DATA: `${dia} de ${mes} de ${ano}`, DATA_MIN: `${dia} de ${mes.toLowerCase()} de ${ano}`,
  };
  // contratos: "Contrato nº X, averbado em Y, parcela de R$ Z" (número, data e valor em negrito)
  xml = xml.replace(/<w:r>(?:(?!<w:r>).)*?\{\{CONTRATOS\}\}.*?<\/w:r>|<w:r [^>]*>(?:(?!<w:r[ >]).)*?\{\{CONTRATOS\}\}.*?<\/w:r>/s, (run) => {
    const rpr = (run.match(/<w:rPr>.*?<\/w:rPr>/s) || ["<w:rPr></w:rPr>"])[0]; const rprB = rpr.replace("<w:rPr>", "<w:rPr><w:b/><w:bCs/>");
    const r = (t: string, b = false) => `<w:r>${b ? rprB : rpr}<w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
    const cs = d.contratos.filter((c) => c.numero.trim() || c.parcela.trim()); const lista = cs.length ? cs : [{ numero: "[nº do contrato]", averbacao: "[data]", parcela: "[valor]" }];
    return lista.map((c, i) => (i ? r("; ") : "") + r("Contrato nº ") + r(c.numero || "[nº]", true) + r(",  averbado em ") + r(c.averbacao || "[data]", true) + r(",  parcela de R$ ") + r(c.parcela || "[valor]", true)).join("");
  });
  xml = xml.replace(/\{\{([A-Z_]+)\}\}/g, (x, k) => (k in V ? esc(V[k]) : x));
  zip.file("word/document.xml", xml);
  return zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}
