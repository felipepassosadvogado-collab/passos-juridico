// Listas e regras do escritório usadas em várias telas (as mesmas do painel antigo).
import { FASES, type Tarefa, type Publicacao, type Analise, type Aviso, type Processo, type Modalidade } from "./tipos";
import { bancoCurto, dataBR, nomeBonito, semAcento } from "./formato";
import { calcularVencimento, foroDe, paraData } from "./prazos";

/** tipos de tarefa, agrupados como aparecem na escolha (inclui os que vieram do ADVBOX) */
export const TAREFAS_GRUPOS: [string, string[]][] = [
  ["Peças", ["Elaboração de inicial", "Petição simples", "Petição de juntada", "Petição de quesitos", "Réplica com pedido de perícia",
    "Manifestação ao laudo pericial", "Alegações finais", "Recurso inominado", "Contrarrazões ao recurso inominado", "Embargos de declaração"]],
  ["Protocolo", ["Protocolo da inicial", "Protocolo da peça", "Conferir protocolo realizado"]],
  ["Cumprimento de sentença", ["Cumprimento de sentença / cálculos", "Alterar valor da causa e honorários", "Elaborar cálculo de cumprimento (Claude)",
    "Elaborar petição de cumprimento (Claude)", "Verificar trânsito em julgado", "Efetuar pagamento ao cliente", "Transferir pagamento de acordo ao cliente"]],
  ["Cliente e agenda", ["Contato com o cliente", "Enviar mensagem ao cliente (Atende Direito)", "Verificar retorno do cliente", "Confirmar comparecimento à audiência",
    "Agendar coleta de padrão grafotécnico", "Audiência"]],
  ["Rotina", ["Recado da equipe", "Verificar documentação", "Estudo de caso", "Outra"]],
];
export const TAREFAS = TAREFAS_GRUPOS.flatMap(([, l]) => l);
/** os tipos que são peças (para "Gerar petição") */
export const PECAS = [...TAREFAS_GRUPOS[0][1], "Cumprimento de sentença / cálculos", "Elaborar petição de cumprimento (Claude)"];

export const ETAPAS = ["Primeiro atendimento", "Documentos pendentes", "Elaboração da inicial", "Revisão da inicial", "Pronto para protocolar", "Protocolado"];
export const DICAS_ETAPA: Record<string, string> = {
  "Primeiro atendimento": "Conversa inicial e análise do extrato", "Documentos pendentes": "RG, comprovante, procuração, extratos",
  "Elaboração da inicial": "Tarefa: elaboração de inicial contra o banco", "Revisão da inicial": "Correção antes do protocolo",
  "Pronto para protocolar": "Peça aprovada, protocolar no eproc", "Protocolado": "Vira processo no quadro judicial",
};
export const DICAS_FASE: Record<string, string> = {
  "": "Sem fase definida", "Protocolo / citação": "Inicial protocolada, aguardando citação", "Réplica": "Contestação apresentada, prazo de réplica",
  "Perícia / instrução": "Perícia grafotécnica, laudo e audiência", "Sentença": "Aguardando ou analisando sentença", "Recurso": "Recurso inominado e contrarrazões",
  "Cumprimento de sentença": "Cálculos, RPV, alvará e prestação de contas", "Petição nos próprios autos": "Pedidos incidentais no processo", "Encerrado": "Arquivado",
};
export const BANCOS = ["Banco C6 Consignado S.A.", "Itaú Unibanco S.A.", "Banco Daycoval S.A.", "Banco BMG S.A.", "Banco Bradesco S.A.", "Banco Pan S.A.",
  "Banco Santander S.A.", "Banco Mercantil do Brasil S.A.", "Facta Financeira S.A.", "Crefisa S.A."];
export const PROTOCOLO_ACAO = "Protocolo da ação";
export const TIPOS_EV = ["Perícia", "Coleta de padrão grafotécnico", "Audiência", "Comparecimento", PROTOCOLO_ACAO, "Outro"];
/** atos que entram na caixa "Audiências e coletas" de Meus expedientes */
export const ATOS_AGENDA = ["Audiência", "Coleta de padrão grafotécnico"];
export const MODALIDADES: Record<Modalidade, { nome: string; curto: string }> = {
  video: { nome: "Por videoconferência", curto: "videoconferência" },
  jf_agendado: { nome: "Na Justiça Federal, com dia e hora marcados", curto: "na JF · horário marcado" },
  jf_balcao: { nome: "Na Justiça Federal, no horário de atendimento ao público", curto: "na JF · atendimento ao público" },
};
export const ehAgenda = (a: Pick<Aviso, "tipo_evento" | "modalidade">) => !!a.modalidade || ATOS_AGENDA.includes(a.tipo_evento || "");
export const TIPOS_DOC: Record<string, string> = { rg: "RG / CNH", comprovante: "Comprovante de residência", procuracao: "Procuração", hipo: "Declaração de hipossuficiência", contrato: "Contrato de honorários", proc_hipo_contrato: "Procuração, hipo e contrato (juntos)", extrato: "Extrato de empréstimos (HISCON)", extrato_pagamento: "Extrato de pagamento (HISCRE)", inicial: "Petição inicial", calculo: "Cálculo da causa", outro: "Outro" };

const MAPA_FASE: Record<string, string> = { "Inicial / citação": "Protocolo / citação", "Contestação / réplica": "Réplica", "Perícia grafotécnica": "Perícia / instrução", "Manifestação ao laudo": "Perícia / instrução", "Audiência": "Perícia / instrução" };
export const faseCRM = (f?: string | null) => MAPA_FASE[f || ""] || f || "";

/** sugestão de fase pelos dados do processo (juízo, classe e último ato) */
export function sugerirFase(p: Pick<Processo, "orgao" | "classe" | "ultimo_ato">): string {
  const o = p.orgao || "", c = (p.classe || "").toUpperCase(), u = (p.ultimo_ato || "").toUpperCase();
  if (/CUMPRIMENTO|EXECU/.test(c) || /Precat|Contadoria|RPV/i.test(o)) return "Cumprimento de sentença";
  if (/Turma Recursal|Câmara|Vice-Presid|Presidência|Turma/i.test(o) || /RECURSO|AGRAVO|APELA/.test(c)) return "Recurso";
  if (/SENTEN/.test(u)) return "Sentença";
  if (/LAUDO|PER[IÍ]CIA/.test(u)) return "Perícia / instrução";
  if (/CONTESTA|R[EÉ]PLICA/.test(u)) return "Réplica";
  if (/DISTRIBUI|CITA/.test(u)) return "Protocolo / citação";
  return "";
}

export const STATUS_NOME: Record<string, string> = { aberto: "Em aberto", andamento: "Em andamento", revisao: "Em correção", ajustes: "Ajustes pedidos", aprovada: "Aprovada", feito: "Cumprida" };
/** rótulo do passo da correção, com o nome de quem corrige */
export function rotuloCorrecao(t: Tarefa, nome: (id?: string | null) => string): [string, string] | null {
  const r = nome(t.revisor);
  return ({ revisao: ["acc", "em correção com " + r], ajustes: ["soon", "ajustes pedidos por " + r], aprovada: ["ok", "aprovada por " + r + " · protocolar"] } as Record<string, [string, string]>)[t.status] || null;
}
/** a quem avisar o protocolo: quem corrigiu ou quem criou a tarefa */
export const destinoProtocolo = (t: Tarefa, eu: string) => { const d = t.revisor || t.criado_por || null; return d && d !== eu ? d : null; };

export const rotuloPub = (x: Pick<Publicacao, "tipo_doc" | "tipo_com" | "data">) => (x.tipo_doc && x.tipo_doc !== "Outros" ? x.tipo_doc : x.tipo_com || "Publicação") + " de " + dataBR(x.data);
export const atoPub = (x: Pick<Publicacao, "tipo_doc" | "tipo_com">) => (x.tipo_doc && x.tipo_doc !== "Outros" ? x.tipo_doc : x.tipo_com || "Publicação");

const RX_CLIENTE = /audi[eê]ncia|per[ií]cia|coleta d[eo] (padr|assinatura|material)|padr[aã]o grafot|grafot[eé]cnic|comparec(er|imento)|depoimento pessoal/i;
export const precisaAvisar = (x?: Pick<Publicacao, "texto" | "analise"> | null) => RX_CLIENTE.test(x?.texto || "") || !!(x?.analise as Analise | null)?.intimarCliente;

export const descDaAnalise = (a?: Analise | null) => (a?.providencia && !/^nenhuma/i.test(a.providencia) ? a.providencia : "");

/** dados do aviso ao cliente a partir da análise do Claude */
export function avisoDaAnalise(an?: Analise | null): Partial<Aviso> {
  const ev = an?.evento || {};
  return {
    tipo_evento: TIPOS_EV.includes(ev.tipo || "") ? ev.tipo! : ev.tipo ? "Outro" : null,
    data_evento: /^\d{4}-\d\d-\d\d$/.test(ev.data || "") ? ev.data! : null,
    hora: /^\d\d:\d\d$/.test(ev.hora || "") ? ev.hora! : null,
    local: ev.local || null, orientacoes: ev.orientacoes || null,
    modalidade: ev.modalidade && ev.modalidade in MODALIDADES ? ev.modalidade as Modalidade : null,
  };
}

export const primeiroNome = (n?: string | null) => nomeBonito((n || "").split(/\s+/)[0] || "");
export function dataExtenso(iso?: string | null) {
  if (!iso) return "";
  return paraData(iso).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
}
/** mensagem padrão do WhatsApp para avisar o cliente */
export function mensagemPadrao(av: Pick<Aviso, "tipo_evento" | "data_evento" | "hora" | "local" | "orientacoes" | "modalidade" | "link">, nomeCliente: string, banco?: string | null, dproc?: { mascara?: string | null; orgao?: string | null }) {
  const nome = primeiroNome(nomeCliente); const b = bancoCurto(banco || "");
  if (av.tipo_evento === PROTOCOLO_ACAO) {
    const contra = b && b !== "—" ? ` contra o ${b} e o INSS` : "";
    return [`Olá, ${nome || "tudo bem"}! Aqui é do escritório Passos Advocacia.`,
      `Boa notícia: a sua ação${contra} foi protocolada${av.data_evento ? " no dia " + dataBR(av.data_evento) : ""}${dproc?.orgao ? ", na " + dproc.orgao : " na Justiça"}.`,
      dproc?.mascara ? `O número do seu processo é ${dproc.mascara}. Guarde este número.` : "",
      "Agora o juiz vai analisar o pedido e os réus serão chamados para responder. Isso leva algum tempo, e não precisa fazer nada por enquanto. Vamos te avisar sempre que houver novidade.",
      av.orientacoes || "",
      "Qualquer dúvida, é só chamar aqui. Por favor, responda confirmando que recebeu esta mensagem."].filter(Boolean).join("\n\n");
  } const tipo = (av.tipo_evento || "um ato").toLowerCase();
  const hora = (av.hora || "").slice(0, 5); const dia = av.data_evento ? `${dataBR(av.data_evento)} (${dataExtenso(av.data_evento)})` : "";
  const quando = dia ? ` no dia ${dia}${hora ? ", às " + hora : ""}` : "";
  const proc = `No seu processo${b && b !== "—" ? " contra o " + b : ""}`;
  const coleta = /coleta/i.test(tipo) ? " É quando a Justiça colhe amostras da sua assinatura, à mão, para a perícia." : "";
  let corpo: string[];
  if (av.modalidade === "video") corpo = [`${proc}, a Justiça marcou ${tipo} por videoconferência${quando}.${coleta}`,
    av.link ? `O link para entrar é:\n${av.link}` : "Vamos te enviar o link para entrar antes do horário.",
    "Você vai precisar de celular ou computador com câmera e internet, e de um documento original com foto. Entre uns 10 minutos antes, num lugar calmo e silencioso."];
  else if (av.modalidade === "jf_agendado") corpo = [`${proc}, a Justiça marcou ${tipo}${quando}, presencialmente na Justiça Federal${av.local ? " (" + av.local + ")" : ""}.${coleta}`,
    "Leve um documento original com foto e chegue uns 15 minutos antes."];
  else if (av.modalidade === "jf_balcao") corpo = [`${proc}, você precisa ir à Justiça Federal${av.local ? " (" + av.local + ")" : ""}, no horário de atendimento ao público${dia ? ", até o dia " + dia : ""}, para ${tipo}.${coleta}`,
    "Não precisa marcar horário. Leve um documento original com foto."];
  else corpo = [`${proc}, a Justiça marcou ${tipo}${quando}${av.local ? ", em " + av.local : ""}.`];
  return [`Olá, ${nome || "tudo bem"}! Aqui é do escritório Passos Advocacia.`, ...corpo, av.orientacoes || "",
    "Sua presença é importante. Por favor, responda esta mensagem confirmando que recebeu."].filter(Boolean).join("\n\n");
}

export { FASES };

/** chave curta do banco ("c6", "itau"…) para guardar a qualificação dele */
export const chaveBanco = (b: string) => semAcento(bancoCurto(b || "")).replace(/[^a-z0-9]/g, "");

/** qualificação do C6 já conhecida pelo modelo */
export const QUALIF_PADRAO: Record<string, string> = { c6: ", pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 61.348.538/0001-86, com sede na Avenida Nove de Julho, nº 3.148, Bairro Jardim Paulista, na cidade de São Paulo/SP, CEP 01406-000; e" };
export const ESPECIES = ["aposentadoria por idade", "aposentadoria por tempo de contribuição", "aposentadoria por invalidez", "aposentadoria especial", "pensão por morte", "benefício assistencial ao idoso (LOAS)", "benefício assistencial à pessoa com deficiência (LOAS)", "auxílio-doença"];

/** prazo de uma publicação: o da tarefa criada a partir dela; senão o calculado pela análise do Claude (dias úteis a partir da disponibilização) */
export function prazoDaPublicacao(pub: Publicacao, tarefasDela: Pick<Tarefa, "vencimento" | "status">[]): { venc: string | null; origem: "tarefa" | "analise" | null } {
  const v = tarefasDela.filter((t) => t.vencimento && t.status !== "feito").map((t) => t.vencimento!).sort()[0];
  if (v) return { venc: v, origem: "tarefa" };
  const dias = Number((pub.analise as Analise | null)?.prazoDias);
  if (dias > 0) return { venc: calcularVencimento(pub.data, dias, pub.eproc, foroDe(pub.processo_numero)), origem: "analise" };
  return { venc: null, origem: null };
}
