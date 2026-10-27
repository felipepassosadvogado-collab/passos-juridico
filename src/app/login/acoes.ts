"use server";
import { enderecoDoSite } from "@/lib/site";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { supabaseServidor, supabaseAdmin } from "@/lib/supabase/server";

export async function entrar(_: unknown, form: FormData) {
  const email = String(form.get("email") || "").trim();
  const senha = String(form.get("senha") || "");
  if (!email || !senha) return { erro: "Informe e-mail e senha." };
  if (email.length > 200 || senha.length > 200) return { erro: "E-mail ou senha incorretos." };
  // limite de tentativas: 5 erros no mesmo e-mail ou 20 no mesmo endereço de internet em 15 minutos bloqueiam por 15 minutos
  const ip = ((await headers()).get("x-forwarded-for") || "").split(",")[0].trim() || "?";
  const bloqueio = await tentativas(email.toLowerCase(), ip);
  if (bloqueio) return { erro: "Muitas tentativas erradas. Por segurança, espere 15 minutos e tente de novo (ou use “Esqueci a senha”)." };
  const sb = await supabaseServidor();
  const { error } = await sb.auth.signInWithPassword({ email, password: senha });
  if (error) { await registrarFalha(email.toLowerCase(), ip); return { erro: error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : "Não foi possível entrar. Tente de novo." }; }
  const destino = String(form.get("de") || "/");
  redirect(/^\/(?![\/\\])[^\s\\]*$/.test(destino) ? destino : "/");
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

const JANELA = 15 * 60e3;
async function tentativas(email: string, ip: string): Promise<boolean> {
  try {
    const adm = await supabaseAdmin(); const desde = new Date(Date.now() - JANELA).toISOString();
    const [{ count: porEmail }, { count: porIp }] = await Promise.all([
      adm.from("login_tentativas").select("id", { count: "exact", head: true }).eq("email", email).gte("em", desde),
      adm.from("login_tentativas").select("id", { count: "exact", head: true }).eq("ip", ip).gte("em", desde),
    ]);
    return (porEmail || 0) >= 5 || (porIp || 0) >= 20;
  } catch { return false; } // sem a tabela (etapa 0024) não bloqueia
}
async function registrarFalha(email: string, ip: string) {
  try { const adm = await supabaseAdmin(); await adm.from("login_tentativas").insert({ email, ip }); } catch { /* sem a tabela */ }
}
