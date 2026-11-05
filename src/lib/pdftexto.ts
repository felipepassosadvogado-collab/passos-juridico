"use client";
// Extrai o texto de PDFs grandes (ex.: cópia integral do eproc) no próprio navegador.
// Assim não há limite de tamanho de envio nem de páginas: vai para o Claude só o texto.
// Páginas que são só imagem (documento escaneado, foto) ficam listadas como "sem texto".

import { encurtar } from "./encurtar";

export type TextoPdf = { nome: string; paginas: number; semTexto: number[]; texto: string; /** texto de cada página (null = só imagem) */ porPagina?: (string | null)[] };
/** PDF acima disto vai como texto; abaixo, vai inteiro (o Claude vê também imagens e assinaturas) */
export const LIMITE_VISUAL = { bytes: 12 * 1024 * 1024, paginas: 80 };
export const MAX_CARACTERES = 450_000;

export async function contarPaginas(f: File): Promise<number> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await f.arrayBuffer()));
  const n = pdf.numPages; await pdf.cleanup().catch(() => {}); return n;
}

export async function textoDoPdf(f: File, progresso?: (pag: number, total: number) => void): Promise<TextoPdf> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(await f.arrayBuffer()));
  const paginas: string[][] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const pg = await pdf.getPage(i); const tc = await pg.getTextContent();
    let s = "";
    for (const it of tc.items as { str?: string; hasEOL?: boolean }[]) { if (typeof it.str === "string") s += it.str + (it.hasEOL ? "\n" : " "); }
    paginas.push(s.split("\n").map((l) => l.replace(/[ \t ]+/g, " ").trim()).filter(Boolean));
    pg.cleanup();
    if (progresso && (i % 10 === 0 || i === pdf.numPages)) progresso(i, pdf.numPages);
  }
  await pdf.cleanup().catch(() => {});
  // tira cabeçalhos e rodapés repetidos (assinatura eletrônica, código verificador, nº da página)
  const freq = new Map<string, number>();
  const bordas = (ls: string[]) => [...ls.slice(0, 3), ...ls.slice(-3)];
  for (const ls of paginas) for (const l of new Set(bordas(ls).map(chave))) freq.set(l, (freq.get(l) || 0) + 1);
  const corte = Math.max(5, paginas.length * 0.3);
  const semTexto: number[] = []; const partes: string[] = []; const porPagina: (string | null)[] = [];
  paginas.forEach((ls, i) => {
    // só a borda da página (3 primeiras e 3 últimas linhas) pode ser cabeçalho/rodapé repetido
    const rep = (l: string, k: number) => (k < 3 || k >= ls.length - 3) && (freq.get(chave(l)) || 0) >= corte;
    const uteis = paginas.length > 10 ? ls.filter((l, k) => !rep(l, k)) : ls;
    const t = uteis.join("\n");
    if (t.replace(/\s/g, "").length < 25) { semTexto.push(i + 1); porPagina.push(null); return; }
    porPagina.push(t); partes.push(`--- página ${i + 1} ---\n${t}`);
  });
  return { nome: f.name, paginas: paginas.length, semTexto, texto: encurtar(partes.join("\n"), MAX_CARACTERES), porPagina };
}

const chave = (l: string) => l.replace(/\d+/g, "#").toLowerCase();

/** PDF novo só com algumas páginas (as escaneadas escolhidas, que o Claude precisa ver como imagem) */
export async function paginasEmPdf(f: File, numeros: number[]): Promise<File> {
  const { PDFDocument } = await import("pdf-lib");
  const orig = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true });
  const novo = await PDFDocument.create();
  const copiadas = await novo.copyPages(orig, numeros.map((n) => n - 1).filter((i) => i >= 0 && i < orig.getPageCount()));
  copiadas.forEach((pg) => novo.addPage(pg));
  const bytes = await novo.save();
  return new File([bytes as BlobPart], f.name.replace(/\.pdf$/i, "") + `_paginas_${numeros.join("-").slice(0, 40)}.pdf`, { type: "application/pdf" });
}
