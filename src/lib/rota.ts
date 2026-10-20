import { NextResponse } from "next/server";
import { supabaseServidor } from "./supabase/server";
import type { Perfil } from "./tipos";

/** usuário logado e ativo, para as rotas da API (sem redirecionar) */
export async function membroDaRota() {
  const sb = await supabaseServidor();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const { data: perfil } = await sb.from("profiles").select("*").eq("id", user.id).single<Perfil>();
  if (!perfil?.ativo) return null;
  return { sb, user, perfil };
}

export const erro = (msg: string, status = 400) => NextResponse.json({ erro: msg }, { status });
