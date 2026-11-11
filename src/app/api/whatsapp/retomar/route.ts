import { NextResponse, after } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { rodarAgente } from "@/lib/agente";
import { medir } from "@/lib/operacao";

export const maxDuration = 60;

/** "Devolver ao assistente": ele volta a atender e, se a última mensagem for do cliente, já responde */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const pd = await req.json().catch(() => null) as { conversaId?: string } | null;
  if (!pd?.conversaId) return erro("Conversa não informada.");
  const adm = await supabaseAdmin();
  const { data: atual } = await adm.from("wa_conversas").select("agente_estado").eq("id", pd.conversaId).maybeSingle();
  if (!atual) return erro("Conversa não encontrada.", 404);
  // devolvido_em: as mensagens da equipe até aqui não seguram mais o assistente
  const { data: conv, error } = await adm.from("wa_conversas").update({ atendimento: "agente", equipe_ate: null, aguardando_equipe: false,
    agente_estado: { ...(atual.agente_estado || {}), devolvido_em: new Date().toISOString() } }).eq("id", pd.conversaId).select().single();
  if (error) return erro(error.message, 500);
  const { data: ultima } = await adm.from("wa_mensagens").select("id,de_mim").eq("conversa_id", pd.conversaId).order("em", { ascending: false }).limit(1).maybeSingle();
  const responde = !!ultima && !ultima.de_mim;
  if (responde) after(() => medir("whatsapp.agente", () => rodarAgente(adm, pd.conversaId!, ultima!.id, { esperaMs: 1500 }), { conversa: pd.conversaId, origem: "devolvido" }).catch(() => { /* já registrado no log */ }));
  return NextResponse.json({ ok: true, conversa: conv, responde });
}
