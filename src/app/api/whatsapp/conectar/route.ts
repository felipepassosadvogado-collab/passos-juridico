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

/** GET: situação da conexão · POST {acao: "conectar" | "desconectar"}: liga o WhatsApp pelo QR-code ou desliga (só o titular) */
export async function GET() {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  if (!configurado()) return NextResponse.json({ configurado: false, estado: "sem_servidor" });
  try { return NextResponse.json({ configurado: true, estado: await estado() }); }
  catch (e) { return NextResponse.json({ configurado: true, estado: "erro", erro: (e as Error).message }); }
}

export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  if (m.perfil.papel !== "titular") return erro("Só o titular conecta ou desconecta o WhatsApp.", 403);
  const { acao } = await req.json().catch(() => ({})) as { acao?: string };
  try {
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
