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

/** resposta de tarefa demorada (Claude lendo um processo inteiro): manda um espaço a cada 8 s para o navegador
 *  (o Safari derruba a conexão depois de ~60 s sem receber nada) e, no fim, o JSON. Erros vão como { erro } com status 200. */
export function respostaLonga(trabalho: () => Promise<{ status?: number; corpo: unknown }>) {
  const enc = new TextEncoder();
  const corpo = new ReadableStream<Uint8Array>({
    async start(c) {
      c.enqueue(enc.encode(" "));
      const t = setInterval(() => { try { c.enqueue(enc.encode(" ")); } catch { /* já fechou */ } }, 8000);
      try { const r = await trabalho(); c.enqueue(enc.encode(JSON.stringify(r.corpo))); }
      catch (e) { console.warn("respostaLonga", e); c.enqueue(enc.encode(JSON.stringify({ erro: "Não consegui terminar agora. Tente de novo." }))); }
      finally { clearInterval(t); c.close(); }
    },
  });
  return new Response(corpo, { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
