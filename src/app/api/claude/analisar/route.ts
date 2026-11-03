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
      const comAto: { p: (typeof lote)[number]; an: (typeof res)[string] }[] = [];
      for (const p of lote) {
        const an = res[String(p.id)]; if (!an) continue;
        // cada publicação tem a sua análise: continua uma gravação por publicação
        const { data } = await m.sb.from("publicacoes").update({ analise: an }).eq("id", p.id).select().single();
        if (data) atualizadas.push(data);
        if (an.intimarCliente) comAto.push({ p, an });
      }
      // avisos ao cliente e histórico em lote: 3 consultas por lote de 10 (antes: até 3 por publicação)
      if (comAto.length) {
        const { data: ja } = await m.sb.from("avisos_cliente").select("publicacao_id").in("publicacao_id", comAto.map((x) => x.p.id));
        const tem = new Set((ja || []).map((x: { publicacao_id: number }) => x.publicacao_id));
        const novos = comAto.filter((x) => !tem.has(x.p.id)).map(({ p, an }) => ({ processo_numero: p.processo_numero, publicacao_id: p.id, ...avisoDaAnalise(an) }));
        if (novos.length) {
          let { data: avs, error: eAv } = await m.sb.from("avisos_cliente").insert(novos).select();
          if (eAv) { avs = []; for (const x of novos) { const r = await m.sb.from("avisos_cliente").insert(x).select().single(); if (r.data) avs.push(r.data); } } // um com problema não impede os outros
          if (avs?.length) {
            avisos.push(...avs);
            await m.sb.from("eventos").insert(avs.map((av: { processo_numero: string; publicacao_id: number; tipo_evento?: string | null }) => ({ processo_numero: av.processo_numero, publicacao_id: av.publicacao_id, tipo: "aviso_criado", dados: { texto: (av.tipo_evento || "Ato") + " (pela análise do Claude)" }, por: m.user.id })));
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
