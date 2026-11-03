// Publicações repetidas no DJEN: o mesmo ato (ex.: um acórdão da Turma Recursal) às vezes chega em duas comunicações,
// com números diferentes (uma por destinatário, ou republicada dias depois). A busca pelo nome/OAB continua igual:
// tudo é gravado, mas a cópia sai da caixa de publicações para não virar tarefa em dobro.
import type { SupabaseClient } from "@supabase/supabase-js";
import { pedacos } from "./emLote";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PubComparavel = { id: number; processo_numero: string; data: string; texto: string | null; triagem?: string; analise?: any };

const DIAS_JANELA = 7; // republicação do mesmo ato costuma vir em poucos dias
const LIMIAR = 0.9; // 90% dos trechos de 3 palavras em comum

function palavras(t: string | null) {
  return (t || "").slice(0, 20000).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}
function trechos(p: string[]) { const s = new Set<string>(); for (let i = 0; i + 2 < p.length; i++) s.add(p[i] + " " + p[i + 1] + " " + p[i + 2]); return s; }
const dias = (a: string, b: string) => Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000;

/** o texto é o mesmo ato? (igual, ou quase igual: muda só o cabeçalho do destinatário) */
export function mesmoAto(a: PubComparavel, b: PubComparavel): boolean {
  if (a.processo_numero !== b.processo_numero || a.id === b.id) return false;
  if (!a.data || !b.data || dias(a.data, b.data) > DIAS_JANELA) return false;
  const pa = palavras(a.texto), pb = palavras(b.texto);
  if (!pa.length || !pb.length) return false; // sem texto não dá para afirmar que é o mesmo ato
  if (pa.join(" ") === pb.join(" ")) return true;
  // números (evento, datas, valores, prazos) têm de ser os mesmos: intimações-padrão do eproc mudam só o nº do evento
  const nums = (p: string[]) => [...new Set(p.filter((x) => /^\d+$/.test(x)))].sort().join(" ");
  if (nums(pa) !== nums(pb)) return false;
  if (pa.length < 12 || pb.length < 12) return false; // texto curto demais: só se for idêntico
  const ta = trechos(pa), tb = trechos(pb); let comum = 0; for (const x of ta) if (tb.has(x)) comum++;
  const menor = Math.min(ta.size, tb.size), maior = Math.max(ta.size, tb.size);
  return menor / maior >= 0.8 && comum / menor >= LIMIAR; // quase todo o texto em comum e tamanhos parecidos (muda só um cabeçalho)
}

/**
 * Agrupa as publicações de cada processo por ato e escolhe a que fica: a que já tem tarefa, depois a que a equipe já
 * tratou, depois a já analisada, depois a mais antiga. Devolve as cópias PENDENTES (sem tarefa) que podem sair da caixa.
 */
export function acharRepetidas(pubs: PubComparavel[], comTarefa: Set<number>): { id: number; de: number }[] {
  const porProc = new Map<string, PubComparavel[]>();
  for (const p of pubs) (porProc.get(p.processo_numero) || porProc.set(p.processo_numero, []).get(p.processo_numero)!).push(p);
  const peso = (p: PubComparavel) => [comTarefa.has(p.id) ? 0 : 1, p.triagem === "concluida" ? 0 : 1, p.analise && !p.analise.repetidaDe ? 0 : 1, p.data, p.id] as const;
  const antes = (a: PubComparavel, b: PubComparavel) => { const x = peso(a), y = peso(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
  const out: { id: number; de: number }[] = [];
  for (const lista of porProc.values()) {
    if (lista.length < 2) continue;
    lista.sort(antes); const ficam: PubComparavel[] = [];
    for (const p of lista) {
      const igual = ficam.find((k) => mesmoAto(k, p));
      if (!igual) { ficam.push(p); continue; }
      if (p.triagem !== "concluida" && !comTarefa.has(p.id)) out.push({ id: p.id, de: igual.id });
    }
  }
  return out;
}

/** passa na caixa (pendentes) e tira as cópias; roda a cada busca no DJEN, então também limpa as repetidas antigas */
export async function tirarRepetidasDaCaixa(adm: SupabaseClient): Promise<number[]> {
  const { data: pend } = await adm.from("publicacoes").select("id,processo_numero,data,texto,triagem,analise").eq("triagem", "pendente").limit(2000);
  if (!pend?.length) return [];
  const procs = [...new Set(pend.map((p: PubComparavel) => p.processo_numero))];
  const desde = new Date(Date.parse(pend.reduce((m: string, p: PubComparavel) => (p.data < m ? p.data : m), pend[0].data) + "T12:00:00Z") - DIAS_JANELA * 86400000).toISOString().slice(0, 10);
  const todas = new Map<number, PubComparavel>(pend.map((p: PubComparavel) => [+p.id, p]));
  for (const lote of pedacos(procs, 200)) {
    const { data } = await adm.from("publicacoes").select("id,processo_numero,data,texto,triagem,analise").in("processo_numero", lote).eq("triagem", "concluida").gte("data", desde);
    for (const p of data || []) todas.set(+p.id, p);
  }
  const comTarefa = new Set<number>();
  for (const lote of pedacos([...todas.keys()], 300)) {
    const { data } = await adm.from("tarefas").select("publicacao_id").in("publicacao_id", lote);
    for (const t of data || []) if (t.publicacao_id != null) comTarefa.add(+t.publicacao_id);
  }
  const rep = acharRepetidas([...todas.values()], comTarefa);
  const agora = new Date().toISOString(); const feitas: number[] = [];
  for (const r of rep) { // poucas por busca; cada uma guarda de qual é cópia
    const velha = todas.get(r.id)?.analise || {};
    const { error } = await adm.from("publicacoes").update({ triagem: "concluida", concluida_em: agora,
      analise: { ...velha, repetidaDe: r.de, resumo: velha.resumo || `Publicação repetida no DJEN: é o mesmo ato da comunicação nº ${r.de}, que ficou na caixa.` } }).eq("id", r.id).eq("triagem", "pendente");
    if (!error) feitas.push(r.id);
  }
  return feitas;
}
