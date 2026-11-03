import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { medir } from "@/lib/operacao";
import { sincronizarDjen } from "@/lib/djen";

export const preferredRegion = "gru1";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** busca automática, chamada pela Vercel nos horários de vercel.json */
export async function GET(req: Request) {
  const segredo = process.env.CRON_SECRET;
  if (!segredo || !igual(req.headers.get("authorization") || "", `Bearer ${segredo}`)) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  // na busca automática ninguém está esperando na tela: a análise pelo Claude continua dentro do mesmo pedido, como antes
  const adm = await supabaseAdmin();
  const r = await medir("djen.busca.automatica", () => sincronizarDjen(adm, "automatica"), {}, (x) => ({ novas: x.novas, caixa: x.caixa, analisadas: x.analisadas, completa: !!x.completa, falhou: !!x.erro }));
  return NextResponse.json(r, { status: r.erro ? 502 : 200 });
}

function igual(a: string, b: string) { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
