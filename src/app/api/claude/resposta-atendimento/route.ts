import { medir } from "@/lib/operacao";
import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { pedirTexto, ErroClaude } from "@/lib/claude";
import { faseCRM } from "@/lib/regras";
import { dataBR } from "@/lib/formato";
import { contatoDoCaso, lerResposta, promptRespostaAtendimento, type ProcessoResumo } from "@/lib/atendimentoWa";

export const maxDuration = 120;

/** o Claude escreve a mensagem ao cliente (do atendimento pré-processual ou do processo), conforme as instruções do advogado */
async function tratar(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const b = await req.json().catch(() => ({}));
  const instrucoes = String(b.instrucoes || "").trim();
  if (!instrucoes) return erro("Diga ao Claude o que a mensagem deve dizer.");
  let prompt: string;
  if (b.processoNumero) {
    const { data: p } = await m.sb.from("processos").select("numero,mascara,cliente_id,cliente_nome,banco,reus,orgao,fase,ultimo_ato,ultima_data,notas").eq("numero", String(b.processoNumero)).maybeSingle();
    if (!p) return erro("Processo não encontrado.", 404);
    const ct = await contatoDoCaso(m.sb, { cliente_id: p.cliente_id, obs: null }, 20);
    const { data: pubs } = await m.sb.from("publicacoes").select("data,tipo_doc,tipo_com,analise").eq("processo_numero", p.numero).order("data", { ascending: false }).limit(5);
    const andamentos = (pubs || []).map((x: { data: string; tipo_doc: string | null; tipo_com: string | null; analise: { resumo?: string } | null }) =>
      `${dataBR(x.data)} · ${x.tipo_doc && x.tipo_doc !== "Outros" ? x.tipo_doc : x.tipo_com || "publicação"}${x.analise?.resumo ? ": " + x.analise.resumo : ""}`);
    const processo: ProcessoResumo = { processo: p.mascara || p.numero, orgao: p.orgao, fase: faseCRM(p.fase) || null, ultimoAto: p.ultimo_ato, ultimaData: p.ultima_data ? dataBR(p.ultima_data) : null, reus: p.reus || [], notas: p.notas, andamentos };
    prompt = promptRespostaAtendimento({ nome: ct.nome || p.cliente_nome || "", banco: p.banco, contratos: null, etapa: "", obs: null, instrucoes, mensagemAtual: b.mensagemAtual, mensagens: ct.mensagens, processo });
  } else {
    const { data: caso } = await m.sb.from("casos").select("id,nome,banco,contratos,etapa,obs,cliente_id").eq("id", String(b.casoId || "")).maybeSingle();
    if (!caso) return erro("Atendimento não encontrado.", 404);
    const ct = await contatoDoCaso(m.sb, caso, 20);
    prompt = promptRespostaAtendimento({ nome: ct.nome || caso.nome, banco: caso.banco, contratos: caso.contratos, etapa: caso.etapa, obs: caso.obs, instrucoes, mensagemAtual: b.mensagemAtual, mensagens: ct.mensagens });
  }
  try {
    const r = lerResposta(await pedirTexto([{ type: "text", text: prompt }], 2000));
    if (!r.mensagem) return erro("O Claude não devolveu a mensagem. Tente de novo.", 502);
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErroClaude) return erro(e.message, e.status);
    return erro("Não consegui escrever a mensagem agora. Tente de novo.", 500);
  }
}
export async function POST(req: Request) { return medir("claude.resposta_cliente", () => tratar(req), {}, (r) => ({ status: r.status })); }
