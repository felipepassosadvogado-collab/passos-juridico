import { medir } from "@/lib/operacao";
import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { pedirTexto, ErroClaude } from "@/lib/claude";
import { faseCRM } from "@/lib/regras";
import { dataBR } from "@/lib/formato";
import { contatoDoCaso, lerResposta, promptRespostaAtendimento, type MsgCurta, type ProcessoResumo } from "@/lib/atendimentoWa";

export const maxDuration = 120;

/** o Claude escreve a mensagem ao cliente (do atendimento pré-processual ou do processo), conforme as instruções do advogado */
async function tratar(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const b = await req.json().catch(() => ({}));
  const instrucoes = String(b.instrucoes || "").trim();
  if (!instrucoes) return erro("Diga ao Claude o que a mensagem deve dizer.");
  let prompt: string;
  type P = { numero: string; mascara: string | null; cliente_id: string | null; cliente_nome: string | null; banco: string | null; reus: string[] | null; orgao: string | null; fase: string | null; ultimo_ato: string | null; ultima_data: string | null; notas: string | null };
  const CAMPOS = "numero,mascara,cliente_id,cliente_nome,banco,reus,orgao,fase,ultimo_ato,ultima_data,notas";
  const resumo = async (p: P, outros: P[] = []): Promise<ProcessoResumo> => {
    const { data: pubs } = await m.sb.from("publicacoes").select("data,tipo_doc,tipo_com,analise").eq("processo_numero", p.numero).order("data", { ascending: false }).limit(5);
    const andamentos = (pubs || []).map((x: { data: string; tipo_doc: string | null; tipo_com: string | null; analise: { resumo?: string } | null }) =>
      `${dataBR(x.data)} · ${x.tipo_doc && x.tipo_doc !== "Outros" ? x.tipo_doc : x.tipo_com || "publicação"}${x.analise?.resumo ? ": " + x.analise.resumo : ""}`);
    const notas = [p.notas, outros.length ? "Outros processos do cliente: " + outros.map((o) => `${o.mascara || o.numero} (${o.banco || (o.reus || [])[0] || "réu"}${faseCRM(o.fase) ? ", " + faseCRM(o.fase) : ""})`).join("; ") : ""].filter(Boolean).join(" · ") || null;
    return { processo: p.mascara || p.numero, orgao: p.orgao, fase: faseCRM(p.fase) || null, ultimoAto: p.ultimo_ato, ultimaData: p.ultima_data ? dataBR(p.ultima_data) : null, reus: p.reus || [], notas, andamentos };
  };
  if (b.conversaId) {
    // painel de WhatsApp: a conversa aberta; se o contato for cliente, o processo mais recente dele (e a lista dos outros)
    const { data: conv } = await m.sb.from("wa_conversas").select("id,nome,telefone,cliente_id").eq("id", String(b.conversaId)).maybeSingle();
    if (!conv) return erro("Conversa não encontrada.", 404);
    const { data: ms } = await m.sb.from("wa_mensagens").select("de_mim,texto,tipo,em,agente").eq("conversa_id", conv.id).order("em", { ascending: false }).limit(20);
    const mensagens = ((ms || []) as MsgCurta[]).reverse();
    const cli = conv.cliente_id ? (await m.sb.from("clientes").select("nome").eq("id", conv.cliente_id).maybeSingle()).data : null;
    const procs = conv.cliente_id ? ((await m.sb.from("processos").select(CAMPOS).eq("cliente_id", conv.cliente_id).order("ultima_data", { ascending: false, nullsFirst: false }).limit(6)).data || []) as P[] : [];
    const alvo = procs.find((x) => x.numero === String(b.processoNumero || "")) || procs[0];
    const nome = cli?.nome || conv.nome || "";
    prompt = alvo
      ? promptRespostaAtendimento({ nome, banco: alvo.banco, contratos: null, etapa: "", obs: null, instrucoes, mensagemAtual: b.mensagemAtual, mensagens, processo: await resumo(alvo, procs.filter((x) => x !== alvo)) })
      : promptRespostaAtendimento({ nome, banco: null, contratos: null, etapa: "", obs: null, instrucoes, mensagemAtual: b.mensagemAtual, mensagens });
  } else if (b.processoNumero) {
    const { data: p } = await m.sb.from("processos").select(CAMPOS).eq("numero", String(b.processoNumero)).maybeSingle<P>();
    if (!p) return erro("Processo não encontrado.", 404);
    const ct = await contatoDoCaso(m.sb, { cliente_id: p.cliente_id, obs: null }, 20);
    prompt = promptRespostaAtendimento({ nome: ct.nome || p.cliente_nome || "", banco: p.banco, contratos: null, etapa: "", obs: null, instrucoes, mensagemAtual: b.mensagemAtual, mensagens: ct.mensagens, processo: await resumo(p) });
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
