"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exigirMembro } from "@/lib/sessao";
import { cpfValido, mascaraCpf } from "@/lib/formato";

const CAMPOS = ["nome", "cpf", "rg", "nascimento", "nacionalidade", "estado_civil", "profissao", "nome_mae", "telefone", "email", "endereco", "cep", "cidade", "nb", "obs"] as const;

function lerForm(form: FormData) {
  const d: Record<string, string | null> = {};
  for (const k of CAMPOS) { const v = String(form.get(k) ?? "").trim(); d[k] = v || null; }
  if (d.cpf) d.cpf = mascaraCpf(d.cpf);
  return d;
}

export async function salvarCliente(_: unknown, form: FormData) {
  const { sb } = await exigirMembro();
  const id = String(form.get("id") || "");
  const d = lerForm(form);
  if (!d.nome) return { erro: "Informe o nome do cliente." };
  if (d.cpf && !cpfValido(d.cpf)) return { erro: "O CPF informado não é válido. Confira os números." };
  const r = id
    ? await sb.from("clientes").update({ ...d, atualizado_em: new Date().toISOString() }).eq("id", id).select("id").single()
    : await sb.from("clientes").insert(d).select("id").single();
  if (r.error) return { erro: r.error.code === "23505" ? "Já existe um cliente com esse CPF." : "Não foi possível salvar. Tente de novo." };
  revalidatePath("/clientes");
  if (!id) redirect("/clientes/" + r.data.id);
  revalidatePath("/clientes/" + id);
  return { ok: "Ficha salva." };
}
