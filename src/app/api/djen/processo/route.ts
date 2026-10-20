import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { buscarProcesso } from "@/lib/djen";
import { cnjValido } from "@/lib/cnj";

export const preferredRegion = "gru1";
export const dynamic = "force-dynamic";

/** dados de um processo no DJEN, para preencher o cadastro */
export async function GET(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const numero = new URL(req.url).searchParams.get("numero") || "";
  if (!cnjValido(numero)) return erro("Número CNJ inválido.");
  try { return NextResponse.json({ dados: await buscarProcesso(numero) }); }
  catch (e) { return erro("Não foi possível consultar o DJEN agora (" + ((e as Error).message || "falha") + "). Preencha à mão ou tente de novo.", 502); }
}
