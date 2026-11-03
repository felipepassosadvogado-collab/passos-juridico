import { membroDaRota, erro, respostaLonga } from "@/lib/rota";
import { sugerirFasesProcessos, ErroClaude, type ProcessoParaFase } from "@/lib/claude";
import { faseCRM } from "@/lib/regras";
import { medir } from "@/lib/operacao";

export const maxDuration = 300;
const corte = (s: string | null | undefined, n: number) => { const t = (s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n) + " […]" : t; };

/** CRM: o Claude lê o histórico de cada processo SEM fase e sugere a fase. Só sugere: quem grava é a tela, depois da revisão. */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const { numeros } = await req.json().catch(() => ({ numeros: [] }));
  const lista = [...new Set((Array.isArray(numeros) ? numeros : []).map(String).filter((n) => /^\d{20}$/.test(n)))].slice(0, 20);
  if (!lista.length) return erro("Nenhum processo escolhido.");
  return respostaLonga(async () => {
    const { data: procs } = await m.sb.from("processos").select("numero,mascara,orgao,classe,ultimo_ato,cliente_nome,fase").in("numero", lista);
    const semFase = (procs || []).filter((p) => !faseCRM(p.fase)); // nunca mexe em processo já classificado
    if (!semFase.length) return { corpo: { sugestoes: {} } };
    const nums = semFase.map((p) => p.numero);
    const [pubs, evs, tars] = await Promise.all([
      m.sb.from("publicacoes").select("processo_numero,data,tipo_doc,tipo_com,texto,analise").in("processo_numero", nums).order("data", { ascending: false }).limit(nums.length * 12),
      m.sb.from("eventos").select("processo_numero,tipo,dados,em").in("processo_numero", nums).order("em", { ascending: false }).limit(nums.length * 15),
      m.sb.from("tarefas").select("processo_numero,descricao,status,vencimento").in("processo_numero", nums).order("vencimento", { ascending: false }).limit(nums.length * 10),
    ]);
    const entrada: ProcessoParaFase[] = semFase.map((p) => ({
      numero: p.numero, processo: p.mascara || p.numero, orgao: p.orgao, classe: p.classe, ultimoAto: p.ultimo_ato, cliente: p.cliente_nome,
      publicacoes: (pubs.data || []).filter((x) => x.processo_numero === p.numero).slice(0, 8).map((x) => ({ data: x.data, tipo: x.tipo_doc || x.tipo_com,
        resumo: corte((x.analise as { resumo?: string } | null)?.resumo, 300), texto: corte(x.texto, 900) })),
      historico: (evs.data || []).filter((x) => x.processo_numero === p.numero).slice(0, 10).map((x) => `${String(x.em).slice(0, 10)} ${x.tipo}: ${corte((x.dados as { texto?: string; fase?: string })?.texto || (x.dados as { fase?: string })?.fase || "", 200)}`),
      tarefas: (tars.data || []).filter((x) => x.processo_numero === p.numero).slice(0, 6).map((x) => `${x.vencimento} [${x.status}] ${corte(x.descricao, 150)}`),
    }));
    try {
      const sugestoes = await medir("claude.fases", () => sugerirFasesProcessos(entrada), { processos: entrada.length }, (r) => ({ sugeridas: Object.keys(r).length }));
      return { corpo: { sugestoes } };
    } catch (e) { return { corpo: { erro: e instanceof ErroClaude ? e.message : "O Claude não respondeu agora. Tente de novo." } }; }
  }, "claude.fases");
}
