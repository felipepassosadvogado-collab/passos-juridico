// Agente do WhatsApp: atende os clientes com o Claude, consultando os processos no sistema.
// Só fala do processo depois de confirmar a identidade (CPF + telefone da ficha, ou CPF + data de nascimento).
// Modos (config "agente"): desligado · rascunho (sugere a resposta, a equipe envia) · automatico (responde sozinho).
import { MODELO } from "./claude";
import { dataBR, idade, nomeBonito } from "./formato";
import { enviarTextoNaConversa, foneBate, type Adm } from "./whatsappDb";

export type ConfigAgente = { modo?: "desligado" | "rascunho" | "automatico"; nome?: string; horario?: string; avisoGolpe?: string; instrucoes?: string };
export const AVISO_GOLPE_PADRAO = "Atenção ao golpe do falso advogado: este é o único WhatsApp oficial do escritório, (47) 99642-4673. Nós nunca pedimos pagamento, PIX ou depósito para liberar valores de processo. Se alguém entrar em contato em nome do escritório pedindo dinheiro, não pague e fale com a gente por aqui.";
type Conv = { id: string; jid: string; telefone: string | null; nome: string | null; cliente_id: string | null; atendimento: string; equipe_ate: string | null; aguardando_equipe: boolean; agente_estado: Record<string, any>; saudado_em: string | null; agente_lock: string | null }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Msg = { id: string; de_mim: boolean; texto: string | null; tipo: string; anexo_nome: string | null; em: string; agente: boolean };
const soDig = (s?: string | null) => String(s || "").replace(/\D/g, "");
const corte = (s: string | null | undefined, n: number) => ((s || "").length > n ? (s || "").slice(0, n) + " […]" : s || "");
const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

const FERRAMENTAS = [
  { name: "identificar_cliente", description: "Confere a identidade pelo CPF (e, se pedido, pela data de nascimento) e devolve os processos e atendimentos do cliente. Use antes de falar de qualquer processo.",
    input_schema: { type: "object", properties: { cpf: { type: "string", description: "CPF informado pelo cliente" }, data_nascimento: { type: "string", description: "DD/MM/AAAA, só se a ferramenta pedir" } }, required: ["cpf"] } },
  { name: "consultar_processo", description: "Todos os andamentos de um processo do cliente já identificado: publicações (com o texto), fase, juízo, réus, próximos compromissos (perícia, audiência, coleta) e o que a equipe está preparando.",
    input_schema: { type: "object", properties: { numero: { type: "string", description: "número do processo (só dígitos ou com máscara)" } }, required: ["numero"] } },
  { name: "transferir_para_equipe", description: "Passa a conversa para uma pessoa da equipe (o cliente pediu, o assunto é jurídico/financeiro, reclamação, documento enviado, ou você não sabe responder). Escreva um resumo útil para quem vai assumir.",
    input_schema: { type: "object", properties: { motivo: { type: "string" }, resumo: { type: "string", description: "o que o cliente quer, dados já informados, o que já foi respondido" } }, required: ["motivo", "resumo"] } },
  { name: "registrar_novo_atendimento", description: "Para quem ainda não é cliente e quer entrar com ação: registra o caso no CRM com o resumo e avisa a equipe. Chame quando já tiver entendido o problema (nome, cidade, banco, o que aconteceu, desde quando).",
    input_schema: { type: "object", properties: { nome: { type: "string" }, cidade: { type: "string" }, banco: { type: "string" }, resumo_do_caso: { type: "string", description: "resumo claro para o advogado: o que aconteceu, valores, datas, documentos que a pessoa tem" } }, required: ["nome", "resumo_do_caso"] } },
];

function instrucoes(cfg: ConfigAgente, conv: Conv, ctx: { fichaPeloFone: string | null; identificado: string | null; agora: string; hora: number; diaUtil: boolean }) {
  const nome = cfg.nome?.trim() || "Ana";
  const horario = cfg.horario?.trim() || "segunda a sexta, das 9h às 18h";
  const expediente = ctx.diaUtil && ctx.hora >= 9 && ctx.hora < 18;
  return `Você é ${nome}, da equipe de atendimento do escritório Passos Advocacia (Felipe dos Passos Silva, OAB/SC 58.547, Rua Dona Francisca, 260, sala 1804, Centro, Joinville/SC), que defende aposentados e pensionistas em ações contra bancos e o INSS por empréstimos consignados não contratados, e outros benefícios do INSS. Você atende pelo WhatsApp oficial do escritório.

QUEM VOCÊ É: a assistente virtual do escritório, que trabalha junto com a equipe. Escreva de um jeito humano, caloroso e acolhedor, como uma atendente atenciosa de um escritório pequeno: chame pelo primeiro nome, frases curtas, português simples, sem juridiquês, no máximo 1 emoji quando fizer sentido. Nunca diga que é uma pessoa, advogada ou estagiária. Se perguntarem se é robô ou pessoa, diga com naturalidade que é a assistente virtual do escritório e que, quando precisar, passa para alguém da equipe na hora.

AGORA: ${ctx.agora} (horário de Brasília). Atendimento da equipe: ${horario}. ${expediente ? "Estamos no horário da equipe." : "Estamos FORA do horário da equipe: se transferir, diga que a equipe responde no próximo horário de atendimento."}

${conv.saudado_em ? "Você já cumprimentou esta pessoa antes: não repita a saudação nem o aviso do golpe." : `PRIMEIRA MENSAGEM DESTA CONVERSA: comece dando as boas-vindas ao escritório, apresente-se como ${nome}, a assistente virtual da Passos Advocacia, e dê este aviso com suas palavras, de forma acolhedora e clara: "${cfg.avisoGolpe?.trim() || AVISO_GOLPE_PADRAO}". Depois pergunte como pode ajudar (consultar um processo, falar com a equipe ou um assunto novo). Separe a saudação e o aviso em mensagens diferentes.`}

COMO ATENDER:
1. Consulta de processo: peça o CPF do titular. Chame identificar_cliente. Se a ferramenta pedir a data de nascimento, peça. Nunca conte nada sobre processos, valores, datas ou nomes antes da confirmação. Se não confirmar, explique com delicadeza que, por segurança, vai passar para a equipe, e transfira.
2. Com o cliente identificado: se tiver mais de um processo, diga quais são (contra qual banco) e pergunte qual quer ver. Chame consultar_processo e LEIA TODOS os andamentos com atenção, do mais antigo ao mais recente, antes de responder.
3. Explique a situação como um advogado atencioso explicaria a um aposentado: em que fase está, o que aconteceu de mais recente e o que isso significa na prática, qual é o próximo passo e o que o cliente precisa fazer (se precisar). Se houver perícia, coleta ou audiência marcada, diga a data, a hora e o local. Seja fiel ao que está nos autos; não invente nem suponha.
4. NUNCA: prometa resultado, diga que vai ganhar, estime valores a receber, diga quando o dinheiro sai, fale de honorários, acordos ou estratégia, ou dê opinião sobre o mérito. Para isso (e para qualquer dúvida jurídica que vá além do andamento), diga que vai pedir para a equipe responder e use transferir_para_equipe.
5. Se a pessoa pedir para falar com alguém, com o advogado ou com a atendente, transfira na hora, sem insistir.
6. Pessoa que ainda não é cliente e tem um problema novo: acolha, entenda o caso com calma (nome, cidade, qual banco ou benefício, o que aconteceu, desde quando, se tem o extrato do INSS), uma pergunta por vez, e então use registrar_novo_atendimento com um resumo bem feito. Diga que a equipe vai analisar e retornar. Não diga que o caso tem direito ou chance.
7. Áudio: você não consegue ouvir; peça com gentileza para escrever, ou transfira se a pessoa preferir áudio. Foto ou documento enviado: agradeça e transfira para a equipe analisar.
8. Mensagens curtas, como no WhatsApp: até 3 parágrafos curtos. Para mandar em mensagens separadas, separe com uma linha contendo só ---.
9. Não use markdown (sem ** ou #). Não repita informações que já deu.

${ctx.identificado ? `CLIENTE JÁ IDENTIFICADO nesta conversa (id ${ctx.identificado}). Pode consultar os processos dele.` : ctx.fichaPeloFone ? `Este telefone está na ficha de ${ctx.fichaPeloFone}, mas ainda não houve confirmação pelo CPF nesta conversa.` : "Este telefone não está na ficha de nenhum cliente."}
${cfg.instrucoes?.trim() ? "\nORIENTAÇÕES DO ESCRITÓRIO:\n" + cfg.instrucoes.trim() : ""}`;
}

type Ctx = { adm: Adm; conv: Conv; acoes: string[] };

async function identificar(c: Ctx, cpf: string, nasc?: string) {
  const d = soDig(cpf); if (d.length !== 11) return { erro: "CPF incompleto: peça os 11 dígitos." };
  const { data: lista } = await c.adm.from("clientes").select("id,nome,cpf,telefone,nascimento").not("cpf", "is", null).limit(5000);
  const cli = (lista || []).find((x: { cpf: string }) => soDig(x.cpf) === d);
  const est = c.conv.agente_estado || {};
  if (!cli) return { encontrado: false, orientacao: "Não há cliente com esse CPF. Confirme o número; se a pessoa for nova, trate como novo atendimento." };
  let ok = foneBate(cli.telefone, c.conv.telefone);
  if (!ok) {
    if (!cli.nascimento) return { encontrado: true, confirmado: false, orientacao: "Não dá para confirmar a identidade por aqui (telefone diferente da ficha). Transfira para a equipe, com delicadeza." };
    if (!nasc) return { encontrado: true, confirmado: false, precisa: "data_nascimento", orientacao: "Peça a data de nascimento do titular para confirmar." };
    const [dd, mm, aa] = (nasc.match(/\d+/g) || []); const iso = aa && mm && dd ? `${aa.length === 2 ? "19" + aa : aa}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}` : "";
    ok = iso === cli.nascimento;
    if (!ok) {
      const t = (est.tentativas || 0) + 1; await salvarEstado(c, { tentativas: t });
      return { encontrado: true, confirmado: false, orientacao: t >= 3 ? "Não confirmou após várias tentativas. Transfira para a equipe." : "A data não confere. Peça para conferir." };
    }
  }
  await salvarEstado(c, { identificado: cli.id, identificado_em: new Date().toISOString(), tentativas: 0 });
  if (!c.conv.cliente_id) { await c.adm.from("wa_conversas").update({ cliente_id: cli.id }).eq("id", c.conv.id); c.conv.cliente_id = cli.id; }
  const [{ data: ps }, { data: cs }] = await Promise.all([
    c.adm.from("processos").select("numero,mascara,banco,reus,fase,orgao,ultima_data,ultimo_ato").eq("cliente_id", cli.id),
    c.adm.from("casos").select("id,banco,etapa,criado_em,processo_numero").eq("cliente_id", cli.id).is("processo_numero", null),
  ]);
  c.acoes.push(`identificou ${nomeBonito(cli.nome)}`);
  return { confirmado: true, primeiro_nome: nomeBonito(cli.nome).split(" ")[0], idade: idade(cli.nascimento),
    processos: (ps || []).map((p: Record<string, any>) => ({ numero: p.mascara || p.numero, contra: (p.reus || []).join(" e ") || p.banco, fase: p.fase, juizo: p.orgao, ultimo_andamento: p.ultima_data ? dataBR(p.ultima_data) + " · " + (p.ultimo_ato || "") : null })), // eslint-disable-line @typescript-eslint/no-explicit-any
    atendimentos_sem_processo: (cs || []).map((x: Record<string, any>) => ({ contra: x.banco || "banco a definir", etapa: x.etapa, desde: dataBR(String(x.criado_em).slice(0, 10)) })) }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function consultar(c: Ctx, numero: string) {
  const id = c.conv.agente_estado?.identificado; if (!id) return { erro: "Identifique o cliente pelo CPF antes." };
  const n = soDig(numero);
  const { data: dele } = await c.adm.from("processos").select("*").eq("cliente_id", id);
  const p = n.length >= 7 ? (dele || []).find((x: { numero: string }) => x.numero === n || x.numero.includes(n)) : null;
  if (!p) return { erro: "Esse processo não é deste cliente. Pergunte qual dos processos listados ele quer." };
  const hoje = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const [{ data: pubs }, { data: avs }, { data: ts }] = await Promise.all([
    c.adm.from("publicacoes").select("data,tipo_doc,tipo_com,orgao,texto,analise").eq("processo_numero", p.numero).order("data", { ascending: true }).limit(60),
    c.adm.from("avisos_cliente").select("tipo_evento,data_evento,hora,local,modalidade,orientacoes,link").eq("processo_numero", p.numero).gte("data_evento", hoje),
    c.adm.from("tarefas").select("tipo,vencimento,status").eq("processo_numero", p.numero).neq("status", "feito"),
  ]);
  // orçamento de texto: as mais recentes vão inteiras, as antigas resumidas
  const lista = (pubs || []) as Record<string, any>[]; let orc = 45000; // eslint-disable-line @typescript-eslint/no-explicit-any
  const andamentos = lista.slice().reverse().map((x) => {
    const an = x.analise as { ato?: string; resumo?: string } | null; const lim = orc > 20000 ? 4000 : orc > 5000 ? 800 : 200; const t = corte(x.texto, lim); orc -= t.length;
    return { data: dataBR(x.data), tipo: x.tipo_doc || x.tipo_com, orgao: x.orgao, resumo_do_sistema: an ? [an.ato, an.resumo].filter(Boolean).join(": ") : null, texto: t };
  }).reverse();
  c.acoes.push("consultou " + p.mascara);
  return { processo: p.mascara, classe: p.classe, juizo: p.orgao, reus: p.reus, fase: p.fase, ultimo_ato: p.ultimo_ato, andamentos,
    proximos_compromissos: (avs || []).map((a: Record<string, any>) => ({ ato: a.tipo_evento, data: a.data_evento ? dataBR(a.data_evento) : null, hora: a.hora?.slice(0, 5) || null, local: a.local, modalidade: a.modalidade, link: a.link, orientacoes: a.orientacoes })), // eslint-disable-line @typescript-eslint/no-explicit-any
    equipe_preparando: (ts || []).map((t: Record<string, any>) => t.tipo).filter(Boolean) }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function avisarEquipe(c: Ctx, texto: string, extra: { processo_numero?: string | null; caso_id?: string | null } = {}) {
  const { data: eq } = await c.adm.from("profiles").select("id").eq("ativo", true);
  for (const id of (eq || []).map((x: { id: string }) => x.id)) await c.adm.from("notificacoes").insert({ para: id, de: null, tipo: "whatsapp", texto: texto.slice(0, 500), ...extra });
}

async function transferir(c: Ctx, motivo: string, resumo: string) {
  await c.adm.from("wa_conversas").update({ aguardando_equipe: true, resumo: `${motivo}: ${resumo}`.slice(0, 3000) }).eq("id", c.conv.id);
  c.conv.aguardando_equipe = true;
  await avisarEquipe(c, `WhatsApp · ${c.conv.nome || c.conv.telefone || "contato"} pede atendimento — ${motivo}. ${resumo}`);
  c.acoes.push("transferiu: " + motivo);
  return { ok: true, orientacao: "Avise o cliente, com acolhimento, que alguém da equipe vai continuar o atendimento por aqui." };
}

async function novoAtendimento(c: Ctx, a: { nome: string; cidade?: string; banco?: string; resumo_do_caso: string }) {
  const obs = `Pelo WhatsApp (${c.conv.telefone || ""})${a.cidade ? " · " + a.cidade : ""}\n${a.resumo_do_caso}`.slice(0, 4000);
  const { data: caso } = await c.adm.from("casos").insert({ nome: a.nome.toUpperCase().slice(0, 200), banco: a.banco || null, obs, etapa: "Primeiro atendimento", cliente_id: c.conv.cliente_id || null, criado_por: null }).select().single();
  await c.adm.from("wa_conversas").update({ aguardando_equipe: true, resumo: `Novo atendimento: ${a.resumo_do_caso}`.slice(0, 3000), nome: c.conv.nome || a.nome }).eq("id", c.conv.id);
  c.conv.aguardando_equipe = true;
  await avisarEquipe(c, `WhatsApp · novo atendimento de ${a.nome}${a.banco ? " (" + a.banco + ")" : ""}: ${a.resumo_do_caso}`, { caso_id: caso?.id || null });
  c.acoes.push("registrou novo atendimento");
  return { ok: true, orientacao: "Diga que o caso foi registrado e que a equipe vai analisar e retornar por aqui. Não prometa resultado." };
}

async function salvarEstado(c: Ctx, v: Record<string, unknown>) {
  c.conv.agente_estado = { ...(c.conv.agente_estado || {}), ...v };
  await c.adm.from("wa_conversas").update({ agente_estado: c.conv.agente_estado }).eq("id", c.conv.id);
}

function historico(msgs: Msg[]) {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of msgs) {
    const t = m.tipo === "texto" ? m.texto || "" : `[${m.de_mim ? "enviamos" : "o cliente enviou"} ${m.tipo === "audio" ? "um áudio" : m.tipo === "imagem" ? "uma foto" : m.tipo === "documento" ? "o documento " + (m.anexo_nome || "") : "uma mídia"}]${m.texto ? " " + m.texto : ""}`;
    if (!t.trim()) continue;
    const role = m.de_mim ? "assistant" : "user";
    const linha = m.de_mim && !m.agente ? "[mensagem da equipe] " + t : t;
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += "\n" + linha; else out.push({ role, content: linha });
  }
  while (out.length && out[0].role === "assistant") out.shift();
  return out;
}

/** roda o agente na conversa (chamado pelo webhook depois de uma mensagem do cliente) */
export async function rodarAgente(adm: Adm, conversaId: string, msgId: string) {
  const { data: cfgRow } = await adm.from("config").select("valor").eq("chave", "agente").maybeSingle();
  const cfg = (cfgRow?.valor || {}) as ConfigAgente; const modo = cfg.modo || "desligado";
  if (modo === "desligado") return;
  await espera(Number(process.env.AGENTE_ESPERA_MS ?? 7000)); // o cliente costuma mandar várias mensagens seguidas: espera ele terminar
  const { data: ultima } = await adm.from("wa_mensagens").select("id").eq("conversa_id", conversaId).eq("de_mim", false).order("em", { ascending: false }).limit(1).maybeSingle();
  if (ultima && ultima.id !== msgId) return; // chegou outra depois: aquela chamada responde
  // trava simples para não rodar duas vezes ao mesmo tempo
  const agora = new Date(); const { data: travou } = await adm.from("wa_conversas").update({ agente_lock: agora.toISOString() })
    .eq("id", conversaId).or(`agente_lock.is.null,agente_lock.lt.${new Date(agora.getTime() - 120000).toISOString()}`).select().maybeSingle();
  if (!travou) return;
  const conv = travou as Conv;
  try {
    if (conv.atendimento === "equipe" && (!conv.equipe_ate || new Date(conv.equipe_ate) > agora)) return; // a equipe está atendendo
    if (conv.aguardando_equipe) return; // já pediu a equipe: não fica conversando por cima
    if (/@g\.us$/.test(conv.jid)) return;
    if (conv.atendimento === "equipe") await adm.from("wa_conversas").update({ atendimento: "agente", equipe_ate: null }).eq("id", conv.id);
    const { data: ms } = await adm.from("wa_mensagens").select("id,de_mim,texto,tipo,anexo_nome,em,agente").eq("conversa_id", conv.id).order("em", { ascending: false }).limit(30);
    const msgs = ((ms || []) as Msg[]).reverse();
    const { data: clis } = await adm.from("clientes").select("id,nome,telefone").not("telefone", "is", null).limit(5000);
    const pelo = (clis || []).filter((x: { telefone: string }) => foneBate(x.telefone, conv.telefone)); const fichaPeloFone = pelo.length === 1 ? nomeBonito(pelo[0].nome) : null;
    const hora = Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
    const dia = agora.toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" });
    const ctx: Ctx = { adm, conv, acoes: [] };
    const sistema = instrucoes(cfg, conv, { fichaPeloFone, identificado: conv.agente_estado?.identificado || null, hora, diaUtil: !["Sat", "Sun"].includes(dia),
      agora: agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) });
    const texto = await conversar(ctx, sistema, historico(msgs));
    if (!texto.trim()) return;
    const partes = texto.split(/\n\s*-{3,}\s*\n/).map((s) => s.replace(/\*\*/g, "").trim()).filter(Boolean).slice(0, 4);
    if (modo === "rascunho") {
      await adm.from("wa_conversas").update({ rascunho: partes.join("\n---\n"), rascunho_em: new Date().toISOString(), ...(conv.saudado_em ? {} : { saudado_em: new Date().toISOString() }) }).eq("id", conv.id);
      return;
    }
    for (const [i, t] of partes.entries()) { if (i) await espera(1800); await enviarTextoNaConversa(adm, conv, t, { agente: true }); }
    if (!conv.saudado_em) await adm.from("wa_conversas").update({ saudado_em: new Date().toISOString() }).eq("id", conv.id);
  } catch (e) { console.warn("agente", e); }
  finally { await adm.from("wa_conversas").update({ agente_lock: null }).eq("id", conversaId); }
}

/** laço de conversa com ferramentas (Messages API) */
async function conversar(c: Ctx, sistema: string, hist: { role: "user" | "assistant"; content: string }[]): Promise<string> {
  const chave = process.env.ANTHROPIC_API_KEY; if (!chave || !hist.length) return "";
  const mensagens: { role: string; content: unknown }[] = hist.map((m) => ({ role: m.role, content: m.content }));
  for (let volta = 0; volta < 6; volta++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODELO, max_tokens: 1500, system: sistema, tools: FERRAMENTAS, messages: mensagens }) });
    if (!r.ok) { console.warn("agente claude", r.status, (await r.text()).slice(0, 300)); return ""; }
    const j = await r.json() as { content: { type: string; text?: string; id?: string; name?: string; input?: Record<string, string> }[]; stop_reason: string };
    const usos = j.content.filter((b) => b.type === "tool_use");
    if (j.stop_reason !== "tool_use" || !usos.length) return j.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
    mensagens.push({ role: "assistant", content: j.content });
    const resultados = [];
    for (const u of usos) {
      let res: unknown;
      try {
        const a = u.input || {};
        res = u.name === "identificar_cliente" ? await identificar(c, a.cpf, a.data_nascimento)
          : u.name === "consultar_processo" ? await consultar(c, a.numero)
          : u.name === "transferir_para_equipe" ? await transferir(c, a.motivo, a.resumo)
          : u.name === "registrar_novo_atendimento" ? await novoAtendimento(c, a as unknown as { nome: string; cidade?: string; banco?: string; resumo_do_caso: string })
          : { erro: "ferramenta desconhecida" };
      } catch (e) { res = { erro: (e as Error).message }; }
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(res).slice(0, 60000) });
    }
    mensagens.push({ role: "user", content: resultados });
  }
  return "";
}

