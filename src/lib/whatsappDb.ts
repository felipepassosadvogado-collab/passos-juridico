// Gravação das conversas do WhatsApp no banco (lado do servidor).
import type { supabaseAdmin } from "@/lib/supabase/server";
import { chaveFone } from "./whatsapp";

export type Adm = Awaited<ReturnType<typeof supabaseAdmin>>;

export async function guardarEstado(adm: Adm, v: { estado: string; qr: string | null }) {
  await adm.from("config").upsert({ chave: "whatsapp", valor: { ...v, em: new Date().toISOString() } }, { onConflict: "chave" });
}

/** acha (ou cria) a conversa do contato e liga ao cliente pelo telefone da ficha */
export async function conversaDe(adm: Adm, jid: string, telefone: string, nomeWa?: string | null) {
  let { data: c } = await adm.from("wa_conversas").select("*").eq("jid", jid).maybeSingle();
  if (!c && telefone) {
    // o mesmo contato pode chegar com outro identificador (@lid ou com/sem o 9): procura pelo telefone
    const { data: l } = await adm.from("wa_conversas").select("*").not("telefone", "is", null);
    c = (l || []).find((x: { telefone: string }) => chaveFone(x.telefone) === chaveFone(telefone)) || null;
  }
  if (c) {
    const upd: Record<string, unknown> = {};
    if (telefone && !c.telefone) upd.telefone = telefone;
    if (nomeWa && nomeWa !== c.nome) upd.nome = nomeWa;
    if (!c.cliente_id && (telefone || c.telefone)) { const cli = await clientePorFone(adm, telefone || c.telefone); if (cli) upd.cliente_id = cli; }
    if (Object.keys(upd).length) { const { data } = await adm.from("wa_conversas").update(upd).eq("id", c.id).select().single(); if (data) c = data; }
    return c;
  }
  const cliente_id = telefone ? await clientePorFone(adm, telefone) : null;
  const { data: nova, error } = await adm.from("wa_conversas").insert({ jid, telefone: telefone || null, nome: nomeWa || null, cliente_id }).select().single();
  if (error && /duplicate/i.test(error.message)) return (await adm.from("wa_conversas").select("*").eq("jid", jid).single()).data;
  return nova;
}

export async function clientePorFone(adm: Adm, tel: string): Promise<string | null> {
  const k = chaveFone(tel); if (!k) return null;
  const { data } = await adm.from("clientes").select("id,telefone").not("telefone", "is", null).limit(5000);
  const achados = (data || []).filter((x: { telefone: string }) => String(x.telefone).split(/[\/,;]| e /).some((t) => chaveFone(t) === k));
  return achados.length === 1 ? achados[0].id : null; // dois clientes com o mesmo telefone: deixa para a equipe escolher
}

