import { NextResponse, after } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { analisarPendentes, analiseLigada, sincronizarDjen } from "@/lib/djen";
import { medir } from "@/lib/operacao";

// O DJEN só responde a acessos do Brasil: esta rota roda em São Paulo.
export const preferredRegion = "gru1";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * "Buscar no DJEN agora" (qualquer membro da equipe pode pedir).
 * A busca e a gravação na caixa acontecem durante o pedido (é o que a pessoa está esperando ver);
 * a análise pelo Claude, que é a parte demorada, continua em segundo plano depois da resposta:
 * as análises aparecem sozinhas na caixa, em tempo real. Cada busca fica registrada no histórico (Configurações → DJEN).
 */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const pd = await req.json().catch(() => ({})) as { dias?: number };
  const dias = Math.min(90, Math.max(0, Number(pd?.dias) || 0));
  const desde = dias ? new Date(Date.now() - dias * 864e5).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : undefined;
  const adm = await supabaseAdmin();
  const r = await medir("djen.busca.manual", () => sincronizarDjen(adm, "manual", false, { desde }), { dias }, (x) => ({ novas: x.novas, caixa: x.caixa, completa: !!x.completa, falhou: !!x.erro }));
  const ids = (r.novasIds || []).slice(0, 40);
  let analisando = 0;
  if (ids.length && await analiseLigada(adm)) {
    analisando = ids.length;
    // depois da resposta: pode ser repetida sem duplicar (pula as já analisadas e não cria aviso repetido)
    after(() => medir("djen.analise.fundo", () => analisarPendentes(adm, ids), { pedidas: ids.length }, (n) => ({ analisadas: n })).catch(() => { /* já registrado no log */ }));
  }
  const { novasIds: _ids, ...resposta } = r; // eslint-disable-line @typescript-eslint/no-unused-vars
  if (r.erro) return NextResponse.json({ ...resposta, analisando, erro: "A busca no DJEN falhou: " + r.erro + "." }, { status: 502 });
  return NextResponse.json({ ...resposta, analisando });
}
