// Observabilidade das operações demoradas: cada uma escreve no log da Vercel uma linha JSON com nome, duração,
// resultado e erro. Dá para filtrar por "op" no painel de logs e ver quanto cada coisa leva e quando falha.
/** qual operação está rodando agora (para o painel de consumo saber a que função cada chamada ao Claude pertence).
 *  Só existe no servidor; este arquivo também é importado por telas, então nada de import do Node aqui. */
type Als = { run<R>(s: { op: string }, f: () => R): R; getStore(): { op: string } | undefined };
const Classe: (new () => Als) | undefined = typeof window === "undefined"
  ? ((globalThis as { AsyncLocalStorage?: new () => Als }).AsyncLocalStorage
    ?? (globalThis as { process?: { getBuiltinModule?: (m: string) => { AsyncLocalStorage: new () => Als } | undefined } }).process?.getBuiltinModule?.("node:async_hooks")?.AsyncLocalStorage)
  : undefined;
const atual: Als | null = Classe ? new Classe() : null;
export const operacaoAtual = () => atual?.getStore()?.op || "outros";

export type Detalhes = Record<string, string | number | boolean | null | undefined>;

export function logOperacao(op: string, inicio: number, ok: boolean, det: Detalhes = {}, erro?: unknown) {
  const linha = { op, ms: Date.now() - inicio, ok, ...det, ...(erro ? { erro: String((erro as Error)?.message || erro).slice(0, 300) } : {}) };
  (ok ? console.info : console.warn)("[operacao] " + JSON.stringify(linha));
}

/** roda "fn" medindo o tempo; registra sucesso ou falha e devolve o resultado (o erro continua subindo) */
export async function medir<T>(op: string, fn: () => Promise<T>, det: Detalhes = {}, resumo?: (r: T) => Detalhes): Promise<T> {
  const t0 = Date.now();
  try { const r = await (atual ? atual.run({ op }, fn) : fn()); logOperacao(op, t0, true, { ...det, ...(resumo ? resumo(r) : {}) }); return r; }
  catch (e) { logOperacao(op, t0, false, det, e); throw e; }
}

/** o erro foi o tempo-limite estourado? (AbortSignal.timeout) */
export const estourouTempo = (e: unknown) => /TimeoutError|aborted|timeout/i.test(String((e as Error)?.name || "") + " " + String((e as Error)?.message || ""));
