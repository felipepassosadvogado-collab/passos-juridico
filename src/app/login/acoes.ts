"use server";
import { enderecoDoSite } from "@/lib/site";
import { redirect } from "next/navigation";
import { supabaseServidor, supabaseAdmin } from "@/lib/supabase/server";

export async function entrar(_: unknown, form: FormData) {
  const email = String(form.get("email") || "").trim();
  const senha = String(form.get("senha") || "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };
  const sb = await supabaseServidor();
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) return { erro: error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : "Não foi possível entrar. Tente de novo." };
  const destino = String(form.get("de") || "/");
  redirect(destino.startsWith("/") && !destino.startsWith("//") ? destino : "/");
}

export async function esqueciSenha(_: unknown, form: FormData) {
  const email = String(form.get("email") || "").trim().toLowerCase();
  if (!email) return { erro: "Informe o e-mail.", ok: "" };
  const redirectTo = (await enderecoDoSite()) + "/auth/confirmar";
  // pelo cliente administrativo o link funciona em qualquer aparelho (não depende de cookie deste navegador)
  try { await (await supabaseAdmin()).auth.resetPasswordForEmail(email, { redirectTo }); }
  catch { await (await supabaseServidor()).auth.resetPasswordForEmail(email, { redirectTo }); }
  return { erro: "", ok: "Se o e-mail estiver cadastrado, enviamos um link para criar nova senha." };
}
