// Tipos das tabelas usadas nas telas (espelham supabase/migrations/0001_base.sql).
export type Papel = "titular" | "advogado" | "colaborador";
export type Perfil = { id: string; nome: string; funcao: string; papel: Papel; ativo: boolean; criado_em: string };
export type Cliente = {
  id: string; nome: string; cpf: string | null; rg: string | null; nascimento: string | null; nacionalidade: string | null;
  estado_civil: string | null; profissao: string | null; nome_mae: string | null; telefone: string | null; email: string | null;
  endereco: string | null; cep: string | null; cidade: string | null; nb: string | null; obs: string | null; criado_em: string;
};
export type Processo = {
  numero: string; mascara: string; tribunal: string | null; orgao: string | null; cidade: string | null; classe: string | null;
  cliente_id: string | null; cliente_nome: string; reus: string[]; banco: string | null; fase: string | null; notas: string | null;
  responsavel: string | null; ultima_data: string | null; ultimo_ato: string | null; cadastro_manual: boolean; criado_em: string;
};
export type Publicacao = {
  id: number; processo_numero: string; data: string; tipo_com: string | null; tipo_doc: string | null; orgao: string | null;
  texto: string | null; link: string | null; eproc: boolean; analise: Record<string, unknown> | null; triagem: "pendente" | "concluida";
};
export type StatusTarefa = "aberto" | "andamento" | "revisao" | "ajustes" | "aprovada" | "feito";
export type Tarefa = {
  id: string; processo_numero: string | null; caso_id: string | null; publicacao_id: number | null; tipo: string | null;
  descricao: string; vencimento: string | null; dias: number | null; responsavel: string | null; revisor: string | null;
  status: StatusTarefa; importante: boolean; urgente: boolean; criado_por: string | null; criado_em: string; feito_em: string | null;
  feito_por: string | null; iniciado_em: string | null; enviado_em: string | null; devolvido_em: string | null; aprovado_em: string | null;
  aprovado_por: string | null; protocolo_avisado_em: string | null; protocolo_numero?: string | null; protocolo_obs?: string | null; editado_em: string | null; nota_correcao: string | null;
};
export type Caso = {
  id: string; cliente_id: string | null; nome: string; banco: string | null; contratos: string | null; etapa: string;
  responsavel: string | null; obs: string | null; processo_numero: string | null; criado_por: string | null; criado_em: string;
};
export type Modalidade = "video" | "jf_agendado" | "jf_balcao";
export type Aviso = {
  id: string; processo_numero: string; publicacao_id: number | null; tipo_evento: string | null; data_evento: string | null; hora: string | null;
  local: string | null; orientacoes: string | null; mensagem: string | null; status: "pendente" | "avisado"; canal: string | null;
  aberto_em: string | null; avisado_em: string | null; avisado_por: string | null; criado_por: string | null; criado_em: string;
  modalidade?: Modalidade | null; link?: string | null; realizado_em?: string | null; realizado_por?: string | null;
};
export type Notificacao = {
  id: string; para: string; de: string | null; tipo: string; texto: string; processo_numero: string | null; caso_id: string | null;
  tarefa_id: string | null; lida: boolean; em: string;
};
export type Documento = {
  id: string; cliente_id: string | null; tarefa_id: string | null; tipo: string | null; etapa: string | null; nome: string;
  caminho: string; tamanho: number | null; mime: string | null; por: string | null; em: string;
};
export type Mensagem = { id: string; conversa: string; de: string; texto: string; em: string };
export type Analise = {
  ato?: string; resumo?: string; providencia?: string; tarefa?: string | null; prazoDias?: number | null; fase?: string | null; obs?: string;
  intimarCliente?: boolean; evento?: { tipo?: string; data?: string | null; hora?: string | null; local?: string | null; orientacoes?: string; modalidade?: string | null } | null;
};
export type Evento = { id: number; processo_numero: string | null; caso_id: string | null; tarefa_id: string | null; publicacao_id: number | null; tipo: string; dados: Record<string, unknown>; por: string | null; em: string };

export const FASES = ["Protocolo / citação", "Réplica", "Perícia / instrução", "Sentença", "Recurso", "Cumprimento de sentença", "Petição nos próprios autos", "Encerrado"] as const;
