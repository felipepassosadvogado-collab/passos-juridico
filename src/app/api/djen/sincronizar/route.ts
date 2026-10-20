import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sincronizarDjen } from "@/lib/djen";

// O DJEN só responde a acessos do Brasil: esta rota roda em São Paulo.
export const preferredRegion = "gru1";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** "Buscar no DJEN agora" (qualquer membro da equipe pode pedir) */
export async function POST() {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const r = await sincronizarDjen(await supabaseAdmin(), "manual");
  if (r.erro) return NextResponse.json({ ...r, erro: "A busca no DJEN falhou: " + r.erro + "." }, { status: 502 });
  return NextResponse.json(r);
}
