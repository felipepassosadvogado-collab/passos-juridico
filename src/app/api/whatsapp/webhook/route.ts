import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { gravarMensagem, guardarEstado, statusWa } from "@/lib/whatsappDb";
import { rodarAgente } from "@/lib/agente";
import { medir } from "@/lib/operacao";

export const maxDuration = 120;
type Adm = Awaited<ReturnType<typeof supabaseAdmin>>;

/** recebe os eventos do servidor do WhatsApp (Evolution API): mensagens, confirmações de leitura, conexão e QR-code */
export async function POST(req: Request) {
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!segredo || !igual(new URL(req.url).searchParams.get("s") || "", segredo)) return NextResponse.json({ ok: false }, { status: 401 });
  const ev = await req.json().catch(() => null) as { event?: string; data?: unknown } | null;
  if (!ev?.event) return NextResponse.json({ ok: true });
  const nome = ev.event.toLowerCase().replace(/_/g, ".");
  const adm = await supabaseAdmin();
  try {
    if (nome === "messages.upsert" || nome === "send.message") for (const d of [ev.data].flat()) await mensagem(adm, d as Record<string, any>); // eslint-disable-line @typescript-eslint/no-explicit-any
    else if (nome === "messages.update") for (const d of [ev.data].flat()) await atualizacao(adm, d as Record<string, unknown>);
    else if (nome === "connection.update") await guardarEstado(adm, { estado: String((ev.data as { state?: string })?.state || ""), qr: null });
    else if (nome === "qrcode.updated") await guardarEstado(adm, { estado: "qr", qr: (ev.data as { qrcode?: { base64?: string } })?.qrcode?.base64 || null });
  } catch (e) { console.warn("whatsapp webhook", nome, e); }
  return NextResponse.json({ ok: true });
}

async function mensagem(adm: Adm, d: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const g = await gravarMensagem(adm, d); if (!g) return;
  const { conv, msgId, waId, deMim } = g;
  if (!deMim) after(() => medir("whatsapp.agente", () => rodarAgente(adm, conv.id, msgId), { conversa: conv.id }).catch(() => { /* já registrado no log */ }));
  else if (waId) after(async () => {
    // mensagem enviada pelo celular / WhatsApp Web (não pelo sistema): a equipe assumiu, o agente fica quieto por 12 horas
    await new Promise((ok) => setTimeout(ok, 5000)); // dá tempo do sistema registrar o que ele mesmo enviou
    const { data: r } = await adm.from("wa_mensagens").select("enviado_por,agente").eq("wa_id", waId).maybeSingle();
    if (r && !r.enviado_por && !r.agente) await adm.from("wa_conversas").update({ atendimento: "equipe", equipe_ate: new Date(Date.now() + 12 * 3600e3).toISOString(), aguardando_equipe: false, rascunho: null }).eq("id", conv.id);
  });
}

async function atualizacao(adm: Adm, d: Record<string, unknown>) {
  const id = String(d?.keyId || (d?.key as { id?: string })?.id || ""); const st = statusWa(d?.status);
  if (!id || !st) return;
  const ordem = ["enviando", "enviada", "entregue", "lida"];
  const { data: atual } = await adm.from("wa_mensagens").select("id,status").eq("wa_id", id).maybeSingle();
  if (!atual) return;
  if (st !== "erro" && ordem.indexOf(atual.status || "") >= ordem.indexOf(st)) return; // não volta de "lida" para "entregue"
  await adm.from("wa_mensagens").update({ status: st }).eq("id", atual.id);
}

function igual(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
