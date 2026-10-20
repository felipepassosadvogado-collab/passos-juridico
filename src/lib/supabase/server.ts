import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Cliente do Supabase para Server Components e Server Actions (age como o usuário logado). */
export async function supabaseServidor() {
  const loja = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => loja.getAll(),
      setAll: (lista) => {
        try { lista.forEach(({ name, value, options }) => loja.set(name, value, options)); }
        catch { /* chamado de um Server Component: o middleware renova a sessão */ }
      },
    },
  });
}

/** Cliente administrativo (chave service_role). Só no servidor, só para convites de equipe. */
export async function supabaseAdmin() {
  const { createClient } = await import("@supabase/supabase-js");
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!chave) throw new Error("SUPABASE_SERVICE_ROLE_KEY não configurada.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, chave, { auth: { persistSession: false } });
}
