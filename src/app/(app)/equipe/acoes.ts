"use server";
import { revalidatePath } from "next/cache";
import { exigirMembro } from "@/lib/sessao";
import { supabaseAdmin } from "@/lib/supabase/server";
import { enderecoDoSite } from "@/lib/site";

export async function convidar(_: unknown, form: FormData) {
  const { perfil } = await exigirMembro();
  if (perfil.papel !== "titular") return { erro: "Só o titular convida pessoas." };
  const email = String(form.get("email") || "").trim().toLowerCase(), nome = String(form.get("nome") || "").trim();
  if (!email || !nome) return { erro: "Informe nome e e-mail." };
  const base = await enderecoDoSite();
  if (!base) return { erro: "Não consegui descobrir o endereço do sistema para montar o link do convite." };
  try {
    const adm = await supabaseAdmin();
    const { data, error } = await adm.auth.admin.inviteUserByEmail(email, { data: { nome }, redirectTo: base + "/auth/confirmar" });
    if (error && /already|registered|exists/i.test(error.message)) {
      // já convidada antes: manda um link novo para criar a senha
      const r = await adm.auth.resetPasswordForEmail(email, { redirectTo: base + "/auth/confirmar" });
      if (r.error) return { erro: "Esse e-mail já está cadastrado e não consegui reenviar o link: " + r.error.message };
      revalidatePath("/equipe");
      return { ok: `Esse e-mail já estava cadastrado. Enviei um link novo para ${email} criar a senha.` };
    }
    if (error) return { erro: "Não foi possível enviar o convite: " + error.message };
    const funcao = String(form.get("funcao") || "").trim();
    if (data.user && funcao) await adm.from("profiles").update({ funcao }).eq("id", data.user.id);
  } catch { return { erro: "Falta configurar a chave SUPABASE_SERVICE_ROLE_KEY na Vercel." }; }
  revalidatePath("/equipe");
  return { ok: `Convite enviado para ${email}. A pessoa recebe um e-mail para criar a senha.` };
}

export async function alterarMembro(_: unknown, form: FormData) {
  const { sb, perfil } = await exigirMembro();
  const id = String(form.get("id"));
  const dados: Record<string, string | boolean> = {};
  if (form.has("nome")) dados.nome = String(form.get("nome")).trim();
  if (form.has("funcao")) dados.funcao = String(form.get("funcao")).trim();
  if (perfil.papel === "titular" && id !== perfil.id) {
    if (form.has("papel")) dados.papel = String(form.get("papel"));
    dados.ativo = form.get("ativo") === "on";
  }
  const { error } = await sb.from("profiles").update(dados).eq("id", id);
  if (error) return { erro: error.message.startsWith("Só") || error.message.startsWith("Você") ? error.message : "Não foi possível salvar." };
  revalidatePath("/equipe");
  return { ok: "Salvo." };
}
