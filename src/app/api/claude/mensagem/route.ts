import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { pedirJson, ErroClaude } from "@/lib/claude";
import { MODALIDADES } from "@/lib/regras";
import { bancoCurto, dataBR, nomeBonito } from "@/lib/formato";
import type { Modalidade } from "@/lib/tipos";

export const maxDuration = 120;

const corte = (s: string | null | undefined, n: number) => ((s || "").length > n ? (s || "").slice(0, n) + " […]" : s || "");

/** escreve com o Claude a mensagem de WhatsApp ao cliente, a partir do aviso (local, orientações) e da publicação que o originou */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const b = await req.json().catch(() => ({}));
  const { data: av } = await m.sb.from("avisos_cliente").select("*").eq("id", String(b.avisoId || "")).maybeSingle();
  if (!av) return erro("Aviso não encontrado.", 404);
  // o que está na tela vale mais que o gravado (a pessoa pode ter acabado de digitar)
  const tipo = b.tipo_evento ?? av.tipo_evento, modalidade = (b.modalidade ?? av.modalidade) as Modalidade | null, data = b.data_evento ?? av.data_evento,
    hora = (b.hora ?? av.hora ?? "").slice(0, 5), local = b.local ?? av.local, orientacoes = b.orientacoes ?? av.orientacoes, link = b.link ?? av.link;
  const { data: p } = await m.sb.from("processos").select("numero,mascara,cliente_nome,cliente_id,banco,orgao,cidade").eq("numero", av.processo_numero).maybeSingle();
  const { data: cli } = p?.cliente_id ? await m.sb.from("clientes").select("nome").eq("id", p.cliente_id).maybeSingle() : { data: null };
  const { data: pub } = av.publicacao_id ? await m.sb.from("publicacoes").select("data,tipo_doc,orgao,texto").eq("id", av.publicacao_id).maybeSingle() : { data: null };
  const nome = nomeBonito(cli?.nome || p?.cliente_nome || "").split(" ")[0] || "";
  const ctx = [
    `Cliente: ${nomeBonito(cli?.nome || p?.cliente_nome || "")} (chame pelo primeiro nome: ${nome || "não informado"})`,
    `Processo: ${p?.mascara || av.processo_numero}${p?.banco ? " · contra o " + bancoCurto(p.banco) : ""}${p?.orgao ? " · " + p.orgao : ""}`,
    `O que foi marcado: ${tipo || "não informado"}`,
    `Como vai ser: ${modalidade ? MODALIDADES[modalidade]?.nome : "não informado"}`,
    `${modalidade === "jf_balcao" ? "Até o dia" : "Data"}: ${data ? dataBR(data) : "não informada"}${hora ? " · hora: " + hora : ""}`,
    link ? `Link da sala virtual: ${link}` : "",
    `Local: ${local || "não informado"}`,
    `Orientações ao cliente (anotadas pela equipe): ${orientacoes || "nenhuma"}`,
    pub ? `Publicação que originou o aviso (${pub.tipo_doc || "ato"} de ${dataBR(pub.data)}, ${pub.orgao || ""}):\n${corte(pub.texto, 6000)}` : "",
    b.mensagemAtual ? `Mensagem atual (rascunho, pode ser reescrita):\n${corte(b.mensagemAtual, 2000)}` : "",
  ].filter(Boolean).join("\n");
  const prompt = `Você escreve, para o escritório Passos Advocacia (Joinville/SC), uma mensagem de WhatsApp para um cliente aposentado ou pensionista, avisando de um ato do processo dele.
Regras:
- Português simples, frases curtas, tom acolhedor e respeitoso, sem juridiquês (explique em palavras simples o que é a perícia, a coleta de assinaturas, a audiência etc.).
- Comece com "Olá, ${nome || "tudo bem"}! Aqui é do escritório Passos Advocacia."
- Diga claramente O QUE é, QUANDO (dia por extenso e hora, ou o prazo "até o dia"), ONDE (endereço/local completo como informado) e O QUE LEVAR/COMO SE PREPARAR.
- Use o Local e as Orientações da equipe e confira com a publicação: se houver informação na publicação que a equipe não anotou (endereço, telefone da secretaria, documentos, prazo), inclua; se houver CONTRADIÇÃO entre o que a equipe anotou e a publicação, não invente: siga a publicação e aponte em "alertas".
- Não invente datas, horários, endereços nem telefones que não estejam no contexto. Se faltar algo essencial, escreva a mensagem sem isso e aponte em "alertas".
- No máximo uns 900 caracteres, em 3 a 5 parágrafos curtos, sem emojis em excesso (no máximo 1), sem markdown.
- Termine pedindo que o cliente responda confirmando que recebeu.
Responda só com JSON: {"mensagem": string, "alertas": [strings curtas para a equipe, ou vazio]}

Contexto:
${ctx}`;
  try {
    const r = await pedirJson<{ mensagem?: string; alertas?: string[] }>([{ type: "text", text: prompt }], 1500);
    if (!r?.mensagem) return erro("O Claude não devolveu a mensagem. Tente de novo.", 502);
    return NextResponse.json({ mensagem: r.mensagem.trim(), alertas: Array.isArray(r.alertas) ? r.alertas.slice(0, 5) : [] });
  } catch (e) {
    if (e instanceof ErroClaude) return erro(e.message, e.status);
    return erro("Não consegui escrever a mensagem agora. Tente de novo.", 500);
  }
}
