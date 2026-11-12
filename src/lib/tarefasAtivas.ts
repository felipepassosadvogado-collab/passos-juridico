// Peça aprovada gera a tarefa "Protocolar" (com o prazo escolhido na aprovação). A tarefa de elaboração continua
// "aprovada" até o protocolo, mas não é mais trabalho a fazer: quem vale é a tarefa de protocolo. Sem isto, a agenda e
// os contadores mostravam o protocolo duas vezes, uma delas no vencimento antigo da elaboração (como atrasada).
type T = { id: string; status: string; origem_id?: string | null };

/** ids das tarefas aprovadas que já têm a tarefa de protocolo criada */
export function substituidasPorProtocolo(tarefas: Iterable<T>): Set<string> {
  const lista = [...tarefas]; const origens = new Set(lista.map((t) => t.origem_id).filter(Boolean) as string[]);
  return new Set(lista.filter((t) => t.status === "aprovada" && origens.has(t.id)).map((t) => t.id));
}

type TL = { id: string; status: string; processo_numero?: string | null; responsavel?: string | null; criado_por?: string | null; criado_em?: string | null; publicacao_id?: number | null; descricao: string; tipo?: string | null; vencimento?: string | null };

/**
 * Ao gerar a peça fora da tarefa: as tarefas MINHAS ainda abertas neste processo, a melhor primeiro (a da mesma
 * intimação, depois a criada por outra pessoa para mim, depois a de assunto parecido, depois a mais recente).
 * Assim a minuta segue na tarefa que já existe, em vez de criar uma tarefa duplicada.
 */
export function tarefasParaLigar<X extends TL>(tarefas: X[], numero: string, eu: string, publicacaoId?: number | null, assunto?: RegExp): X[] {
  const nota = (t: X) => (publicacaoId && t.publicacao_id === publicacaoId ? 0 : 4) + (t.criado_por && t.criado_por !== eu ? 0 : 2) + (assunto && assunto.test(t.descricao + " " + (t.tipo || "")) ? 0 : 1);
  return tarefas.filter((t) => t.processo_numero === numero && t.responsavel === eu && !["revisao", "feito", "aprovada"].includes(t.status) && !/^protocol/i.test(t.tipo || t.descricao))
    .sort((a, b) => nota(a) - nota(b) || (b.criado_em || "").localeCompare(a.criado_em || ""));
}

/**
 * Tarefa que deu origem a esta, quando ela foi criada separada ao gerar a peça (ex.: o titular criou "Recurso
 * inominado" para a Amanda; ela gerou a peça fora da tarefa e o sistema criou "Recurso Inominado: corrigir a minuta").
 */
export function tarefaDeOrigem<X extends TL>(t: TL, tarefas: X[]): X | null {
  if (!t.processo_numero || !t.criado_em || t.criado_por !== t.responsavel) return null; // criada pela própria pessoa ao gerar a peça
  const ini = Date.parse(t.criado_em), limite = ini - 60 * 86400000;
  const cands = tarefas.filter((x) => x.id !== t.id && x.processo_numero === t.processo_numero && x.responsavel === t.responsavel && x.criado_por && x.criado_por !== t.responsavel
    && x.criado_em && Date.parse(x.criado_em) < ini && Date.parse(x.criado_em) >= limite && !/^protocol/i.test(x.tipo || x.descricao));
  const mesmaPub = cands.filter((x) => t.publicacao_id && x.publicacao_id === t.publicacao_id);
  return (mesmaPub.length ? mesmaPub : cands).sort((a, b) => (b.criado_em || "").localeCompare(a.criado_em || ""))[0] || null;
}
