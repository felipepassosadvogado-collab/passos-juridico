// Painel de consumo do Claude: cada chamada à API grava quantos tokens usou, de qual modelo e em qual função do
// sistema. O custo em dólar é calculado na tela, com os preços que o titular pode ajustar.
import { operacaoAtual } from "./operacao";

export type Uso = { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
type Admin = { from: (t: string) => { insert: (x: unknown) => PromiseLike<{ error: { message: string } | null }> } };
let adm: Promise<Admin> | null = null;

/** grava o uso de uma chamada; nunca atrapalha a operação (sem a tabela, ou sem a chave, só deixa de registrar) */
export async function registrarUso(modelo: string, u: Uso | null | undefined, ms: number, op = operacaoAtual()) {
  if (!u || !process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITEST) return;
  try {
    adm ||= import("./supabase/server").then((m) => m.supabaseAdmin() as unknown as Admin);
    const { error } = await (await adm).from("uso_claude").insert({ operacao: op.slice(0, 80), modelo, entrada: u.input_tokens || 0, saida: u.output_tokens || 0,
      cache_leitura: u.cache_read_input_tokens || 0, cache_escrita: u.cache_creation_input_tokens || 0, ms: Math.round(ms) });
    if (error && !/uso_claude/.test(error.message)) console.warn("uso_claude", error.message);
  } catch (e) { console.warn("uso_claude", (e as Error).message); }
}
