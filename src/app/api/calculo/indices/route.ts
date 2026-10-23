import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { buscarIndices } from "@/lib/indicesBcb";

export const maxDuration = 60;

/** índices para o cálculo de atualização (Lei 14.905/2024 e Manual de Cálculos da Justiça Federal).
 *  Cada busca boa fica guardada; se o Banco Central falhar, usa a última guardada. */
export async function GET() {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const adm = await supabaseAdmin();
  const { data: guardado } = await adm.from("config").select("valor").eq("chave", "indices_bcb").maybeSingle();
  const g = guardado?.valor as { em?: string; ipcae?: unknown } | undefined;
  // a última busca tem menos de 12 horas: nem precisa ir ao Banco Central
  if (g?.ipcae && g.em && Date.now() - Date.parse(g.em) < 12 * 3600e3) return NextResponse.json(g);
  try {
    const ix = await buscarIndices();
    await adm.from("config").upsert({ chave: "indices_bcb", valor: ix }, { onConflict: "chave" });
    return NextResponse.json(ix);
  } catch (e) {
    console.warn("indices", e);
    if (g?.ipcae) return NextResponse.json({ ...g, guardado: true });
    return erro("Não consegui buscar os índices no Banco Central agora. Tente de novo em instantes.", 502);
  }
}
