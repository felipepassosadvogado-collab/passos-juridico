import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { analisarPublicacoes, ErroClaude } from "@/lib/claude";
import { avisoDaAnalise } from "@/lib/regras";

export const maxDuration = 300;

/** analisa publicações com o Claude e guarda a análise; cria o aviso ao cliente quando houver ato com o cliente */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const { ids } = await req.json().catch(() => ({ ids: [] }));
  const lista = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite).slice(0, 30);
  if (!lista.length) return erro("Nenhuma publicação escolhida.");
  const { data: pubs, error } = await m.sb.from("publicacoes").select("id,processo_numero,data,tipo_doc,tipo_com,orgao,texto").in("id", lista);
  if (error || !pubs?.length) return erro("Publicações não encontradas.", 404);
  const { data: procs } = await m.sb.from("processos").select("numero,mascara").in("numero", [...new Set(pubs.map((p) => p.processo_numero))]);
  const masc = Object.fromEntries((procs || []).map((p) => [p.numero, p.mascara]));
  const atualizadas = [], avisos = [];
  try {
    for (let i = 0; i < pubs.length; i += 10) {
      const lote = pubs.slice(i, i + 10);
      const res = await analisarPublicacoes(lote.map((p) => ({ ...p, mascara: masc[p.processo_numero] })));
      for (const p of lote) {
        const an = res[String(p.id)]; if (!an) continue;
        const { data } = await m.sb.from("publicacoes").update({ analise: an }).eq("id", p.id).select().single();
        if (data) atualizadas.push(data);
        if (an.intimarCliente) {
          const { data: ja } = await m.sb.from("avisos_cliente").select("id").eq("publicacao_id", p.id).maybeSingle();
          if (!ja) {
            const { data: av } = await m.sb.from("avisos_cliente").insert({ processo_numero: p.processo_numero, publicacao_id: p.id, ...avisoDaAnalise(an) }).select().single();
            if (av) { avisos.push(av); await m.sb.from("eventos").insert({ processo_numero: p.processo_numero, publicacao_id: p.id, tipo: "aviso_criado", dados: { texto: (av.tipo_evento || "Ato") + " (pela análise do Claude)" }, por: m.user.id }); }
          }
        }
      }
    }
  } catch (e) {
    if (e instanceof ErroClaude) return NextResponse.json({ erro: e.message, publicacoes: atualizadas, avisos }, { status: e.status });
    console.warn("analisar", e); return NextResponse.json({ erro: "A análise falhou. Tente de novo.", publicacoes: atualizadas, avisos }, { status: 500 });
  }
  return NextResponse.json({ publicacoes: atualizadas, avisos });
}
