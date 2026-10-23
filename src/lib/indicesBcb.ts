// Índices mensais do Banco Central (SGS): IPCA, IPCA-15, IPCA-E e Selic acumulada no mês.
// Usado no servidor e, se o servidor não conseguir falar com o BCB, direto no navegador.
export const SERIES = { ipca: 433, ipca15: 7478, ipcae: 10764, selic: 4390 } as const;
export const FONTE = "Banco Central do Brasil, SGS: IPCA (433), IPCA-15 (7478), IPCA-E (10764), Selic acumulada no mês (4390)";
export type IndicesBcb = { ipca: Record<string, number>; ipca15: Record<string, number>; ipcae: Record<string, number>; selic: Record<string, number>; fonte: string; em: string };

const br = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;

/** uma série inteira, em janelas de até 10 anos (o BCB recusa consultas mais longas), com novas tentativas */
async function serie(cod: number, f: typeof fetch): Promise<Record<string, number>> {
  const out: Record<string, number> = {}; const hoje = new Date();
  for (let ano = 2005; ano <= hoje.getFullYear(); ano += 10) {
    const fim = new Date(Math.min(new Date(ano + 9, 11, 31).getTime(), hoje.getTime()));
    const u = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cod}/dados?formato=json&dataInicial=01/01/${ano}&dataFinal=${br(fim)}`;
    let ultimoErro: unknown = null;
    for (let t = 0; t < 3; t++) {
      try {
        const ctl = new AbortController(); const tm = setTimeout(() => ctl.abort(), 15000);
        const r = await f(u, { headers: { accept: "application/json" }, signal: ctl.signal, cache: "no-store" }).finally(() => clearTimeout(tm));
        if (r.status === 404) break; // sem dados nesse período
        if (!r.ok) throw new Error("BCB " + cod + " " + r.status);
        const l = (await r.json()) as { data: string; valor: string }[];
        if (!Array.isArray(l)) throw new Error("BCB " + cod + " resposta inesperada");
        for (const x of l) { const [, m, a] = x.data.split("/"); out[`${a}-${m}`] = parseFloat(x.valor) / 100; }
        ultimoErro = null; break;
      } catch (e) { ultimoErro = e; await new Promise((ok) => setTimeout(ok, 1200 * (t + 1))); }
    }
    if (ultimoErro) throw ultimoErro;
  }
  if (!Object.keys(out).length) throw new Error("BCB " + cod + " vazio");
  return out;
}

export async function buscarIndices(f: typeof fetch = fetch): Promise<IndicesBcb> {
  const [ipca, ipca15, ipcae, selic] = await Promise.all([serie(SERIES.ipca, f), serie(SERIES.ipca15, f), serie(SERIES.ipcae, f), serie(SERIES.selic, f)]);
  return { ipca, ipca15, ipcae, selic, fonte: FONTE, em: new Date().toISOString() };
}

/** no navegador: pede ao sistema; se o sistema não conseguir, busca direto no Banco Central */
export async function obterIndices(): Promise<IndicesBcb> {
  try {
    const r = await fetch("/api/calculo/indices"); const j = await r.json().catch(() => ({}));
    if (r.ok && j.ipcae) return j;
  } catch { /* tenta direto */ }
  try { return await buscarIndices(fetch.bind(window)); }
  catch { throw new Error("O Banco Central não respondeu (nem pelo sistema, nem direto). Tente de novo em alguns minutos."); }
}
