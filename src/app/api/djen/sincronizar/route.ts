import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { sincronizarDjen } from "@/lib/djen";

// O DJEN só responde a acessos do Brasil: esta rota roda em São Paulo.
export const preferredRegion = "gru1";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** "Buscar no DJEN agora" (qualquer membro da equipe pode pedir) */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const pd = await req.json().catch(() => ({})) as { dias?: number };
  const dias = Math.min(90, Math.max(0, Number(pd?.dias) || 0));
  const desde = dias ? new Date(Date.now() - dias * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : undefined;
  const r = await sincronizarDjen(await supabaseAdmin(), "manual", true, { desde });
  if (r.erro) return NextResponse.json({ ...r, erro: "A busca no DJEN falhou: " + r.erro + "." }, { status: 502 });
  return NextResponse.json(r);
}
