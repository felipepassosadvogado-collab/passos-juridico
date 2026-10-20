"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirMembro } from "@/lib/sessao";
import { cnjValido, soDigitos } from "@/lib/cnj";
import { bancoDosReus } from "@/lib/formato";

export async function cadastrarProcesso(_: unknown, form: FormData) {
  const { sb, user } = await exigirMembro();
  const numero = soDigitos(String(form.get("numero") || ""));
  if (!cnjValido(numero)) return { erro: "Número CNJ inválido. Confira os dígitos." };
  const reus = String(form.get("reus") || "").split(";").map((x) => x.trim()).filter(Boolean);
  const clienteId = String(form.get("cliente_id") || "") || null;
  let clienteNome = String(form.get("cliente_nome") || "").trim();
  if (clienteId && !clienteNome) { const { data } = await sb.from("clientes").select("nome").eq("id", clienteId).single(); clienteNome = data?.nome || ""; }
  const r = await sb.from("processos").insert({
    numero, tribunal: String(form.get("tribunal") || "") || null, orgao: String(form.get("orgao") || "") || null,
    cidade: String(form.get("cidade") || "") || null, classe: String(form.get("classe") || "") || null,
    cliente_id: clienteId, cliente_nome: clienteNome, reus, banco: bancoDosReus(reus) || null,
    fase: String(form.get("fase") || "") || null, responsavel: String(form.get("responsavel") || "") || null, cadastro_manual: true,
  });
  if (r.error) return { erro: r.error.code === "23505" ? "Esse processo já está cadastrado." : "Não foi possível cadastrar. Tente de novo." };
  await sb.from("eventos").insert({ processo_numero: numero, tipo: "processo_cadastrado", dados: {}, por: user.id });
  revalidatePath("/processos");
  redirect("/processos/" + numero);
}

export async function salvarProcesso(_: unknown, form: FormData) {
  const { sb, user } = await exigirMembro();
  const numero = String(form.get("numero"));
  const { data: antes } = await sb.from("processos").select("fase,responsavel,cliente_id").eq("numero", numero).single();
  const novo = {
    fase: String(form.get("fase") || "") || null,
    responsavel: String(form.get("responsavel") || "") || null,
    cliente_id: String(form.get("cliente_id") || "") || null,
    notas: String(form.get("notas") || "") || null,
  };
  const r = await sb.from("processos").update(novo).eq("numero", numero);
  if (r.error) return { erro: "Não foi possível salvar." };
  const ev = [];
  if (antes && novo.fase !== antes.fase) ev.push({ processo_numero: numero, tipo: "fase", dados: { fase: novo.fase }, por: user.id });
  if (antes && novo.responsavel !== antes.responsavel) ev.push({ processo_numero: numero, tipo: "responsavel", dados: { responsavel: novo.responsavel }, por: user.id });
  if (ev.length) await sb.from("eventos").insert(ev);
  revalidatePath("/processos/" + numero);
  return { ok: "Processo atualizado." };
}

export async function comentar(_: unknown, form: FormData) {
  const { sb, user } = await exigirMembro();
  const numero = String(form.get("numero")); const texto = String(form.get("texto") || "").trim();
  if (!texto) return { erro: "Escreva a anotação." };
  const r = await sb.from("eventos").insert({ processo_numero: numero, tipo: "comentario", dados: { texto: texto.slice(0, 4000) }, por: user.id });
  if (r.error) return { erro: "Não foi possível registrar." };
  revalidatePath("/processos/" + numero);
  return { ok: "" };
}
