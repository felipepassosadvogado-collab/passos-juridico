// Atendimento pré-processual que virou processo sem ninguém ligar (o DJEN achou o processo antes da equipe cadastrar):
// liga sozinho quando não há dúvida — mesmo cliente, mesmo banco, processo novo, um só candidato de cada lado.
import type { SupabaseClient } from "@supabase/supabase-js";
import { PROTOCOLADO, colunasCrm, faseInicial, paresSemDuvida } from "./colunasCrm";
import { pedacos } from "./emLote";

type CasoLinha = { id: string; cliente_id: string | null; nome: string; banco: string | null; processo_numero: string | null; criado_em: string; valor_causa: number | null; honorarios_pct: number | null; responsavel: string | null };
type ProcLinha = { numero: string; cliente_id: string | null; cliente_nome: string | null; banco: string | null; reus: string[] | null; criado_em: string };

/** devolve quantos atendimentos foram ligados aos processos recém-criados (as linhas acabaram de ser gravadas) */
export async function ligarAtendimentosAosNovos(adm: SupabaseClient, linhas: Record<string, unknown>[]): Promise<number> {
  const agora = new Date().toISOString();
  const novos: ProcLinha[] = linhas.map((p) => ({ numero: String(p.numero), cliente_id: (p.cliente_id as string) || null, cliente_nome: (p.cliente_nome as string) || null, banco: (p.banco as string) || null, reus: (p.reus as string[]) || null, criado_em: agora }));
  const ids = [...new Set(novos.map((p) => p.cliente_id).filter(Boolean) as string[])];
  if (!ids.length) return 0;
  const casos: CasoLinha[] = [];
  for (const l of pedacos(ids, 200)) { const { data } = await adm.from("casos").select("id,cliente_id,nome,banco,processo_numero,criado_em,valor_causa,honorarios_pct,responsavel").in("cliente_id", l); casos.push(...((data || []) as CasoLinha[])); }
  const abertos = new Set(casos.filter((c) => !c.processo_numero).map((c) => c.cliente_id));
  if (!abertos.size) return 0; // nenhum atendimento esperando processo: nada a ligar
  const procs: ProcLinha[] = [];
  for (const l of pedacos([...abertos] as string[], 200)) { const { data } = await adm.from("processos").select("numero,cliente_id,cliente_nome,banco,reus,criado_em").in("cliente_id", l); procs.push(...((data || []) as ProcLinha[])); }
  for (const p of novos) { const x = procs.find((y) => y.numero === p.numero); if (x) x.criado_em ||= agora; else if (p.cliente_id && abertos.has(p.cliente_id)) procs.push(p); }
  // todos os processos do cliente entram na conta da dúvida; só se ligam os que acabaram de chegar
  const recem = new Set(novos.map((p) => p.numero));
  const pares = paresSemDuvida(casos, procs).filter((x) => recem.has(x.processo.numero));
  if (!pares.length) return 0;
  const { data: cfg } = await adm.from("config").select("valor").eq("chave", "crm_colunas").maybeSingle();
  const fase = faseInicial(colunasCrm({ crm_colunas: cfg?.valor })) || null;
  let n = 0;
  for (const { caso, processo } of pares) {
    const { data: feito, error } = await adm.from("casos").update({ processo_numero: processo.numero, etapa: PROTOCOLADO }).eq("id", caso.id).is("processo_numero", null).select("id");
    if (error || !feito?.length) continue; // alguém ligou antes
    const upd: Record<string, unknown> = { fase };
    if (caso.valor_causa) upd.valor_causa = caso.valor_causa;
    if (caso.honorarios_pct != null) upd.honorarios_pct = caso.honorarios_pct;
    if (caso.responsavel) upd.responsavel = caso.responsavel;
    await adm.from("processos").update(upd).eq("numero", processo.numero).is("fase", null);
    await adm.from("tarefas").update({ processo_numero: processo.numero }).eq("caso_id", caso.id).is("processo_numero", null).neq("status", "feito");
    await adm.from("eventos").insert([
      { caso_id: caso.id, tipo: "fase", por: null, dados: { fase: "Protocolado: processo encontrado no DJEN e ligado automaticamente" } },
      { processo_numero: processo.numero, tipo: "comentario", por: null, dados: { texto: "Originado do atendimento pré-processual (ligado automaticamente: mesmo cliente e mesmo banco). Confira." } },
    ]);
    n++;
  }
  return n;
}
