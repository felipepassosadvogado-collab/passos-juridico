"use server";
import { redirect } from "next/navigation";
import { supabaseServidor } from "@/lib/supabase/server";

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
  const email = String(form.get("email") || "").trim();
  if (!email) return { erro: "Informe o e-mail.", ok: "" };
  const sb = await supabaseServidor();
  const base = process.env.NEXT_PUBLIC_SITE_URL || "";
  await sb.auth.resetPasswordForEmail(email, { redirectTo: base ? base + "/auth/nova-senha" : undefined });
  return { erro: "", ok: "Se o e-mail estiver cadastrado, enviamos um link para criar nova senha." };
}
