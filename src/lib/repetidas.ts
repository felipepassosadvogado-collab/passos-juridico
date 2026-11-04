// Publicações repetidas no DJEN: o mesmo ato (ex.: um acórdão da Turma Recursal) às vezes chega em duas comunicações,
// com números diferentes (uma por destinatário, ou republicada dias depois). A busca pelo nome/OAB continua igual:
// tudo é gravado, mas a cópia sai da caixa de publicações para não virar tarefa em dobro.
import type { SupabaseClient } from "@supabase/supabase-js";
import { pedacos } from "./emLote";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type PubComparavel = { id: number; processo_numero: string; data: string; texto: string | null; tipo_doc?: string | null; orgao?: string | null; triagem?: string; analise?: any };

const DIAS_JANELA = 7; // republicação do mesmo ato costuma vir em poucos dias
const LIMIAR = 0.9; // 90% dos trechos de 3 palavras em comum

function palavras(t: string | null) {
  return (t || "").slice(0, 20000).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}
function trechos(p: string[]) { const s = new Set<string>(); for (let i = 0; i + 2 < p.length; i++) s.add(p[i] + " " + p[i + 1] + " " + p[i + 2]); return s; }
const dias = (a: string, b: string) => Math.abs(Date.parse(a + "T12:00:00Z") - Date.parse(b + "T12:00:00Z")) / 86400000;

// no eproc, um julgamento da Turma Recursal/TRF gera relatório, voto e acórdão (ementa): o DJEN manda cada um como
// uma comunicação "Acórdão", com textos diferentes. No mesmo processo, no mesmo dia e no mesmo órgão, é um julgamento só.
const JULGAMENTO = /ac[oó]rd[aã]o|relat[oó]rio|voto|ementa/i;
const DISPOSITIVO = /\bacordam\b|decidiu|por unanimidade|por maioria|(negar|dar|negou|deu) (parcial )?provimento/i;
export function mesmoJulgamento(a: PubComparavel, b: PubComparavel): boolean {
  if (a.processo_numero !== b.processo_numero || a.id === b.id || !a.data || a.data !== b.data) return false;
  if (!JULGAMENTO.test(a.tipo_doc || "") || !JULGAMENTO.test(b.tipo_doc || "")) return false;
  return !a.orgao || !b.orgao || a.orgao === b.orgao;
}

/** o texto é o mesmo ato? (igual, ou quase igual: muda só o cabeçalho do destinatário; ou partes do mesmo julgamento) */
export function mesmoAto(a: PubComparavel, b: PubComparavel): boolean {
  if (a.processo_numero !== b.processo_numero || a.id === b.id) return false;
  if (mesmoJulgamento(a, b)) return true;
  if (!a.data || !b.data || dias(a.data, b.data) > DIAS_JANELA) return false;
  const pa = palavras(a.texto), pb = palavras(b.texto);
  if (!pa.length || !pb.length) return false; // sem texto não dá para afirmar que é o mesmo ato
  // texto curto (aviso-padrão do eproc, "intimação realizada…") nunca basta: atos diferentes têm o mesmo texto
  if (pa.length < 30 || pb.length < 30) return false;
  if (pa.join(" ") === pb.join(" ")) return true;
  // números (evento, datas, valores, prazos) têm de ser os mesmos: intimações-padrão do eproc mudam só o nº do evento
  const nums = (p: string[]) => [...new Set(p.filter((x) => /^\d+$/.test(x)))].sort().join(" ");
  if (nums(pa) !== nums(pb)) return false;
  const ta = trechos(pa), tb = trechos(pb); let comum = 0; for (const x of ta) if (tb.has(x)) comum++;
  const menor = Math.min(ta.size, tb.size), maior = Math.max(ta.size, tb.size);
  return menor / maior >= 0.8 && comum / menor >= LIMIAR; // quase todo o texto em comum e tamanhos parecidos (muda só um cabeçalho)
}

/**
 * Agrupa as publicações de cada processo por ato. Em cada grupo, uma fica "ativa" na caixa: a que já tem tarefa ou,
 * se nenhuma tiver, a pendente mais completa (no julgamento, o acórdão com o resultado). Uma publicação concluída SEM
 * tarefa nunca serve de motivo para tirar outra da caixa: o prazo do ato continua aparecendo.
 * Devolve as cópias PENDENTES (sem tarefa) que podem sair da caixa.
 */
export function acharRepetidas(pubs: PubComparavel[], comTarefa: Set<number>, naoRepetidas: Set<number> = new Set()): { id: number; de: number }[] {
  const porProc = new Map<string, PubComparavel[]>();
  for (const p of pubs) (porProc.get(p.processo_numero) || porProc.set(p.processo_numero, []).get(p.processo_numero)!).push(p);
  const ativa = (p: PubComparavel) => comTarefa.has(p.id) || p.triagem !== "concluida";
  const peso = (p: PubComparavel) => [comTarefa.has(p.id) ? 0 : 1, ativa(p) ? 0 : 1, DISPOSITIVO.test((p.texto || "").slice(0, 20000)) ? 0 : 1, p.analise && !p.analise.repetidaDe ? 0 : 1, p.data, p.id] as const; // no julgamento, fica o acórdão (com o resultado), não o relatório
  const antes = (a: PubComparavel, b: PubComparavel) => { const x = peso(a), y = peso(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1; return 0; };
  const out: { id: number; de: number }[] = [];
  for (const lista of porProc.values()) {
    if (lista.length < 2) continue;
    lista.sort(antes); const grupos: { primeira: PubComparavel; ativa: PubComparavel | null }[] = [];
    for (const p of lista) {
      const g = grupos.find((x) => mesmoAto(x.primeira, p));
      if (!g) { grupos.push({ primeira: p, ativa: ativa(p) ? p : null }); continue; }
      if (!g.ativa) { if (ativa(p)) g.ativa = p; continue; }
      if (p.triagem !== "concluida" && !comTarefa.has(p.id) && !naoRepetidas.has(p.id)) out.push({ id: p.id, de: g.ativa.id });
    }
  }
  return out;
}

/** cópias tiradas por causa de uma publicação que já estava concluída sem tarefa (regra antiga): voltam para a caixa */
async function devolverTiradasSemMotivo(adm: SupabaseClient): Promise<number[]> {
  const desde = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
  const { data: tiradas } = await adm.from("publicacoes").select("id,analise,concluida_em").not("analise->repetidaDe", "is", null).eq("triagem", "concluida").gte("data", desde).limit(2000);
  if (!tiradas?.length) return [];
  const ids = [...new Set(tiradas.map((t: any) => +t.analise.repetidaDe))];
  const ficou = new Map<number, any>(); const comTarefa = new Set<number>();
  for (const lote of pedacos(ids, 300)) {
    const { data } = await adm.from("publicacoes").select("id,triagem,concluida_em").in("id", lote); for (const p of data || []) ficou.set(+p.id, p);
    const { data: ts } = await adm.from("tarefas").select("publicacao_id").in("publicacao_id", lote); for (const t of ts || []) if (t.publicacao_id != null) comTarefa.add(+t.publicacao_id);
  }
  const voltar = tiradas.filter((t: any) => {
    const f = ficou.get(+t.analise.repetidaDe);
    if (!f || f.triagem !== "concluida" || comTarefa.has(+f.id)) return false;
    return !f.concluida_em || !t.concluida_em || f.concluida_em <= t.concluida_em; // a que "ficou" já estava concluída quando a cópia saiu
  });
  const feitas: number[] = [];
  for (const t of voltar) {
    const { repetidaDe: _r, ...resto } = t.analise || {}; // eslint-disable-line @typescript-eslint/no-unused-vars
    if (String(resto.resumo || "").startsWith("Publicação repetida no DJEN")) delete resto.resumo;
    const { error } = await adm.from("publicacoes").update({ triagem: "pendente", concluida_em: null, concluida_por: null, analise: Object.keys(resto).length ? resto : null }).eq("id", t.id);
    if (!error) feitas.push(+t.id);
  }
  return feitas;
}

/** passa na caixa (pendentes) e tira as cópias; roda a cada busca no DJEN, então também limpa as repetidas antigas */
export async function tirarRepetidasDaCaixa(adm: SupabaseClient): Promise<number[]> {
  await devolverTiradasSemMotivo(adm); // corrige o que a regra antiga tirou; as cópias entre si voltam a ser juntadas abaixo
  const { data: pend } = await adm.from("publicacoes").select("id,processo_numero,data,texto,tipo_doc,orgao,triagem,analise").eq("triagem", "pendente").limit(2000);
  if (!pend?.length) return [];
  const procs = [...new Set(pend.map((p: PubComparavel) => p.processo_numero))];
  const desde = new Date(Date.parse(pend.reduce((m: string, p: PubComparavel) => (p.data < m ? p.data : m), pend[0].data) + "T12:00:00Z") - DIAS_JANELA * 86400000).toISOString().slice(0, 10);
  const todas = new Map<number, PubComparavel>(pend.map((p: PubComparavel) => [+p.id, p]));
  for (const lote of pedacos(procs, 200)) {
    const { data } = await adm.from("publicacoes").select("id,processo_numero,data,texto,tipo_doc,orgao,triagem,analise").in("processo_numero", lote).eq("triagem", "concluida").gte("data", desde);
    for (const p of data || []) todas.set(+p.id, p);
  }
  const comTarefa = new Set<number>();
  for (const lote of pedacos([...todas.keys()], 300)) {
    const { data } = await adm.from("tarefas").select("publicacao_id").in("publicacao_id", lote);
    for (const t of data || []) if (t.publicacao_id != null) comTarefa.add(+t.publicacao_id);
  }
  // as que alguém devolveu à caixa ("não é repetida") nunca saem de novo
  const { data: cfg } = await adm.from("config").select("valor").eq("chave", "repetidas").maybeSingle();
  const rep = acharRepetidas([...todas.values()], comTarefa, new Set(((cfg?.valor?.naoRepetidas as number[]) || []).map(Number)));
  const agora = new Date().toISOString(); const feitas: number[] = []; const t0 = Date.now();
  for (const r of rep) {
    if (Date.now() - t0 > 20000) break; // tempo-limite: o resto sai na próxima busca (a limpeza pode ser repetida sem efeito colateral) // poucas por busca; cada uma guarda de qual é cópia
    const velha = todas.get(r.id)?.analise || {};
    const { error } = await adm.from("publicacoes").update({ triagem: "concluida", concluida_em: agora,
      analise: { ...velha, repetidaDe: r.de, resumo: velha.resumo || `Publicação repetida no DJEN: é o mesmo ato (ou outra parte do mesmo julgamento: relatório, voto, acórdão) da comunicação nº ${r.de}, que ficou na caixa.` } }).eq("id", r.id).eq("triagem", "pendente");
    if (!error) feitas.push(r.id);
  }
  return feitas;
}
