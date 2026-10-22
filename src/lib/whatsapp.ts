// Ponte com a Evolution API (servidor próprio que mantém o WhatsApp do escritório conectado pelo QR-code).
// Só no servidor: a chave fica nas variáveis da Vercel (EVOLUTION_URL, EVOLUTION_API_KEY, EVOLUTION_INSTANCIA, WHATSAPP_WEBHOOK_SECRET).

export const INSTANCIA = () => process.env.EVOLUTION_INSTANCIA || "escritorio";
export const configurado = () => !!(process.env.EVOLUTION_URL && process.env.EVOLUTION_API_KEY);

export class ErroWa extends Error { constructor(msg: string, public status = 502) { super(msg); } }

/** chamada à Evolution API */
export async function evo<T = unknown>(caminho: string, metodo: "GET" | "POST" | "DELETE" | "PUT" = "GET", corpo?: unknown): Promise<T> {
  if (!configurado()) throw new ErroWa("O WhatsApp ainda não foi configurado: falta cadastrar EVOLUTION_URL e EVOLUTION_API_KEY na Vercel.", 503);
  const base = process.env.EVOLUTION_URL!.replace(/\/+$/, "");
  let r: Response;
  try {
    r = await fetch(base + caminho, { method: metodo, headers: { apikey: process.env.EVOLUTION_API_KEY!, "content-type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined, cache: "no-store" });
  } catch { throw new ErroWa("Não consegui falar com o servidor do WhatsApp. Ele está ligado?"); }
  const txt = await r.text(); let j: unknown = null; try { j = txt ? JSON.parse(txt) : null; } catch { j = txt; }
  if (!r.ok) {
    const m = JSON.stringify(j).slice(0, 300);
    if (r.status === 401 || r.status === 403) throw new ErroWa("O servidor do WhatsApp recusou a chave (EVOLUTION_API_KEY).", 503);
    throw new ErroWa(r.status === 404 ? "NAO_ENCONTRADO" : "O servidor do WhatsApp respondeu com erro: " + m, r.status);
  }
  return j as T;
}

/** só dígitos, com o 55 do Brasil */
export function soFone(s?: string | null) {
  let d = String(s || "").replace(/@.*$/, "").replace(/\D/g, "");
  if (!d) return "";
  if (d.length <= 11) d = "55" + d;
  return d;
}
/** chave para comparar telefones brasileiros com ou sem o 9 extra: DDD + 8 últimos dígitos */
export function chaveFone(s?: string | null) {
  const d = soFone(s); if (d.length < 12 || !d.startsWith("55")) return d;
  return d.slice(2, 4) + d.slice(-8);
}

/** identifica de quem é a mensagem: o JID do telefone (@s.whatsapp.net), mesmo quando o WhatsApp manda o @lid */
export function telefoneDaChave(key: Record<string, unknown> | undefined) {
  const cands = [key?.remoteJid, key?.remoteJidAlt, key?.senderPn, key?.participantPn, key?.participant].map((x) => String(x || ""));
  const pn = cands.find((x) => /@s\.whatsapp\.net$/.test(x));
  return pn ? soFone(pn) : "";
}

export type MsgWa = { tipo: string; texto: string; nome?: string; mime?: string };
/** texto e tipo de uma mensagem do WhatsApp (Baileys) */
export function lerMensagem(m: Record<string, any> | undefined): MsgWa { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (!m) return { tipo: "outro", texto: "" };
  if (m.ephemeralMessage?.message) return lerMensagem(m.ephemeralMessage.message);
  if (m.viewOnceMessage?.message) return lerMensagem(m.viewOnceMessage.message);
  if (m.viewOnceMessageV2?.message) return lerMensagem(m.viewOnceMessageV2.message);
  if (m.documentWithCaptionMessage?.message) return lerMensagem(m.documentWithCaptionMessage.message);
  if (typeof m.conversation === "string") return { tipo: "texto", texto: m.conversation };
  if (m.extendedTextMessage) return { tipo: "texto", texto: m.extendedTextMessage.text || "" };
  if (m.imageMessage) return { tipo: "imagem", texto: m.imageMessage.caption || "", mime: m.imageMessage.mimetype };
  if (m.videoMessage) return { tipo: "video", texto: m.videoMessage.caption || "", mime: m.videoMessage.mimetype };
  if (m.audioMessage) return { tipo: "audio", texto: "", mime: m.audioMessage.mimetype };
  if (m.documentMessage) return { tipo: "documento", texto: m.documentMessage.caption || "", nome: m.documentMessage.fileName || m.documentMessage.title, mime: m.documentMessage.mimetype };
  if (m.stickerMessage) return { tipo: "figurinha", texto: "", mime: m.stickerMessage.mimetype };
  if (m.contactMessage) return { tipo: "outro", texto: "[contato] " + (m.contactMessage.displayName || "") };
  if (m.locationMessage) return { tipo: "outro", texto: "[localização]" };
  if (m.reactionMessage) return { tipo: "reacao", texto: m.reactionMessage.text || "" };
  if (m.buttonsResponseMessage) return { tipo: "texto", texto: m.buttonsResponseMessage.selectedDisplayText || "" };
  if (m.listResponseMessage) return { tipo: "texto", texto: m.listResponseMessage.title || "" };
  return { tipo: "outro", texto: "" };
}

export const RESUMO_TIPO: Record<string, string> = { imagem: "📷 Foto", video: "🎥 Vídeo", audio: "🎤 Áudio", documento: "📄 Documento", figurinha: "Figurinha", outro: "Mensagem" };
