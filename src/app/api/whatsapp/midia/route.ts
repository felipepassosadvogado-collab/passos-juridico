import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { INSTANCIA, evo } from "@/lib/whatsapp";

export const maxDuration = 60;
const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf", "audio/ogg": "ogg", "video/mp4": "mp4" };

/** baixa a foto, áudio ou documento recebido (do servidor do WhatsApp) e guarda no Storage; devolve um link temporário */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const { id } = await req.json().catch(() => ({})) as { id?: string };
  const adm = await supabaseAdmin();
  const { data: msg } = await adm.from("wa_mensagens").select("*").eq("id", String(id || "")).maybeSingle();
  if (!msg) return erro("Mensagem não encontrada.", 404);
  let caminho: string | null = msg.anexo;
  if (!caminho) {
    const key = (msg.bruto as { key?: Record<string, unknown> } | null)?.key;
    if (!key?.id) return erro("Esta mídia não pode mais ser baixada pelo sistema. Veja no celular.");
    try {
      const r = await evo<{ base64?: string; mimetype?: string; fileName?: string }>(`/chat/getBase64FromMediaMessage/${INSTANCIA()}`, "POST", { message: { key }, convertToMp4: false });
      if (!r?.base64) return erro("O WhatsApp não devolveu o arquivo (pode ter expirado).");
      const mime = (r.mimetype || msg.anexo_mime || "application/octet-stream").split(";")[0];
      const nome = msg.anexo_nome || r.fileName || `whatsapp.${EXT[mime] || "bin"}`;
      caminho = `whatsapp/${msg.conversa_id}/${msg.id}-${nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w.\-]+/g, "_").slice(-80)}`;
      const up = await adm.storage.from("documentos").upload(caminho, Buffer.from(r.base64, "base64"), { contentType: mime, upsert: true });
      if (up.error) return erro("Não consegui guardar o arquivo: " + up.error.message);
      await adm.from("wa_mensagens").update({ anexo: caminho, anexo_mime: mime, anexo_nome: nome }).eq("id", msg.id);
    } catch (e) { return erro((e as Error).message); }
  }
  const { data: link } = await adm.storage.from("documentos").createSignedUrl(caminho!, 3600);
  return NextResponse.json({ url: link?.signedUrl || null, caminho, nome: msg.anexo_nome, mime: msg.anexo_mime });
}
