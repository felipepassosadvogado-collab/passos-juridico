// Roteiro das funções da equipe (Amanda): aparece numa caixa no primeiro acesso do dia, na tela de entrada e em PDF.
// O titular edita o texto no próprio sistema (config "funcoes_equipe"); este é o texto padrão.
// Formato simples: "# Título da seção", "- item", "> destaque" e linhas comuns (parágrafo).

export type Funcoes = { titulo: string; texto: string; atualizado_em?: string | null; atualizado_por?: string | null };

export const FUNCOES_PADRAO: Funcoes = {
  titulo: "Roteiro de funções — Amanda Cristina Fukuhara (estagiária)",
  texto: `> Jornada de 8 horas. Todas as tarefas que o Dr. Felipe cria e repassa vêm para você. Nenhum prazo pode vencer sem andamento registrado no sistema.

# 1. Ao chegar (primeiros 30 minutos)
- Entrar no sistema e ler este roteiro.
- Painel: ver "minhas tarefas em aberto" e as vencendo ou vencidas. Começar sempre pelas vencidas e pelas que vencem hoje.
- Agenda: conferir os prazos do dia e dos próximos 3 dias.
- WhatsApp: abrir as conversas "Não lidas" e "Pediu atendente" e responder ou encaminhar cada uma.
- Painel "Audiências e coletas": ver quem ainda não foi avisado, quem não confirmou e as mensagens não enviadas.

# 2. Tarefas e prazos
- Abrir cada tarefa, clicar em Iniciar e trabalhar nela até enviar para correção.
- Peças pelo gerador do sistema (inicial, intermediária, recurso, cumprimento de sentença): juntar o processo inteiro para o Claude analisar.
- Ao gerar qualquer peça: ler e resolver TODOS os colchetes [ ] marcados pelo Claude antes de enviar. Nenhuma peça sai com colchete.
- Petição intermediária (principalmente manifestação ao laudo): analisar se cabe pedido de tutela de urgência.
- Recursos: começar a fundamentação impugnando especificamente a sentença — transcrever o trecho atacado e rebater cada fundamento (dialeticidade).
- Manifestação ao laudo pericial: tratar só do laudo; não repetir os argumentos de mérito da inicial.
- Petição inicial de consignado: conferir se o pedido de dano material está com o indébito atualizado (cálculo anexado).
- Gerou a peça fora da tarefa? Usar "Ligar à tarefa" para a peça entrar no fluxo certo.

# 3. Correção e protocolo
- Terminou a peça: "Enviar para correção" para o Dr. Felipe, com o arquivo.
- Voltou com ajustes: ler o quadro "Ajustes pedidos", corrigir e reenviar na mesma tarefa.
- Aprovada: protocolar SOMENTE a versão final aprovada (nunca a anterior) e marcar "Protocolado" com a data.
- Tarefa de protocolo com mais de uma peça: conferir qual é a versão final antes de protocolar.

# 4. Clientes e WhatsApp do escritório
- Responder os clientes pelo WhatsApp do sistema no mesmo dia, de forma clara e simples (são, em geral, aposentados).
- Conversa marcada "Pediu atendimento da equipe": assumir a conversa, resolver e, quando terminar, devolver ao assistente.
- Ler o quadro "Confira antes de enviar" do Claude: conferir se quem escreveu é mesmo o cliente (pode ser banco, advogado da outra parte ou parente).
- Nunca informar valores, prazos de pagamento ou resultado do processo sem confirmar no processo.
- Proposta de acordo ou contato da parte contrária: não responder sozinha; repassar ao Dr. Felipe.

# 5. Avisos aos clientes (audiências, perícias, coletas)
- Avisar o cliente assim que a audiência, perícia ou coleta for marcada, pelo "Aviso ao cliente" do sistema.
- Cobrar a confirmação de quem não respondeu e registrar quando o cliente confirmar.
- Coleta de padrão gráfico no balcão: avisar o prazo ("até tal dia") e acompanhar até o cliente comparecer.
- Na véspera da audiência ou perícia: lembrar o cliente de novo.

# 6. Novos clientes (pré-processual)
- Cadastrar o cliente com telefone, CPF e endereço completos.
- Conferir os documentos: procuração (uma para cada banco), declaração de hipossuficiência, contrato de honorários, RG/CPF, comprovante de residência e extratos.
- Guardar cada documento na ficha do cliente com o tipo certo.
- Cliente com procuração contra mais de um banco: abrir uma tarefa de inicial para cada banco.
- Atualizar a fase do cliente no CRM.

# 7. Antes de sair
- Nenhuma tarefa vencida sem andamento registrado.
- WhatsApp sem conversa de cliente esperando resposta.
- Avisos do dia enviados e confirmações registradas.
- Anotar no chat do sistema o que ficou pendente para o dia seguinte.`,
};

export type Bloco = { tipo: "secao"; texto: string; itens: Linha[] };
export type Linha = { tipo: "item" | "par" | "destaque"; texto: string };

/** quebra o texto em seções (o que vem antes da 1ª seção fica numa seção sem título) */
export function lerFuncoes(texto: string): Bloco[] {
  const out: Bloco[] = []; let atual: Bloco = { tipo: "secao", texto: "", itens: [] };
  for (const bruta of texto.split(/\r?\n/)) {
    const l = bruta.trim(); if (!l) continue;
    if (l.startsWith("# ")) { if (atual.texto || atual.itens.length) out.push(atual); atual = { tipo: "secao", texto: l.slice(2).trim(), itens: [] }; }
    else if (/^[-•*] /.test(l)) atual.itens.push({ tipo: "item", texto: l.slice(2).trim() });
    else if (l.startsWith("> ")) atual.itens.push({ tipo: "destaque", texto: l.slice(2).trim() });
    else atual.itens.push({ tipo: "par", texto: l });
  }
  if (atual.texto || atual.itens.length) out.push(atual);
  return out;
}

/** a caixa abre sozinha no primeiro acesso do dia de quem não é titular */
export const chaveVisto = (uid: string) => "funcoes.visto." + uid;
export const deveAbrirHoje = (visto: string | null, hoje: string, titular: boolean) => !titular && visto !== hoje;
