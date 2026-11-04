// Colunas do CRM (quadro pré-processual e quadro judicial), editáveis pelo titular.
// Ficam em config.crm_colunas; sem configuração, valem as colunas padrão do sistema.
// "Protocolado" (pré) e "A classificar" / "Encerrado" (judicial) são fixas: o sistema depende delas.
import { DICAS_ETAPA, DICAS_FASE, ETAPAS } from "./regras";
import { FASES } from "./tipos";
import { bancoCurto, semAcento } from "./formato";

export type ColCrm = { nome: string; dica?: string };
export type ColunasCrm = { pre: ColCrm[]; judicial: ColCrm[] };
export type Quadro = keyof ColunasCrm;

export const PROTOCOLADO = "Protocolado";
export const ENCERRADO = "Encerrado";
export const A_CLASSIFICAR = "A classificar";

export const COLUNAS_PADRAO: ColunasCrm = {
  pre: ETAPAS.filter((e) => e !== PROTOCOLADO).map((nome) => ({ nome, dica: DICAS_ETAPA[nome] })),
  judicial: FASES.filter((f) => f !== ENCERRADO).map((nome) => ({ nome, dica: DICAS_FASE[nome] })),
};

const limpa = (l: unknown, quadro: Quadro): ColCrm[] | null => {
  if (!Array.isArray(l)) return null;
  const vistos = new Set<string>(); const r: ColCrm[] = [];
  for (const x of l) {
    const nome = typeof x?.nome === "string" ? x.nome.trim() : "";
    if (!nome || reservado(quadro, nome) || vistos.has(semAcento(nome))) continue;
    vistos.add(semAcento(nome)); r.push({ nome, ...(typeof x?.dica === "string" && x.dica.trim() ? { dica: x.dica.trim() } : {}) });
  }
  return r.length ? r : null;
};

/** colunas em uso: as configuradas pelo titular ou, se não houver (ou vierem estragadas), as padrão */
export function colunasCrm(config?: Record<string, any> | null): ColunasCrm {
  const c = config?.crm_colunas || {};
  return { pre: limpa(c.pre, "pre") || COLUNAS_PADRAO.pre, judicial: limpa(c.judicial, "judicial") || COLUNAS_PADRAO.judicial };
}

/** nomes que o sistema usa por conta própria e não podem virar coluna editável */
export function reservado(quadro: Quadro, nome: string) {
  const n = semAcento(nome.trim());
  return quadro === "pre" ? n === semAcento(PROTOCOLADO) : !n || n === semAcento(ENCERRADO) || n === semAcento(A_CLASSIFICAR);
}

/** "" quando o nome serve; senão, o motivo */
export function validarNome(quadro: Quadro, cols: ColCrm[], nome: string, atual?: string) {
  const n = nome.trim();
  if (!n) return "Dê um nome à coluna.";
  if (n.length > 40) return "Nome muito longo (até 40 letras).";
  if (reservado(quadro, n)) return `“${n}” é uma coluna fixa do sistema; escolha outro nome.`;
  if (cols.some((c) => c.nome !== atual && semAcento(c.nome) === semAcento(n))) return "Já existe uma coluna com esse nome.";
  return "";
}

export const renomearColuna = (cols: ColCrm[], antigo: string, nome: string, dica: string): ColCrm[] =>
  cols.map((c) => (c.nome === antigo ? { nome: nome.trim(), ...(dica.trim() ? { dica: dica.trim() } : {}) } : c));
export const excluirColuna = (cols: ColCrm[], nome: string): ColCrm[] => cols.filter((c) => c.nome !== nome);
export const adicionarColuna = (cols: ColCrm[], nome: string, dica: string, depoisDe?: string): ColCrm[] => {
  const nova = { nome: nome.trim(), ...(dica.trim() ? { dica: dica.trim() } : {}) };
  const i = depoisDe ? cols.findIndex((c) => c.nome === depoisDe) : -1;
  return i < 0 ? [...cols, nova] : [...cols.slice(0, i + 1), nova, ...cols.slice(i + 1)];
};
export function moverColuna(cols: ColCrm[], nome: string, passo: -1 | 1): ColCrm[] {
  const i = cols.findIndex((c) => c.nome === nome); const j = i + passo;
  if (i < 0 || j < 0 || j >= cols.length) return cols;
  const r = [...cols]; [r[i], r[j]] = [r[j], r[i]]; return r;
}

/** etapas que um atendimento pode ter (as colunas do pré + Protocolado) e fases de um processo (as do judicial + Encerrado) */
export const etapasDe = (c: ColunasCrm) => [...c.pre.map((x) => x.nome), PROTOCOLADO];
export const fasesDe = (c: ColunasCrm) => [...c.judicial.map((x) => x.nome), ENCERRADO];

// ───────── atendimento que já virou processo ─────────

type CasoMin = { id: string; cliente_id: string | null; nome: string; banco: string | null; processo_numero: string | null; criado_em: string };
type ProcMin = { numero: string; cliente_id: string | null; cliente_nome: string | null; banco: string | null; reus?: string[] | null; criado_em: string };

/** o processo é do mesmo cliente do atendimento? (pela ficha ou, sem ficha, pelo nome) */
export function mesmoCliente(p: { cliente_id: string | null; cliente_nome: string | null }, caso: { cliente_id: string | null; nome: string }) {
  if (p.cliente_id && caso.cliente_id) return p.cliente_id === caso.cliente_id;
  return !!caso.nome && semAcento(p.cliente_nome || "").trim() === semAcento(caso.nome || "").trim();
}

/** algum banco do atendimento é réu no processo? atendimento sem banco aceita qualquer um */
export function mesmoBanco(p: ProcMin, caso: CasoMin) {
  const doCaso = (caso.banco || "").split(/\s*;\s*/).map((b) => bancoCurto(b)).filter((b) => b && b !== "—");
  if (!doCaso.length) return true;
  const doProc = new Set([p.banco, ...(p.reus || [])].map((b) => bancoCurto(b)).filter((b) => b && b !== "—"));
  return doCaso.some((b) => doProc.has(b));
}

/**
 * processos que parecem ser o protocolo deste atendimento: mesmo cliente, mesmo banco,
 * cadastrados depois que o atendimento foi aberto e ainda não ligados a outro atendimento
 */
export function processosDoCaso(caso: CasoMin, processos: ProcMin[], ligados: Set<string>): ProcMin[] {
  if (caso.processo_numero) return [];
  const desde = (caso.criado_em || "").slice(0, 10);
  return processos.filter((p) => !ligados.has(p.numero) && (p.criado_em || "").slice(0, 10) >= desde && mesmoCliente(p, caso) && mesmoBanco(p, caso));
}

/**
 * pares atendimento ↔ processo sem ambiguidade: o atendimento tem um único processo candidato
 * e esse processo só serve a esse atendimento. Os ambíguos ficam para a equipe decidir.
 */
export function paresSemDuvida<C extends CasoMin, P extends ProcMin>(casos: C[], processos: P[]): { caso: C; processo: P }[] {
  const ligados = new Set(casos.map((c) => c.processo_numero).filter(Boolean) as string[]);
  const cand = new Map<string, P[]>(); const usos = new Map<string, number>();
  for (const c of casos) { const l = processosDoCaso(c, processos, ligados) as P[]; cand.set(c.id, l); for (const p of l) usos.set(p.numero, (usos.get(p.numero) || 0) + 1); }
  const r: { caso: C; processo: P }[] = [];
  for (const c of casos) { const l = cand.get(c.id) || []; if (l.length === 1 && usos.get(l[0].numero) === 1) r.push({ caso: c, processo: l[0] }); }
  return r;
}

/** fase em que o processo entra ao ser protocolado: "Protocolo / citação" se existir, senão a primeira coluna do judicial */
export const faseInicial = (c: ColunasCrm) => c.judicial.find((x) => x.nome === "Protocolo / citação")?.nome || c.judicial[0]?.nome || "";
/** etapa em que o atendimento novo entra: a primeira coluna do pré */
export const etapaInicial = (c: ColunasCrm) => c.pre[0]?.nome || "Primeiro atendimento";
