import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";

export const maxDuration = 30;

// séries mensais do Banco Central (SGS): IPCA, IPCA-15, IPCA-E e Selic acumulada no mês
const SERIES = { ipca: 433, ipca15: 7478, ipcae: 10764, selic: 4390 } as const;

async function serie(cod: number): Promise<Record<string, number>> {
  const u = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${cod}/dados?formato=json&dataInicial=01/01/2005`;
  const r = await fetch(u, { next: { revalidate: 6 * 3600 }, headers: { accept: "application/json" } });
  if (!r.ok) throw new Error("BCB " + cod + " " + r.status);
  const l = (await r.json()) as { data: string; valor: string }[];
  const out: Record<string, number> = {};
  for (const x of l) { const [, m, a] = x.data.split("/"); out[`${a}-${m}`] = parseFloat(x.valor) / 100; }
  return out;
}

/** índices para o cálculo de atualização (Lei 14.905/2024 e Manual de Cálculos da Justiça Federal) */
export async function GET() {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  try {
    const [ipca, ipca15, ipcae, selic] = await Promise.all([serie(SERIES.ipca), serie(SERIES.ipca15), serie(SERIES.ipcae), serie(SERIES.selic)]);
    return NextResponse.json({ ipca, ipca15, ipcae, selic, fonte: "Banco Central do Brasil, SGS: IPCA (433), IPCA-15 (7478), IPCA-E (10764), Selic acumulada no mês (4390)", em: new Date().toISOString() });
  } catch (e) {
    console.warn("indices", e); return erro("Não consegui buscar os índices no Banco Central agora. Tente de novo em instantes.", 502);
  }
}
