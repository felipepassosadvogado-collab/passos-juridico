import { NextResponse } from "next/server";
import { membroDaRota, erro } from "@/lib/rota";
import { supabaseAdmin } from "@/lib/supabase/server";
import { pedirJson, blocoArquivo, PROMPT_DOCS, promptExtrato, ErroClaude } from "@/lib/claude";

export const maxDuration = 120;

/** lê documentos do cliente ou o extrato do INSS (arquivos enviados antes para a pasta temporária) */
export async function POST(req: Request) {
  const m = await membroDaRota(); if (!m) return erro("Entre no sistema de novo.", 401);
  const corpo = await req.json().catch(() => null) as { tipo?: string; arquivos?: { caminho: string; mime: string }[]; banco?: string } | null;
  const arquivos = (corpo?.arquivos || []).filter((a) => typeof a.caminho === "string" && a.caminho.startsWith(`leitura/${m.user.id}/`)).slice(0, 8);
  if (!arquivos.length) return erro("Nenhum arquivo para ler.");
  const adm = await supabaseAdmin();
  try {
    const blocos = [];
    for (const a of arquivos) {
      const { data, error } = await adm.storage.from("documentos").download(a.caminho);
      if (error || !data) return erro("Não consegui abrir um dos arquivos. Envie de novo.");
      blocos.push(blocoArquivo(a.mime, Buffer.from(await data.arrayBuffer()).toString("base64")));
    }
    const prompt = corpo?.tipo === "extrato" ? promptExtrato(corpo.banco) : PROMPT_DOCS + `\n\nNúmero de arquivos: ${arquivos.length}.`;
    const r = await pedirJson([...blocos, { type: "text", text: prompt }], 4000);
    return NextResponse.json({ dados: r });
  } catch (e) {
    if (e instanceof ErroClaude) return erro(e.message, e.status);
    console.warn("ler", e); return erro("A leitura falhou. Tente de novo.", 500);
  } finally {
    await adm.storage.from("documentos").remove(arquivos.map((a) => a.caminho)).catch(() => {});
  }
}
