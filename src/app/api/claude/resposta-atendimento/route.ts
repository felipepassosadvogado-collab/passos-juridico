import { medir } from "@/lib/operacao";
import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { pedirTexto, ErroClaude } from "@/lib/claude";
import { contatoDoCaso, lerResposta, promptRespostaAtendimento } from "@/lib/atendimentoWa";

export const maxDuration = 120;

/** o Claude escreve a resposta ao cliente do atendimento pré-processual, conforme as instruções do advogado */
async function tratar(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const b = await req.json().catch(() => ({}));
  const instrucoes = String(b.instrucoes || "").trim();
  if (!instrucoes) return erro("Diga ao Claude o que a mensagem deve dizer.");
  const { data: caso } = await m.sb.from("casos").select("id,nome,banco,contratos,etapa,obs,cliente_id").eq("id", String(b.casoId || "")).maybeSingle();
  if (!caso) return erro("Atendimento não encontrado.", 404);
  const ct = await contatoDoCaso(m.sb, caso, 20);
  // o que está na tela vale mais que o gravado (a pessoa pode ter acabado de digitar)
  const prompt = promptRespostaAtendimento({ nome: ct.nome || caso.nome, banco: b.banco ?? caso.banco, contratos: caso.contratos, etapa: caso.etapa, obs: b.obs ?? caso.obs, instrucoes, mensagemAtual: b.mensagemAtual, mensagens: ct.mensagens });
  try {
    const r = lerResposta(await pedirTexto([{ type: "text", text: prompt }], 2000));
    if (!r.mensagem) return erro("O Claude não devolveu a mensagem. Tente de novo.", 502);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroClaude) return erro(e.message, e.status);
    return erro("Não consegui escrever a mensagem agora. Tente de novo.", 500);
  }
}
export async function POST(req: Request) { return medir("claude.resposta_atendimento", () => tratar(req), {}, (r) => ({ status: r.status })); }
