import JSZip from "jszip";
import { membroDaRota, erro } from "@/lib/rota";
import { MODELO_INICIAL_DOCX } from "@/modelos/modeloInicial";
import { bancoCurto, dataBR, idade, moeda, numeroBR, porExtenso, semAcento } from "@/lib/formato";
import type { Cliente } from "@/lib/tipos";
import { chaveBanco } from "@/lib/regras";

type Pedido = {
  clienteId: string; genero: "F" | "M"; cidadeJuizo: string; especie: string; nb: string; pagador: string; banco: string; bancoQualif: string;
  contratos: { numero: string; parcela: string; inclusao: string }[]; total: string; moral: string; indebitoAtualizado?: string; numero?: string | null; casoId?: string | null;
};
const xmlEsc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** gera a petição inicial em Word a partir do modelo do escritório */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const pi = await req.json().catch(() => null) as Pedido | null;
  if (!pi?.clienteId) return erro("Escolha o cliente.");
  const { data: cli } = await m.sb.from("clientes").select("*").eq("id", pi.clienteId).single<Cliente>();
  if (!cli) return erro("Cliente não encontrado.", 404);
  const cs = (pi.contratos || []).map((c) => ({ numero: (c.numero || "").trim(), parcela: numeroBR(c.parcela), inclusao: c.inclusao || "" })).filter((c) => c.numero);
  const falta = [];
  if (!cli.cpf) falta.push("CPF"); if (!cli.endereco) falta.push("endereço do cliente"); if (!pi.banco) falta.push("banco réu");
  if (!cs.length) falta.push("contrato"); if (!pi.especie) falta.push("espécie do benefício"); if (!pi.nb) falta.push("nº do benefício"); if (!numeroBR(pi.total)) falta.push("total descontado");
  if (falta.length) return erro("Falta: " + falta.join(", ") + ".");

  const F = pi.genero === "F", a = F ? "a" : "o";
  const tot = numeroBR(pi.total), dobro = tot * 2, moral = numeroBR(pi.moral), causa = (numeroBR(pi.indebitoAtualizado) || dobro) + moral;
  const anos = idade(cli.nascimento); const um = cs.length === 1;
  const fatos = um
    ? "ao contrato nº " + cs[0].numero + (cs[0].parcela ? ", no valor de parcela mensal de R$ " + moeda(cs[0].parcela) : "") + (cs[0].inclusao ? ", incluído em " + dataBR(cs[0].inclusao) : "")
    : "aos contratos nºs " + cs.map((c) => c.numero + (c.parcela ? " (parcela de R$ " + moeda(c.parcela) + (c.inclusao ? ", incluído em " + dataBR(c.inclusao) : "") + ")" : "")).join("; ").replace(/; ([^;]*)$/, " e $1");
  const nums = um ? cs[0].numero : cs.map((c) => c.numero).join(", ").replace(/, ([^,]*)$/, " e $1");
  const nac = (cli.nacionalidade || (F ? "brasileira" : "brasileiro")).toLowerCase();
  const qualif = [nac, (cli.estado_civil || "").toLowerCase(), (cli.profissao || "").toLowerCase(), "inscrit" + a + " no CPF sob o nº " + cli.cpf + (cli.rg ? ", portador" + (F ? "a" : "") + " do RG nº " + cli.rg : "")].filter(Boolean).join(", ");
  const bq = (pi.bancoQualif || "").trim();
  const V: Record<string, string> = {
    NOME: (cli.nome || "").toUpperCase(), QUALIF: qualif, A: a, ENDERECO: "em " + cli.endereco, CEP: cli.cep || "", CIDADE_UF: (cli.cidade || "").replace(/\s*\/\s*/, "/"),
    CIDADE_JUIZO: (pi.cidadeJuizo || "").toUpperCase(), PRIORIDADE: anos != null && anos >= 60 ? "TRAMITAÇÃO PRIORITÁRIA — IDOSO" : "",
    BANCO_NOME: pi.banco.toUpperCase(), BANCO_QUALIF: bq.startsWith(",") ? bq : ", " + bq, BANCO_NOME_CURTO: pi.banco,
    ESPECIE: pi.especie, NB: pi.nb, CONTRATOS_FATOS: fatos, FIRMADO: (um ? ", firmado" : ", firmados") + ", em tese, com o banco réu.",
    DO_CONTRATO: um ? "do contrato nº" : "dos contratos nºs", AO_CONTRATO: um ? "ao contrato nº" : "aos contratos nºs", CONTRATOS_NUM: nums,
    TOTAL: moeda(tot), TOTAL_EXT: porExtenso(tot), DOBRO: moeda(dobro), DOBRO_EXT: porExtenso(dobro), MORAL: moeda(moral), MORAL_EXT: porExtenso(moral),
    CAUSA: moeda(causa), CAUSA_EXT: porExtenso(causa), BANCO_PAGADOR: pi.pagador || "[banco pagador]",
    DATA_EXTENSO: new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "numeric", month: "long", year: "numeric" }),
  };
  const zip = await JSZip.loadAsync(Buffer.from(MODELO_INICIAL_DOCX, "base64"));
  let xml = await zip.file("word/document.xml")!.async("string");
  xml = xml.replace(/\{\{([A-Z_]+)\}\}/g, (x, k) => (k in V ? xmlEsc(V[k]) : x));
  zip.file("word/document.xml", xml);
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const nome = "Peticao_Inicial_" + bancoCurto(pi.banco).replace(/\W+/g, "") + "_e_INSS-_" + semAcento(cli.nome).toUpperCase().replace(/[^A-Z0-9]+/g, "_") + ".docx";

  // guarda a qualificação do banco para as próximas petições (só o titular grava a configuração)
  const kb = chaveBanco(pi.banco);
  if (kb && bq && !/\[/.test(bq) && m.perfil.papel === "titular") {
    const { data: g } = await m.sb.from("config").select("valor").eq("chave", "geral").maybeSingle();
    const valor = g?.valor || {}; if ((valor.bancosQualif || {})[kb] !== bq) await m.sb.from("config").upsert({ chave: "geral", valor: { ...valor, bancosQualif: { ...(valor.bancosQualif || {}), [kb]: bq } } }, { onConflict: "chave" });
  }
  const ev = { tipo: "comentario", dados: { texto: "Petição inicial gerada a partir do modelo (" + nome + ")." }, por: m.user.id };
  if (pi.numero) await m.sb.from("eventos").insert({ ...ev, processo_numero: pi.numero });
  else if (pi.casoId) await m.sb.from("eventos").insert({ ...ev, caso_id: pi.casoId });

  return new Response(new Uint8Array(buf), { headers: {
    "content-type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "content-disposition": `attachment; filename="${nome}"`, "x-nome-arquivo": encodeURIComponent(nome),
  } });
}
