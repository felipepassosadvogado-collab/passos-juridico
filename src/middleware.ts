import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Renova a sessão a cada requisição e manda para o login quem não entrou.
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const sb = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (lista) => {
        lista.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        lista.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await sb.auth.getUser();
  // as rotas /api conferem o acesso sozinhas (a busca automática do DJEN chega sem sessão, com a chave CRON_SECRET)
  const publica = /^\/(login|auth|api)(\/|$)/.test(req.nextUrl.pathname);
  if (!user && !publica) {
    const url = req.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("de", req.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|marca/).*)"] };
