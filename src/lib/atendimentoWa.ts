// Resposta ao cliente a partir da ficha do atendimento pré-processual: acha a conversa de WhatsApp
// (pela ficha do cliente, pelo telefone anotado pela assistente virtual ou pelo telefone da ficha)
// e monta o pedido ao Claude para escrever a mensagem conforme as instruções do advogado.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { chaveFone, soFone } from "./whatsapp";
import { bancoCurto, nomeBonito } from "./formato";

type Sb = { from: (t: string) => any };
export type MsgCurta = { de_mim: boolean; texto: string | null; tipo: string | null; em: string; agente?: boolean | null };
export type ContatoCaso = {
  conversaId: string | null; nome: string | null; telefone: string | null; clienteId: string | null;
  /** telefone que não está em ficha de cliente nenhum (veio só da anotação da assistente) */
  avulso: boolean; mensagens: MsgCurta[];
};

/** telefone anotado pela assistente virtual ao abrir o atendimento ("Pelo WhatsApp (5547…)") */
export function foneDaObs(obs?: string | null) {
  const m = /Pelo WhatsApp \(([^)]*)\)/i.exec(obs || ""); const f = soFone(m?.[1] || "");
  return f.length >= 12 ? f : null;
}
/** primeiro telefone válido do campo da ficha (pode trazer vários: "47 9999-0000 / 47 98888-1111") */
export function primeiroFone(campo?: string | null) {
  for (const t of String(campo || "").split(/[\/,;]| e /)) { const f = soFone(t); if (f.length >= 12) return f; }
  return null;
}

async function conversaPorFone(sb: Sb, fone: string) {
  const { data } = await sb.from("wa_conversas").select("id,nome,telefone,cliente_id,ultima_em").ilike("telefone", "%" + fone.slice(-8));
  const k = chaveFone(fone);
  return ((data || []) as any[]).filter((c) => chaveFone(c.telefone) === k).sort((a, b) => String(b.ultima_em || "").localeCompare(String(a.ultima_em || "")))[0] || null;
}

/** contato do atendimento e as últimas mensagens trocadas com ele */
export async function contatoDoCaso(sb: Sb, caso: { cliente_id: string | null; obs: string | null }, limite = 14): Promise<ContatoCaso> {
  let conv: any = null; let cli: any = null;
  if (caso.cliente_id) {
    cli = (await sb.from("clientes").select("id,nome,telefone").eq("id", caso.cliente_id).maybeSingle()).data;
    conv = ((await sb.from("wa_conversas").select("id,nome,telefone,cliente_id,ultima_em").eq("cliente_id", caso.cliente_id).order("ultima_em", { ascending: false }).limit(1)).data || [])[0] || null;
  }
  const daObs = foneDaObs(caso.obs);
  if (!conv && daObs) conv = await conversaPorFone(sb, daObs);
  const daFicha = primeiroFone(cli?.telefone);
  if (!conv && daFicha) conv = await conversaPorFone(sb, daFicha);
  const telefone = conv?.telefone || daObs || daFicha || null;
  let mensagens: MsgCurta[] = [];
  if (conv) {
    const { data } = await sb.from("wa_mensagens").select("de_mim,texto,tipo,em,agente").eq("conversa_id", conv.id).order("em", { ascending: false }).limit(limite);
    mensagens = ((data || []) as MsgCurta[]).reverse();
  }
  return { conversaId: conv?.id || null, nome: cli?.nome || conv?.nome || null, telefone, clienteId: caso.cliente_id || conv?.cliente_id || null, avulso: !conv && !caso.cliente_id, mensagens };
}

/** pedido ao Claude: a resposta segue as instruções do advogado, com o caso e a conversa como contexto */
export type ProcessoResumo = { processo: string; orgao: string | null; fase: string | null; ultimoAto: string | null; ultimaData: string | null; reus: string[]; notas: string | null; andamentos: string[] };
export function promptRespostaAtendimento(o: { nome: string; banco: string | null; contratos: string | null; etapa: string; obs: string | null; instrucoes: string; mensagemAtual?: string; mensagens: MsgCurta[]; processo?: ProcessoResumo }) {
  const primeiro = nomeBonito(o.nome || "").split(" ")[0] || "";
  const conversa = o.mensagens.filter((m) => m.texto).slice(-14)
    .map((m) => `${m.de_mim ? (m.agente ? "Escritório (assistente virtual)" : "Escritório") : "Cliente"}: ${String(m.texto).replace(/\s+/g, " ").slice(0, 500)}`).join("\n");
  const corte = (s: string | null | undefined, n: number) => ((s || "").length > n ? (s || "").slice(0, n) + " […]" : s || "");
  const pr = o.processo;
  const quem = pr ? "um cliente do escritório que tem um processo em andamento" : "uma pessoa que procurou o escritório (atendimento inicial, ainda sem processo)";
  const sobre = pr ? `Processo:
Cliente: ${nomeBonito(o.nome || "")}
Número: ${pr.processo}${pr.orgao ? " · " + pr.orgao : ""}
Réus: ${pr.reus.map((r) => nomeBonito(r)).join("; ") || "não informado"}
Fase no CRM: ${pr.fase || "não classificada"}
Último ato: ${pr.ultimoAto || "não informado"}${pr.ultimaData ? " (" + pr.ultimaData + ")" : ""}
${pr.notas ? "Anotações do processo:\n" + corte(pr.notas, 2000) + "\n" : ""}${pr.andamentos.length ? "Últimos andamentos (do mais recente):\n" + pr.andamentos.map((a) => "- " + corte(a, 400)).join("\n") : ""}` : `Atendimento:
Pessoa: ${nomeBonito(o.nome || "")}
Banco/réu informado: ${o.banco ? bancoCurto(o.banco) + " (" + o.banco + ")" : "não informado"}
${o.contratos ? "Contratos: " + o.contratos + "\n" : ""}Etapa no CRM: ${o.etapa}
Anotações do atendimento:
${corte(o.obs, 3000) || "nenhuma"}`;
  return `Você escreve, para o escritório Passos Advocacia (Joinville/SC), a mensagem de WhatsApp que o advogado pediu para ${quem}.
O PRINCIPAL são as INSTRUÇÕES DO ADVOGADO abaixo: a mensagem deve dizer exatamente o que ele decidiu, com essa intenção, e nada além disso.
Regras:
- Português simples, frases curtas, tom acolhedor e respeitoso, sem juridiquês. Muitos clientes são aposentados ou pensionistas.
- Comece com "Olá, ${primeiro || "tudo bem"}! Aqui é do escritório Passos Advocacia." — se a conversa abaixo já estiver em andamento hoje, pode começar só com "${primeiro ? primeiro + ", " : ""}" e ir direto ao ponto.
- Responda ao que a pessoa perguntou ou contou na conversa, quando isso tiver a ver com as instruções.
- Se as instruções disserem que a pessoa NÃO tem direito ou que o escritório não vai assumir o caso: diga com delicadeza e clareza, explique o motivo em palavras simples usando só o que estiver nas instruções, agradeça a confiança e não deixe esperança falsa. Não indique outro advogado nem outro escritório, a não ser que as instruções peçam.
- Ao falar do processo, explique o ato em palavras simples (o que aconteceu e o que vem agora), sem número de evento nem termos técnicos.
- Não invente fatos, valores, prazos, chances de êxito nem promessas de resultado. Nunca garanta que a pessoa vai ganhar. Se faltar um dado que a mensagem precisa, escreva sem ele e aponte em "conferir".
- No máximo uns 900 caracteres, 2 a 5 parágrafos curtos, no máximo 1 emoji, sem markdown.
- Termine de forma natural, pedindo resposta quando a mensagem pedir algo à pessoa.
Formato da resposta (texto puro, sem JSON e sem comentários antes): primeiro a mensagem pronta; depois, se houver algo para a equipe conferir, uma linha só com ===CONFERIR=== e, abaixo, um item por linha começando com "- ".

INSTRUÇÕES DO ADVOGADO:
${corte(o.instrucoes, 2000)}

${sobre}
${conversa ? `\nÚltimas mensagens no WhatsApp (da mais antiga para a mais recente):\n${conversa}\n` : "\n(Ainda não há conversa registrada no WhatsApp do sistema.)\n"}${o.mensagemAtual?.trim() ? `\nRascunho atual (pode ser reescrito):\n${corte(o.mensagemAtual, 2000)}\n` : ""}`;
}

/** separa a mensagem dos itens a conferir */
export function lerResposta(t: string) {
  const [msg, conf = ""] = t.split(/^\s*={2,}\s*CONFERIR\s*={2,}\s*$/m);
  return { mensagem: (msg || "").replace(/^```\w*\s*|```\s*$/g, "").trim(), alertas: conf.split("\n").map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).filter(Boolean).slice(0, 5) };
}
