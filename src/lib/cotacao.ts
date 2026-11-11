// Cotação do dólar para o painel de consumo: série 1 do Banco Central (SGS, dólar comercial, venda), último dia útil.
export type Cotacao = { valor: number; data: string; fonte: string };
export const FONTE_DOLAR = "Banco Central do Brasil, SGS 1 (dólar comercial, venda)";
const CHAVE = "consumo.cotacaoDolar";

export async function buscarDolar(f: typeof fetch = fetch): Promise<Cotacao> {
  const r = await f("https://api.bcb.gov.br/dados/serie/bcdata.sgs.1/dados/ultimos/1?formato=json", { headers: { accept: "application/json" }, cache: "no-store", signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error("Banco Central " + r.status);
  const l = (await r.json()) as { data: string; valor: string }[];
  const v = parseFloat(String(l?.[0]?.valor || "").replace(",", "."));
  if (!Array.isArray(l) || !(v > 0)) throw new Error("resposta inesperada do Banco Central");
  return { valor: v, data: l[0].data, fonte: FONTE_DOLAR };
}

/** a cotação guardada vale por 6 horas neste navegador; se o Banco Central não responder, usa a última conhecida */
export async function dolarDoDia(f: typeof fetch = fetch): Promise<Cotacao & { guardada?: boolean }> {
  let salva: (Cotacao & { em: number }) | null = null;
  try { salva = JSON.parse(localStorage.getItem(CHAVE) || "null"); } catch { /* sem armazenamento */ }
  if (salva && Date.now() - salva.em < 6 * 3600000) return salva;
  try { const c = await buscarDolar(f); try { localStorage.setItem(CHAVE, JSON.stringify({ ...c, em: Date.now() })); } catch { /* idem */ } return c; }
  catch (e) { if (salva) return { ...salva, guardada: true }; throw e; }
}

/** dólar efetivo: cotação + acréscimo do cartão (IOF e taxa do banco), em % */
export const dolarEfetivo = (cotacao: number, acrescimoPct: number) => cotacao * (1 + (acrescimoPct || 0) / 100);
export const reais = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
