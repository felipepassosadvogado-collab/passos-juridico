"use client";
// Envio de fotos e PDFs para o Claude ler (documentos do cliente, extrato do INSS).
// As fotos são reduzidas no próprio navegador; os arquivos vão para uma pasta temporária
// do Storage e o servidor os lê de lá (assim não há limite de tamanho no envio).
import type { supabaseNavegador } from "./supabase/client";

type SB = ReturnType<typeof supabaseNavegador>;

export async function reduzir(f: File, lado = 1800): Promise<Blob> {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type)) return f;
  try {
    const bmp = await createImageBitmap(f);
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const cv = document.createElement("canvas"); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext("2d")!.drawImage(bmp, 0, 0, cv.width, cv.height);
    return await new Promise<Blob>((ok) => cv.toBlob((b) => ok(b || f), "image/jpeg", 0.86));
  } catch { return f; }
}

/** sobe os arquivos para leitura e devolve os caminhos no Storage */
export async function enviarParaLeitura(sb: SB, usuario: string, files: File[]): Promise<{ caminho: string; nome: string; mime: string }[]> {
  const out = [];
  for (const f of files.slice(0, 8)) {
    const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
    const blob = ehPdf ? f : await reduzir(f);
    const mime = ehPdf ? "application/pdf" : blob.type || "image/jpeg";
    const caminho = `leitura/${usuario}/${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}.${ehPdf ? "pdf" : "jpg"}`;
    const up = await sb.storage.from("documentos").upload(caminho, blob, { contentType: mime });
    if (up.error) throw new Error("Não consegui enviar " + f.name + " para leitura.");
    out.push({ caminho, nome: f.name, mime });
  }
  return out;
}
