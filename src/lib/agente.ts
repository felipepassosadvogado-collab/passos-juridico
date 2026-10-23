// Agente do WhatsApp: atende os clientes com o Claude, consultando os processos no sistema.
// Só fala do processo com o cliente identificado: pelo telefone da ficha (ou conversa ligada à ficha), ou CPF + data de nascimento.
// Modos (config "agente"): desligado · rascunho (sugere a resposta, a equipe envia) · automatico (responde sozinho).
import { MODELO_REDACAO } from "./claude";
import { INSTANCIA, evo } from "./whatsapp";
import { dataBR, idade, nomeBonito } from "./formato";
import { enviarTextoNaConversa, foneBate, type Adm } from "./whatsappDb";

export type ConfigAgente = { modo?: "desligado" | "rascunho" | "automatico"; nome?: string; horario?: string; avisoGolpe?: string; instrucoes?: string };
export const AVISO_GOLPE_PADRAO = "Atenção ao golpe do falso advogado: este é o único WhatsApp oficial do escritório, (47) 99642-4673. Nós nunca pedimos pagamento, PIX ou depósito para liberar valores de processo. Se alguém entrar em contato em nome do escritório pedindo dinheiro, não pague e fale com a gente por aqui.";
type Conv = { id: string; jid: string; telefone: string | null; nome: string | null; cliente_id: string | null; atendimento: string; equipe_ate: string | null; aguardando_equipe: boolean; agente_estado: Record<string, any>; saudado_em: string | null; agente_lock: string | null }; // eslint-disable-line @typescript-eslint/no-explicit-any
type Msg = { id: string; de_mim: boolean; texto: string | null; tipo: string; anexo_nome: string | null; anexo_mime: string | null; em: string; agente: boolean; enviado_por: string | null; bruto: { key?: Record<string, unknown> } | null };
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
  { name: "confirmar_aviso", description: "Registra que o cliente confirmou o recebimento de um aviso que mandamos (perícia, audiência, coleta, protocolo). Use quando a resposta dele (ok, 👍, recebi, vou sim, obrigado) for a confirmação de um aviso pendente listado no contexto.",
    input_schema: { type: "object", properties: { aviso_id: { type: "string" }, observacao: { type: "string", description: "o que o cliente disse, se tiver algo além do ok (ex.: vai com a filha)" } }, required: ["aviso_id"] } },
  { name: "anotar_para_equipe", description: "Deixa uma anotação para a equipe na linha do tempo do processo (ou na conversa, se não houver processo), sem transferir o atendimento. Use para informações úteis que o cliente der: telefone novo, mudança de endereço, recebeu carta do banco, o desconto parou, vai viajar, problema de saúde para comparecer etc.",
    input_schema: { type: "object", properties: { texto: { type: "string" }, processo: { type: "string", description: "número do processo, se a informação for de um processo específico" } }, required: ["texto"] } },
  { name: "registrar_novo_atendimento", description: "Para quem ainda não é cliente e quer entrar com ação: registra o caso no CRM com o resumo e avisa a equipe. Chame quando já tiver entendido o problema (nome, cidade, banco, o que aconteceu, desde quando).",
    input_schema: { type: "object", properties: { nome: { type: "string" }, cidade: { type: "string" }, banco: { type: "string" }, resumo_do_caso: { type: "string", description: "resumo claro para o advogado: o que aconteceu, valores, datas, documentos que a pessoa tem" } }, required: ["nome", "resumo_do_caso"] } },
];

type CtxInstr = { cliente: Record<string, unknown> | null; fichaPeloFone: string | null; agora: string; hora: number; diaUtil: boolean; jaFalamos: boolean };
function instrucoes(cfg: ConfigAgente, conv: Conv, ctx: CtxInstr) {
  const nome = cfg.nome?.trim() || "Ana";
  const horario = cfg.horario?.trim() || "segunda a sexta, das 9h às 18h";
  const expediente = ctx.diaUtil && ctx.hora >= 9 && ctx.hora < 18;
  const saudar = !conv.saudado_em && !ctx.jaFalamos;
  return `Você é ${nome}, do atendimento do escritório Passos Advocacia (Felipe dos Passos Silva, OAB/SC 58.547, Rua Dona Francisca, 260, sala 1804, Centro, Joinville/SC). O escritório defende aposentados e pensionistas em ações contra bancos e o INSS por empréstimos consignados não contratados, e em outros assuntos do INSS. Você conversa pelo WhatsApp oficial do escritório.

QUEM VOCÊ É
Você é a assistente virtual do escritório e trabalha junto com a equipe (Dr. Felipe e Amanda). Escreva como uma atendente experiente, calorosa e atenta de um escritório pequeno, que conhece os clientes: natural, gentil, sem formalidade excessiva e sem frases de robô. Nunca diga que é uma pessoa, advogada ou estagiária. Se perguntarem se é robô, diga com naturalidade que é a assistente virtual do escritório e que chama alguém da equipe na hora, se a pessoa preferir.

AGORA: ${ctx.agora} (Brasília). Equipe: ${horario}. ${expediente ? "Estamos no horário da equipe." : "Estamos FORA do horário da equipe: se precisar da equipe, diga que ela responde no próximo horário de atendimento."}

COMO PENSAR ANTES DE RESPONDER
Leia a última mensagem do cliente frase por frase e entenda o que ele quis dizer, o tom e o que ele espera. Veja também o que já foi dito na conversa, inclusive as mensagens da equipe (marcadas como [mensagem da equipe]) e os avisos que mandamos. Então:
- responda a cada pergunta ou ponto que ele levantou, um por um, com as palavras dele em mente; não ignore nada e não responda o que ele não perguntou;
- se ele só confirmou, agradeceu ou mandou um emoji (👍, ok, obrigado, amém, recebi) em resposta a uma mensagem nossa, NÃO repita nem reexplique nada: registre a confirmação (confirmar_aviso, se houver aviso pendente) e responda no máximo com uma frase curta e simpática, ou não responda;
- se ele estiver ansioso, preocupado ou chateado, acolha primeiro, com uma frase sincera, e depois informe;
- adapte o tamanho: mensagem curta pede resposta curta; pergunta detalhada pede resposta completa;
- nunca use frases prontas repetidas nem a mesma abertura duas vezes; varie como uma pessoa varia.
- cumprimente de acordo com a hora (bom dia / boa tarde / boa noite) quando for a primeira mensagem do dia, e não a cada resposta;
- use o contexto como uma pessoa da equipe usaria: se a Amanda acabou de mandar o aviso do protocolo e o cliente pergunta "e agora?", responda a partir daquele aviso, sem começar do zero;
- não narre o que você faz por dentro ("vou registrar no sistema", "consultando..."); fale só o que importa para o cliente;
- dúvidas gerais (o que é perícia, como funciona o INSS, o que é o número do processo) você pode explicar de forma simples; o que depende do caso concreto vai para a equipe.

EXEMPLOS
- Nós mandamos o aviso do protocolo e o cliente responde só "👍": registre a confirmação e responda algo como "Combinado, Mauro! Qualquer novidade a gente te avisa por aqui." ou não responda. Nunca mande boas-vindas nem o aviso do golpe nesse caso.
- Cliente: "boa tarde, a perícia é amanhã? posso levar minha filha?": responda as duas perguntas: a data, a hora e o local que estão no contexto e, sobre a filha, o que estiver nas orientações do aviso; se não houver, diga que confirma com a equipe e anote.
- Cliente: "quando vou receber?": acolha, explique em que fase está e diga que valores e prazos de pagamento o Dr. Felipe explica; transfira.

${saudar ? `PRIMEIRO CONTATO: esta pessoa escreveu para o escritório pela primeira vez. Dê as boas-vindas de forma calorosa${ctx.cliente ? " chamando pelo primeiro nome" : ""}, apresente-se como ${nome}, assistente virtual da Passos Advocacia, e em uma mensagem separada dê este aviso com suas palavras: "${cfg.avisoGolpe?.trim() || AVISO_GOLPE_PADRAO}". Na mesma resposta, já responda ao que ela escreveu (se ela já fez uma pergunta, não deixe para depois).` : "Esta conversa já começou antes (por nós ou pelo cliente): NÃO se apresente de novo, não dê boas-vindas e não repita o aviso do golpe, a não ser que o cliente fale de cobrança, PIX ou contato suspeito."}

ESCRITA
- Português do Brasil simples, frases curtas, sem juridiquês (se usar um termo, explique: "perícia é o exame da assinatura").
- Chame pelo primeiro nome quando souber. Nunca escreva "bem-vindo(a)" ou "o(a)": use o gênero certo pelo nome ou uma frase neutra.
- No máximo 1 emoji, só quando combinar. Sem markdown (sem ** ou #), sem listas longas.
- Até 3 parágrafos curtos por mensagem. Para mandar mais de uma mensagem, separe com uma linha contendo só ---.

PROCESSOS E SEGURANÇA
1. Só fale de processo com o cliente identificado. ${ctx.cliente ? "Este cliente JÁ ESTÁ IDENTIFICADO pelo telefone da ficha (veja o contexto abaixo): não peça CPF." : "Ele ainda não está identificado: peça o CPF do titular e chame identificar_cliente; se a ferramenta pedir, peça a data de nascimento. Antes disso, não conte nada sobre processos, valores, datas ou nomes."}
2. Para explicar um processo, chame consultar_processo e LEIA TODOS os andamentos, do mais antigo ao mais recente. Explique como um advogado atencioso explicaria a um aposentado: em que fase está, o que aconteceu por último e o que isso significa na prática, qual é o próximo passo e se o cliente precisa fazer algo. Perícia, coleta ou audiência marcada: diga data, hora, local e o que levar. Seja fiel aos autos; se algo não estiver claro, diga que vai confirmar com a equipe.
3. NUNCA prometa resultado, não diga que vai ganhar, não estime valores, não diga quando o dinheiro sai, não fale de honorários, acordos ou estratégia, não opine sobre o mérito. Nesses casos, diga com naturalidade que vai pedir para o Dr. Felipe ou a equipe responder e use transferir_para_equipe com um bom resumo.
4. Pediu para falar com alguém: transfira na hora, sem insistir.
5. Pessoa nova com um problema: acolha e entenda o caso com calma, uma pergunta por vez (nome, cidade, banco ou benefício, o que aconteceu, desde quando, se tem o extrato do INSS). Quando entender, use registrar_novo_atendimento com um resumo completo e diga que a equipe vai analisar e retornar. Não diga que tem direito ou chance.
6. Informação útil que o cliente der (telefone novo, mudou de endereço, recebeu carta, o desconto parou, não pode ir na data): agradeça e use anotar_para_equipe. Se for impedimento para perícia/audiência, transfira também.
7. Fotos e documentos que o cliente mandar aparecem para você: leia com atenção, diga com suas palavras o que é (ex.: "recebi o seu extrato do INSS, aparece o empréstimo do banco X de R$ ..."), anote para a equipe e, se precisar de análise do advogado, transfira. Áudio você não consegue ouvir: peça com gentileza para escrever, ou chame a equipe se a pessoa preferir falar.

FORMATO DA SUA RESPOSTA (obrigatório)
<analise>em 2 a 5 linhas: o que o cliente disse em cada frase, o que ele precisa e como você vai responder</analise>
<resposta>o texto que vai para o WhatsApp (ou exatamente [SEM_RESPOSTA] se não for preciso responder)</resposta>

CONTEXTO DO ATENDIMENTO
${ctx.cliente ? "Cliente identificado: " + JSON.stringify(ctx.cliente) : ctx.fichaPeloFone ? "Este telefone está na ficha de mais de um cliente (" + ctx.fichaPeloFone + "): pergunte com quem está falando e peça o CPF do titular." : "Telefone não está na ficha de nenhum cliente."}
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

async function confirmarAviso(c: Ctx, id: string, obs?: string) {
  const { data: av } = await c.adm.from("avisos_cliente").select("id,processo_numero,publicacao_id,tipo_evento,data_evento,hora,confirmado_em").eq("id", id).maybeSingle();
  const doCliente = av && c.conv.cliente_id ? !!(await c.adm.from("processos").select("numero").eq("numero", av.processo_numero).eq("cliente_id", c.conv.cliente_id).maybeSingle()).data : false;
  if (!av || !doCliente) return { erro: "Aviso não encontrado para este cliente." };
  if (av.confirmado_em) return { ok: true, ja_estava_confirmado: true };
  await c.adm.from("avisos_cliente").update({ confirmado_em: new Date().toISOString(), confirmado_por: null, dificuldade: null, dificuldade_em: null }).eq("id", id);
  await c.adm.from("tarefas").update({ status: "feito" }).eq("aviso_id", id).eq("tipo", "Verificar retorno do cliente").neq("status", "feito");
  const ato = [av.tipo_evento || "aviso", av.data_evento ? dataBR(av.data_evento) + (av.hora ? " às " + String(av.hora).slice(0, 5) : "") : ""].filter(Boolean).join(" ");
  await c.adm.from("eventos").insert({ processo_numero: av.processo_numero, publicacao_id: av.publicacao_id, tipo: "comentario", por: null, dados: { texto: `Cliente confirmou pelo WhatsApp o recebimento do aviso (${ato}).${obs ? " Disse: " + obs : ""} — registrado pela assistente virtual` } });
  c.acoes.push("confirmou aviso"); return { ok: true };
}

async function anotar(c: Ctx, texto: string, processo?: string) {
  const n = soDig(processo); let num: string | null = null;
  if (c.conv.cliente_id) {
    const { data: ps } = await c.adm.from("processos").select("numero").eq("cliente_id", c.conv.cliente_id);
    num = (ps || []).find((p: { numero: string }) => n.length >= 7 && p.numero.includes(n))?.numero || ((ps || []).length === 1 ? ps![0].numero : null);
  }
  const t = `Pelo WhatsApp (${c.conv.nome || c.conv.telefone || "cliente"}): ${texto} — anotado pela assistente virtual`.slice(0, 2000);
  if (num) await c.adm.from("eventos").insert({ processo_numero: num, tipo: "comentario", por: null, dados: { texto: t } });
  await avisarEquipe(c, "WhatsApp · " + t.slice(0, 300), { processo_numero: num });
  c.acoes.push("anotou"); return { ok: true, onde: num ? "na linha do tempo do processo" : "no aviso para a equipe" };
}

async function salvarEstado(c: Ctx, v: Record<string, unknown>) {
  c.conv.agente_estado = { ...(c.conv.agente_estado || {}), ...v };
  await c.adm.from("wa_conversas").update({ agente_estado: c.conv.agente_estado }).eq("id", c.conv.id);
}

type Bloco = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: string; data: string } } | { type: "document"; source: { type: "base64"; media_type: "application/pdf"; data: string } };
type Turno = { role: "user" | "assistant"; content: Bloco[] };
const hm = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");

/** baixa do WhatsApp a foto ou o PDF que o cliente mandou, para o Claude ver */
async function midia(m: Msg): Promise<Bloco | null> {
  if (!m.bruto?.key) return null;
  const pdf = m.tipo === "documento" && /pdf/i.test(m.anexo_mime || m.anexo_nome || "");
  if (m.tipo !== "imagem" && !pdf) return null;
  try {
    const r = await evo<{ base64?: string; mimetype?: string }>(`/chat/getBase64FromMediaMessage/${INSTANCIA()}`, "POST", { message: { key: m.bruto.key }, convertToMp4: false });
    if (!r?.base64 || r.base64.length > 6_500_000) return null;
    if (pdf) return { type: "document", source: { type: "base64", media_type: "application/pdf", data: r.base64 } };
    const mt = /png|webp|gif/.test(r.mimetype || m.anexo_mime || "") ? (r.mimetype || m.anexo_mime)! : "image/jpeg";
    return { type: "image", source: { type: "base64", media_type: mt, data: r.base64 } };
  } catch { return null; }
}

async function historico(msgs: Msg[]): Promise<Turno[]> {
  const out: Turno[] = [];
  const comMidia = new Set(msgs.filter((m) => !m.de_mim && (m.tipo === "imagem" || m.tipo === "documento")).slice(-3).map((m) => m.id)); // só as 3 últimas
  for (const m of msgs) {
    const desc = m.tipo === "texto" ? m.texto || "" : `[${m.de_mim ? "enviamos" : "o cliente enviou"} ${m.tipo === "audio" ? "um áudio (você não consegue ouvir)" : m.tipo === "imagem" ? "uma foto" : m.tipo === "documento" ? "o documento " + (m.anexo_nome || "") : m.tipo === "figurinha" ? "uma figurinha" : "uma mídia"}]${m.texto ? " " + m.texto : ""}`;
    if (!desc.trim()) continue;
    const role = m.de_mim ? "assistant" : "user";
    const linha = `(${hm(m.em)}) ` + (m.de_mim && !m.agente ? "[mensagem da equipe] " : "") + desc;
    const blocos: Bloco[] = [{ type: "text", text: linha }];
    if (comMidia.has(m.id)) { const b = await midia(m); if (b) blocos.unshift(b); }
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content.push(...blocos); else out.push({ role, content: blocos });
  }
  // a conversa para o Claude precisa começar pelo cliente; o que veio antes (nossos avisos) vira contexto
  const antes: string[] = [];
  while (out.length && out[0].role === "assistant") antes.push(...out.shift()!.content.filter((b): b is { type: "text"; text: string } => b.type === "text").map((b) => b.text));
  if (antes.length && out.length) out[0].content.unshift({ type: "text", text: "[antes desta mensagem, nós já tínhamos enviado:]\n" + antes.join("\n") + "\n[mensagem do cliente:]" });
  return out;
}

/** o que o assistente já sabe do cliente identificado: processos, atendimentos e avisos que esperam confirmação */
async function resumoCliente(adm: Adm, clienteId: string) {
  const [{ data: cli }, { data: ps }, { data: cs }] = await Promise.all([
    adm.from("clientes").select("id,nome,nascimento,cidade").eq("id", clienteId).maybeSingle(),
    adm.from("processos").select("numero,mascara,banco,reus,fase,orgao,ultima_data,ultimo_ato").eq("cliente_id", clienteId),
    adm.from("casos").select("banco,etapa,criado_em").eq("cliente_id", clienteId).is("processo_numero", null),
  ]);
  if (!cli) return null;
  const nums = (ps || []).map((p: { numero: string }) => p.numero);
  const desde = new Date(Date.now() - 20 * 86400e3).toISOString();
  const { data: avs } = nums.length ? await adm.from("avisos_cliente").select("id,processo_numero,tipo_evento,data_evento,hora,local,status,avisado_em,confirmado_em,realizado_em")
    .in("processo_numero", nums).eq("status", "avisado").gte("avisado_em", desde) : { data: [] };
  return {
    nome: nomeBonito(cli.nome), primeiro_nome: nomeBonito(cli.nome).split(" ")[0], idade: idade(cli.nascimento), cidade: cli.cidade,
    processos: (ps || []).map((p: Record<string, any>) => ({ numero: p.mascara || p.numero, contra: (p.reus || []).join(" e ") || p.banco, fase: p.fase, juizo: p.orgao, ultimo_andamento: p.ultima_data ? dataBR(p.ultima_data) + " · " + (p.ultimo_ato || "") : null })), // eslint-disable-line @typescript-eslint/no-explicit-any
    atendimentos_sem_processo: (cs || []).map((x: Record<string, any>) => ({ contra: x.banco || "banco a definir", etapa: x.etapa, desde: dataBR(String(x.criado_em).slice(0, 10)) })), // eslint-disable-line @typescript-eslint/no-explicit-any
    avisos_enviados_recentes: (avs || []).map((a: Record<string, any>) => ({ aviso_id: a.id, ato: a.tipo_evento, data: a.data_evento ? dataBR(a.data_evento) : null, hora: a.hora?.slice(0, 5) || null, local: a.local, enviado: hm(a.avisado_em), cliente_ja_confirmou: !!a.confirmado_em, ja_realizado: !!a.realizado_em })), // eslint-disable-line @typescript-eslint/no-explicit-any
  };
}

/** "digitando…" e as mensagens do cliente marcadas como lidas, como uma pessoa faria */
async function presenca(conv: Conv, msgs: Msg[], ms: number) {
  const numero = conv.telefone || conv.jid.replace(/@.*/, "");
  try {
    const lidas = msgs.filter((m) => !m.de_mim && m.bruto?.key?.id).slice(-5).map((m) => ({ remoteJid: conv.jid, fromMe: false, id: String(m.bruto!.key!.id) }));
    if (lidas.length) await evo(`/chat/markMessageAsRead/${INSTANCIA()}`, "POST", { readMessages: lidas });
  } catch { /* não é essencial */ }
  try { await evo(`/chat/sendPresence/${INSTANCIA()}`, "POST", { number: numero, presence: "composing", delay: ms }); } catch { /* idem */ }
}

/** separa a resposta que vai para o WhatsApp do raciocínio do Claude */
export function extrairResposta(texto: string) {
  const m = texto.match(/<resposta>([\s\S]*?)(<\/resposta>|$)/i);
  const r = (m ? m[1] : texto.replace(/<analise>[\s\S]*?<\/analise>/i, "")).trim();
  if (!r || /^\[?\s*SEM[_ ]RESPOSTA\s*\]?$/i.test(r)) return [];
  return r.split(/\n\s*-{3,}\s*\n/).map((s) => s.replace(/\*\*/g, "").replace(/<\/?(analise|resposta)>/gi, "").trim()).filter(Boolean).slice(0, 4);
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
    const { data: ms } = await adm.from("wa_mensagens").select("id,de_mim,texto,tipo,anexo_nome,anexo_mime,em,agente,enviado_por,bruto").eq("conversa_id", conv.id).order("em", { ascending: false }).limit(40);
    const msgs = ((ms || []) as Msg[]).reverse();
    const jaFalamos = msgs.some((m) => m.de_mim);
    // identificação pelo telefone: a conversa ligada a uma ficha, ou um único cliente com este telefone na ficha
    const { data: clis } = await adm.from("clientes").select("id,nome,telefone").not("telefone", "is", null).limit(5000);
    const pelo = (clis || []).filter((x: { telefone: string }) => foneBate(x.telefone, conv.telefone));
    // (conversa ligada à ficha pela equipe também vale: é "outro número do cliente")
    const fichaFone = conv.cliente_id || (pelo.length === 1 ? pelo[0].id : null);
    const idCli = conv.agente_estado?.identificado || fichaFone;
    if (idCli && conv.agente_estado?.identificado !== idCli) {
      conv.agente_estado = { ...(conv.agente_estado || {}), identificado: idCli, identificado_por: "telefone da ficha" };
      await adm.from("wa_conversas").update({ agente_estado: conv.agente_estado, ...(conv.cliente_id ? {} : { cliente_id: idCli }) }).eq("id", conv.id);
      if (!conv.cliente_id) conv.cliente_id = idCli;
    }
    const cliente = idCli ? await resumoCliente(adm, idCli) : null;
    const fichaPeloFone = !cliente && pelo.length > 1 ? pelo.map((x: { nome: string }) => nomeBonito(x.nome)).join(" ou ") : null;
    const hora = Number(agora.toLocaleString("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hour12: false }));
    const dia = agora.toLocaleDateString("en-US", { timeZone: "America/Sao_Paulo", weekday: "short" });
    const ctx: Ctx = { adm, conv, acoes: [] };
    const sistema = instrucoes(cfg, conv, { cliente, fichaPeloFone, jaFalamos, hora, diaUtil: !["Sat", "Sun"].includes(dia),
      agora: agora.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) });
    const hist = await historico(msgs);
    if (modo === "automatico") await presenca(conv, msgs, 4000);
    const partes = extrairResposta(await conversar(ctx, sistema, hist));
    const marcaSaudacao = !conv.saudado_em ? { saudado_em: new Date().toISOString() } : {};
    if (!partes.length) { if (Object.keys(marcaSaudacao).length && jaFalamos) await adm.from("wa_conversas").update(marcaSaudacao).eq("id", conv.id); return; }
    if (modo === "rascunho") {
      await adm.from("wa_conversas").update({ rascunho: partes.join("\n---\n"), rascunho_em: new Date().toISOString(), ...marcaSaudacao }).eq("id", conv.id);
      return;
    }
    for (const [i, t] of partes.entries()) {
      if (i) { await presenca(conv, [], Math.min(5000, 900 + t.length * 25)); await espera(Math.min(4500, 700 + t.length * 20)); } // tempo de "digitar"
      await enviarTextoNaConversa(adm, conv, t, { agente: true });
    }
    if (Object.keys(marcaSaudacao).length) await adm.from("wa_conversas").update(marcaSaudacao).eq("id", conv.id);
  } catch (e) { console.warn("agente", e); }
  finally { await adm.from("wa_conversas").update({ agente_lock: null }).eq("id", conversaId); }
}

/** laço de conversa com ferramentas (Messages API) */
async function conversar(c: Ctx, sistema: string, hist: Turno[]): Promise<string> {
  const chave = process.env.ANTHROPIC_API_KEY; if (!chave || !hist.length) return "";
  const mensagens: { role: string; content: unknown }[] = hist.map((m) => ({ role: m.role, content: m.content }));
  for (let volta = 0; volta < 6; volta++) {
    const r = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "x-api-key": chave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODELO_REDACAO, max_tokens: 2500, system: sistema, tools: FERRAMENTAS, messages: mensagens }) });
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
          : u.name === "confirmar_aviso" ? await confirmarAviso(c, a.aviso_id, a.observacao)
          : u.name === "anotar_para_equipe" ? await anotar(c, a.texto, a.processo)
          : u.name === "registrar_novo_atendimento" ? await novoAtendimento(c, a as unknown as { nome: string; cidade?: string; banco?: string; resumo_do_caso: string })
          : { erro: "ferramenta desconhecida" };
      } catch (e) { res = { erro: (e as Error).message }; }
      resultados.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify(res).slice(0, 60000) });
    }
    mensagens.push({ role: "user", content: resultados });
  }
  return "";
}
