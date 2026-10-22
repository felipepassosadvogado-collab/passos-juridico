import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { ErroWa, INSTANCIA, RESUMO_TIPO, chaveFone, evo, soFone } from "@/lib/whatsapp";
import { conversaDe } from "@/lib/whatsappDb";

export const maxDuration = 30;
type Pedido = { conversaId?: string; telefone?: string; nome?: string; avulso?: boolean; texto?: string; anexo?: { caminho: string; nome: string; mime: string } };

/** envia uma mensagem pelo WhatsApp do escritório: resposta numa conversa ou mensagem nova para um cliente cadastrado */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const pd = await req.json().catch(() => null) as Pedido | null;
  const texto = String(pd?.texto || "").trim().slice(0, 4000);
  if (!texto && !pd?.anexo) return erro("Escreva a mensagem.");
  const adm = await supabaseAdmin();
  let conv: Record<string, any> | null = null; // eslint-disable-line @typescript-eslint/no-explicit-any
  if (pd?.conversaId) conv = (await adm.from("wa_conversas").select("*").eq("id", pd.conversaId).maybeSingle()).data;
  else if (pd?.telefone) {
    // mensagem nova: só para quem é cliente do escritório
    const fone = soFone(pd.telefone); if (fone.length < 12) return erro("Telefone inválido.");
    const { data: cs } = await adm.from("clientes").select("id,telefone").not("telefone", "is", null).limit(5000);
    const ehCliente = (cs || []).some((c: { telefone: string }) => String(c.telefone).split(/[\/,;]| e /).some((t) => chaveFone(t) === chaveFone(fone)));
    // número avulso só quando a pessoa escolheu "novo contato" na tela
    if (!ehCliente && !pd.avulso) return erro("Esse telefone não está na ficha de nenhum cliente. Use “Número avulso” em Nova conversa para falar com um contato novo.");
    conv = await conversaDe(adm, fone + "@s.whatsapp.net", fone, null);
    if (conv && pd.nome?.trim() && !conv.nome) { const { data } = await adm.from("wa_conversas").update({ nome: pd.nome.trim().slice(0, 120) }).eq("id", conv.id).select().single(); if (data) conv = data; }
  }
  if (!conv) return erro("Conversa não encontrada.", 404);
  const numero = conv.telefone || (/@s\.whatsapp\.net$/.test(conv.jid) ? soFone(conv.jid) : "");
  if (!numero) return erro("Não sei o telefone deste contato (o WhatsApp mandou só um identificador interno). Ligue a conversa a um cliente com telefone na ficha.");
  try {
    let r: { key?: { id?: string }; status?: string };
    let tipo = "texto";
    if (pd?.anexo?.caminho) {
      const { data: link } = await adm.storage.from("documentos").createSignedUrl(pd.anexo.caminho, 900);
      if (!link?.signedUrl) return erro("Não consegui preparar o arquivo para envio.");
      const mime = pd.anexo.mime || "application/octet-stream";
      tipo = /^image\//.test(mime) ? "imagem" : /^video\//.test(mime) ? "video" : /^audio\//.test(mime) ? "audio" : "documento";
      const mediatype = tipo === "imagem" ? "image" : tipo === "video" ? "video" : tipo === "audio" ? "audio" : "document";
      r = await evo(`/message/sendMedia/${INSTANCIA()}`, "POST", { number: numero, mediatype, mimetype: mime, caption: texto || undefined, media: link.signedUrl, fileName: pd.anexo.nome });
    } else r = await evo(`/message/sendText/${INSTANCIA()}`, "POST", { number: numero, text: texto });
    const em = new Date().toISOString();
    const { data: msg } = await adm.from("wa_mensagens").upsert({ conversa_id: conv.id, wa_id: r?.key?.id || null, de_mim: true, texto: texto || null, tipo,
      anexo: pd?.anexo?.caminho || null, anexo_nome: pd?.anexo?.nome || null, anexo_mime: pd?.anexo?.mime || null, status: "enviada", enviado_por: m.user.id, bruto: { key: r?.key || null }, em },
      { onConflict: "wa_id" }).select().single();
    await adm.from("wa_conversas").update({ ultima_em: em, ultima_texto: (texto || RESUMO_TIPO[tipo] || "").slice(0, 200), nao_lidas: 0, arquivada: false }).eq("id", conv.id);
    return NextResponse.json({ ok: true, mensagem: msg, conversaId: conv.id });
  } catch (e) {
    const msg = (e as Error).message;
    return erro(/exists.*false|not.*exist/i.test(msg) ? "Esse número não tem WhatsApp." : msg, e instanceof ErroWa ? e.status : 500);
  }
}
