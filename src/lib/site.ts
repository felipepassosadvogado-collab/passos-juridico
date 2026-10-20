import { headers } from "next/headers";

/** Endereço público do sistema, usado nos links de convite e de nova senha. */
export async function enderecoDoSite(): Promise<string> {
  const fixo = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
  if (fixo) return fixo.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const h = await headers();
  const host = h.get("x-forwarded-host") || h.get("host");
  return host ? `${h.get("x-forwarded-proto") || "https"}://${host}` : "";
}
