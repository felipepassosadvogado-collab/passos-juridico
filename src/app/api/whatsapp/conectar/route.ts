import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { enderecoDoSite } from "@/lib/site";
import { ErroWa, INSTANCIA, configurado, evo } from "@/lib/whatsapp";

export const maxDuration = 30;
const EVENTOS = ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "SEND_MESSAGE", "CONNECTION_UPDATE", "QRCODE_UPDATED"];

async function estado(): Promise<string> {
  try { const r = await evo<{ instance?: { state?: string }; state?: string }>(`/instance/connectionState/${INSTANCIA()}`); return r?.instance?.state || r?.state || "desconhecido"; }
  catch (e) { if (e instanceof ErroWa && (e.message === "NAO_ENCONTRADO" || e.status === 404)) return "sem_instancia"; throw e; }
}

/** para onde a Evolution manda as mensagens: confere se é o endereço deste sistema, com a senha certa e ligado */
async function recebimento(sb: { from: (t: string) => any }) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET || "";
  const esperado = `${await enderecoDoSite()}/api/whatsapp/webhook`;
  let w: { url?: string; enabled?: boolean; events?: string[]; webhook?: { url?: string; enabled?: boolean; events?: string[] } } | null = null; let erroW = "";
  try { w = await evo(`/webhook/find/${INSTANCIA()}`); } catch (e) { erroW = (e as Error).message; }
  const cfg = w?.webhook || w || {}; const url = String(cfg.url || "");
  let problema = "";
  if (erroW) problema = "não consegui ler a configuração no servidor do WhatsApp";
  else if (!url) problema = "o servidor do WhatsApp está sem endereço para entregar as mensagens";
  else if (cfg.enabled === false) problema = "a entrega de mensagens está desligada no servidor do WhatsApp";
  else if (url.split("?")[0].replace(/\/+$/, "") !== esperado) problema = "o servidor do WhatsApp está entregando para outro endereço (" + url.split("?")[0].replace(/^https?:\/\//, "").split("/")[0] + ")";
  else if (!segredo || new URL(url).searchParams.get("s") !== segredo) problema = "a senha do endereço de entrega não confere com a da Vercel (WHATSAPP_WEBHOOK_SECRET)";
  else if (cfg.events?.length && !cfg.events.includes("MESSAGES_UPSERT")) problema = "o servidor do WhatsApp não está enviando o evento de mensagens novas";
  const { data: ult } = await sb.from("wa_mensagens").select("em").eq("de_mim", false).order("em", { ascending: false }).limit(1);
  return { ok: !problema, problema, ultimaRecebida: ult?.[0]?.em || null };
}

/** GET: situação da conexão · POST {acao: "conectar" | "desconectar"}: liga o WhatsApp pelo QR-code ou desliga (só o titular) */
export async function GET() {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  if (!configurado()) return NextResponse.json({ configurado: false, estado: "sem_servidor" });
  try { const e = await estado(); return NextResponse.json({ configurado: true, estado: e, ...(e === "open" ? { recebimento: await recebimento(m.sb) } : {}) }); }
  catch (e) { return NextResponse.json({ configurado: true, estado: "erro", erro: (e as Error).message }); }
}

export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  if (m.perfil.papel !== "titular") return erro("Só o titular conecta ou desconecta o WhatsApp.", 403);
  const { acao } = await req.json().catch(() => ({})) as { acao?: string };
  try {
    if (acao === "webhook") { // religa a entrega das mensagens sem desconectar
      const seg = process.env.WHATSAPP_WEBHOOK_SECRET; if (!seg) return erro("Falta cadastrar WHATSAPP_WEBHOOK_SECRET na Vercel.", 503);
      await evo(`/webhook/set/${INSTANCIA()}`, "POST", { webhook: { enabled: true, url: `${await enderecoDoSite()}/api/whatsapp/webhook?s=${encodeURIComponent(seg)}`, byEvents: false, base64: false, events: EVENTOS } });
      return NextResponse.json({ estado: "open", recebimento: await recebimento(m.sb) });
    }
    if (acao === "desconectar") { await evo(`/instance/logout/${INSTANCIA()}`, "DELETE").catch(() => null); return NextResponse.json({ estado: "close" }); }
    const segredo = process.env.WHATSAPP_WEBHOOK_SECRET;
    if (!segredo) return erro("Falta cadastrar WHATSAPP_WEBHOOK_SECRET na Vercel.", 503);
    const url = `${await enderecoDoSite()}/api/whatsapp/webhook?s=${encodeURIComponent(segredo)}`;
    let st = await estado();
    if (st === "sem_instancia") {
      await evo("/instance/create", "POST", { instanceName: INSTANCIA(), integration: "WHATSAPP-BAILEYS", qrcode: true, groupsIgnore: true, alwaysOnline: false, readMessages: false,
        webhook: { url, byEvents: false, base64: false, events: EVENTOS } });
      st = await estado();
    }
    // garante que os eventos chegam no endereço certo (o domínio do sistema pode ter mudado)
    await evo(`/webhook/set/${INSTANCIA()}`, "POST", { webhook: { enabled: true, url, byEvents: false, base64: false, events: EVENTOS } }).catch((e) => console.warn("webhook/set", e));
    if (st === "open") return NextResponse.json({ estado: "open" });
    const q = await evo<{ base64?: string; code?: string; pairingCode?: string; qrcode?: { base64?: string } }>(`/instance/connect/${INSTANCIA()}`);
    return NextResponse.json({ estado: st, qr: q?.base64 || q?.qrcode?.base64 || null });
  } catch (e) { return erro((e as Error).message, e instanceof ErroWa ? e.status : 500); }
}
