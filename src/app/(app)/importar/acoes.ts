"use server";
import { exigirMembro } from "@/lib/sessao";
import { supabaseAdmin } from "@/lib/supabase/server";

const TABELAS = {
  clientes: "id", processos: "numero", publicacoes: "id", casos: "id", tarefas: "id",
  avisos_cliente: "id", mensagens: "id", documentos: "caminho",
} as const;
type Tabela = keyof typeof TABELAS | "eventos";

async function admTitular() {
  const { perfil } = await exigirMembro();
  if (perfil.papel !== "titular") throw new Error("Só o titular importa dados.");
  return supabaseAdmin();
}

/** Grava um lote vindo do painel antigo. Ids determinísticos: rodar de novo não duplica. */
export async function importarLote(tabela: Tabela, linhas: Record<string, unknown>[]) {
  if (!linhas.length) return { ok: 0 };
  let adm;
  try { adm = await admTitular(); } catch (e) { return { erro: e instanceof Error ? e.message : "Sem permissão." }; }
  if (tabela === "eventos") {
    const { error } = await adm.from("eventos").insert(linhas);
    return error ? { erro: `eventos: ${error.message}` } : { ok: linhas.length };
  }
  if (!(tabela in TABELAS)) return { erro: "Tabela não permitida." };
  const { error } = await adm.from(tabela).upsert(linhas, { onConflict: TABELAS[tabela as keyof typeof TABELAS] });
  return error ? { erro: `${tabela}: ${error.message}` } : { ok: linhas.length };
}

/** As tarefas importadas geram eventos automáticos com a data de hoje; troca pelos eventos originais. */
export async function limparEventosDasTarefas(ids: string[], desde: string) {
  let adm;
  try { adm = await admTitular(); } catch (e) { return { erro: e instanceof Error ? e.message : "Sem permissão." }; }
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await adm.from("eventos").delete().in("tarefa_id", ids.slice(i, i + 200)).gte("em", desde);
    if (error) return { erro: error.message };
  }
  return { ok: ids.length };
}

/** Evita duplicar a linha do tempo numa segunda importação. */
export async function jaImportado() {
  const adm = await admTitular();
  const { count } = await adm.from("eventos").select("id", { count: "exact", head: true }).eq("tipo", "importado");
  return (count || 0) > 0;
}
