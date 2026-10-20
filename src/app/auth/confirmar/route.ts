import { NextResponse } from "next/server";
import { supabaseServidor } from "@/lib/supabase/server";
import type { EmailOtpType } from "@supabase/supabase-js";

// Link do e-mail de convite ou de nova senha: valida o código e leva para criar a senha.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const token_hash = url.searchParams.get("token_hash"), type = url.searchParams.get("type") as EmailOtpType | null;
  const code = url.searchParams.get("code");
  const sb = await supabaseServidor();
  const { error } = token_hash && type ? await sb.auth.verifyOtp({ token_hash, type }) : code ? await sb.auth.exchangeCodeForSession(code) : { error: new Error("link") };
  return NextResponse.redirect(new URL(error ? "/login?erro=link" : "/auth/nova-senha", req.url));
}
