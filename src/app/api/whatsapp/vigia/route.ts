// Vigia do WhatsApp (ver lib/whatsappVigia.ts). Chamado pela Vercel (CRON_SECRET) e pelo sistema aberto a cada
// ~10 minutos; roda no máximo a cada 8 minutos (os outros pedidos só recebem o último resultado).
// ?agora=1 (titular): roda já.
import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { membroDaRota } from "@/lib/rota";
import { medir } from "@/lib/operacao";
import { configurado } from "@/lib/whatsapp";
import { vigiar, type EstadoVigia } from "@/lib/whatsappVigia";

export const preferredRegion = "gru1";
export const maxDuration = 120;
export const dynamic = "force-dynamic";
const INTERVALO = 8 * 60e3, TRAVA = 3 * 60e3;

export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  const cron = !!segredo && igual(req.headers.get("authorization") || "", `Bearer ${segredo}`);
  const m = cron ? null : await membroDaRota();
  if (!cron && !m) return NextResponse.json({ erro: "Entre no sistema de novo." }, { status: 401 });
  if (!configurado()) return NextResponse.json({ vigia: null, configurado: false });
  const adm = await supabaseAdmin();
  const { data: cfg } = await adm.from("config").select("chave,valor").in("chave", ["whatsapp_vigia", "whatsapp_vigia_trava"]);
  const ant = (cfg?.find((c: { chave: string }) => c.chave === "whatsapp_vigia")?.valor || null) as EstadoVigia | null;
  const trava = cfg?.find((c: { chave: string }) => c.chave === "whatsapp_vigia_trava")?.valor as { em?: string } | undefined;
  const agoraPedido = new URL(req.url).searchParams.get("agora") === "1" && m?.perfil.papel === "titular";
  const recente = ant?.em && Date.now() - new Date(ant.em).getTime() < INTERVALO;
  const rodando = trava?.em && Date.now() - new Date(trava.em).getTime() < TRAVA;
  if ((recente && !agoraPedido) || rodando) return NextResponse.json({ vigia: ant, rodou: false });
  await adm.from("config").upsert({ chave: "whatsapp_vigia_trava", valor: { em: new Date().toISOString() } }, { onConflict: "chave" });
  try {
    const r = await medir("whatsapp.vigia", () => vigiar(adm, ant), { origem: cron ? "cron" : agoraPedido ? "titular" : "sistema" },
      (x) => ({ estado: x.estado, ok: x.ok, sonda: x.sonda, recuperadas: x.recuperadas }));
    await adm.from("config").upsert({ chave: "whatsapp_vigia", valor: r }, { onConflict: "chave" });
    return NextResponse.json({ vigia: r, rodou: true });
  } finally {
    await adm.from("config").upsert({ chave: "whatsapp_vigia_trava", valor: { em: null } }, { onConflict: "chave" });
  }
}

function igual(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
