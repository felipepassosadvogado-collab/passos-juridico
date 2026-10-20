import { redirect } from "next/navigation";
import { supabaseServidor } from "./supabase/server";
import type { Perfil } from "./tipos";

/** Usuário logado e seu perfil; manda para o login se não houver sessão ou se o acesso foi desativado. */
export async function exigirMembro() {
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const { data: perfil } = await sb.from("profiles").select("*").eq("id", user.id).single<Perfil>();
  if (!perfil || !perfil.ativo) redirect("/login?erro=inativo");
  return { sb, user, perfil };
}

/** Nomes da equipe por id, para mostrar "quem fez". */
export async function mapaEquipe(sb: Awaited<ReturnType<typeof supabaseServidor>>) {
  const { data } = await sb.from("profiles").select("id,nome,funcao,papel,ativo").order("nome");
  const lista = (data || []) as Perfil[];
  return { lista, nome: (id?: string | null) => (id ? lista.find((p) => p.id === id)?.nome || "Membro removido" : "Sem responsável") };
}
