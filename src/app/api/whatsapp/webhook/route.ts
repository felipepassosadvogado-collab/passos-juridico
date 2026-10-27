import { timingSafeEqual } from "node:crypto";
import { NextResponse, after } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { RESUMO_TIPO, lerMensagem, telefoneDaChave } from "@/lib/whatsapp";
import { conversaDe, guardarEstado } from "@/lib/whatsappDb";
import { rodarAgente } from "@/lib/agente";

export const maxDuration = 120;
type Adm = Awaited<ReturnType<typeof supabaseAdmin>>;
const STATUS: Record<string, string> = { PENDING: "enviando", SERVER_ACK: "enviada", DELIVERY_ACK: "entregue", READ: "lida", PLAYED: "lida", ERROR: "erro" };

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
  const key = d?.key || {}; const jid = String(key.remoteJid || "");
  if (!jid || /@g\.us$|@broadcast$|@newsletter$|^status@/.test(jid)) return; // grupos, status e canais ficam de fora
  const m = lerMensagem(d.message);
  if (m.tipo === "reacao" || (m.tipo === "outro" && !m.texto && !d.message?.contactMessage)) return; // reações e mensagens de sistema
  const deMim = !!key.fromMe;
  const conv = await conversaDe(adm, jid, telefoneDaChave(key), deMim ? null : d.pushName || null);
  if (!conv) return;
  const em = d.messageTimestamp ? new Date(Number(d.messageTimestamp) * 1000).toISOString() : new Date().toISOString();
  const { data: ins } = await adm.from("wa_mensagens").upsert({
    conversa_id: conv.id, wa_id: key.id || null, de_mim: deMim, texto: m.texto || null, tipo: m.tipo, anexo_nome: m.nome || null, anexo_mime: m.mime || null,
    status: deMim ? STATUS[String(d.status || "")] || "enviada" : null, bruto: { key, messageType: d.messageType || null }, em,
  }, { onConflict: "wa_id", ignoreDuplicates: true }).select();
  if (!ins?.length) return; // já recebida (o sistema mesmo enviou)
  await adm.from("wa_conversas").update({ ultima_em: em, ultima_texto: (m.texto || RESUMO_TIPO[m.tipo] || "").slice(0, 200), arquivada: false,
    ...(deMim ? {} : { nao_lidas: (conv.nao_lidas || 0) + 1 }) }).eq("id", conv.id);
  const msgId = ins[0].id as string; const waId = key.id as string | undefined;
  if (!deMim) after(() => rodarAgente(adm, conv.id, msgId));
  else if (waId) after(async () => {
    // mensagem enviada pelo celular / WhatsApp Web (não pelo sistema): a equipe assumiu, o agente fica quieto por 12 horas
    await new Promise((ok) => setTimeout(ok, 5000)); // dá tempo do sistema registrar o que ele mesmo enviou
    const { data: r } = await adm.from("wa_mensagens").select("enviado_por,agente").eq("wa_id", waId).maybeSingle();
    if (r && !r.enviado_por && !r.agente) await adm.from("wa_conversas").update({ atendimento: "equipe", equipe_ate: new Date(Date.now() + 12 * 3600e3).toISOString(), aguardando_equipe: false, rascunho: null }).eq("id", conv.id);
  });
}

async function atualizacao(adm: Adm, d: Record<string, unknown>) {
  const id = String(d?.keyId || (d?.key as { id?: string })?.id || ""); const st = STATUS[String(d?.status || "")];
  if (!id || !st) return;
  const ordem = ["enviando", "enviada", "entregue", "lida"];
  const { data: atual } = await adm.from("wa_mensagens").select("id,status").eq("wa_id", id).maybeSingle();
  if (!atual) return;
  if (st !== "erro" && ordem.indexOf(atual.status || "") >= ordem.indexOf(st)) return; // não volta de "lida" para "entregue"
  await adm.from("wa_mensagens").update({ status: st }).eq("id", atual.id);
}

function igual(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
