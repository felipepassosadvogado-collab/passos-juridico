"use client";
// Pasta para protocolo: junta, na ordem do escritório, a inicial, os documentos da ficha do cliente e o cálculo,
// e baixa tudo num .zip (cada item vira um PDF só quando são PDFs ou fotos).
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
import { useEffect, useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataHoraBR, nomeBonito } from "@/lib/formato";
import type { Documento } from "@/lib/tipos";
import { baixar, tamanhoBR } from "./ui";

export const ITENS_KIT: { n: string; nome: string; tipos: string[]; dica: string }[] = [
  { n: "01", nome: "Petição Inicial", tipos: ["inicial"], dica: "a gerada aqui; se revisar e assinar, anexe o PDF final" },
  { n: "02", nome: "RG", tipos: ["rg"], dica: "RG ou CNH" },
  { n: "03", nome: "Procuração, Hipo e Contrato", tipos: ["proc_hipo_contrato", "procuracao", "hipo", "contrato"], dica: "juntados num PDF só, nessa ordem" },
  { n: "04", nome: "Residência", tipos: ["comprovante"], dica: "comprovante de residência" },
  { n: "05", nome: "Extrato de Empréstimo", tipos: ["extrato"], dica: "HISCON" },
  { n: "06", nome: "Extrato de Pagamento", tipos: ["extrato_pagamento"], dica: "HISCRE" },
  { n: "07", nome: "Cálculo da Causa", tipos: ["calculo"], dica: "o gerado em “Gerar cálculo (PDF)”" },
];
const ORDEM_03 = ["proc_hipo_contrato", "procuracao", "hipo", "contrato"];
const ehPdf = (d: Pick<Documento, "mime" | "nome">) => d.mime === "application/pdf" || /\.pdf$/i.test(d.nome);
const semAc = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\- ,]+/g, "").trim();

/** guarda um arquivo gerado (inicial ou cálculo) na ficha do cliente */
export async function guardarNaFicha(sb: any, clienteId: string, tipo: string, nome: string, blob: Blob): Promise<Documento | null> {
  const caminho = `clientes/${clienteId}/${Date.now().toString(36)}-${nome.replace(/[^\w.\-]+/g, "_")}`;
  const up = await sb.storage.from("documentos").upload(caminho, blob, { contentType: blob.type || undefined });
  if (up.error) return null;
  const { data } = await sb.from("documentos").insert({ cliente_id: clienteId, tipo, nome, caminho, tamanho: blob.size, mime: blob.type || null }).select().single();
  return (data as Documento) || null;
}

export function PastaProtocolo({ clienteId, nomeCliente, banco, atualizar }: { clienteId: string; nomeCliente: string; banco: string; atualizar: number }) {
  const { sb, aviso } = useDados();
  const [docs, setDocs] = useState<Documento[]>([]); const [fora, setFora] = useState<Set<string>>(new Set()); const [ocupado, setOcupado] = useState(""); const alvo = useRef<{ tipo: string } | null>(null); const inp = useRef<HTMLInputElement>(null);
  const carregar = () => sb.from("documentos").select("*").eq("cliente_id", clienteId).order("em", { ascending: false }).then(({ data }: { data: unknown }) => setDocs((data as Documento[]) || []));
  useEffect(() => { carregar(); }, [clienteId, atualizar]); // eslint-disable-line react-hooks/exhaustive-deps
  // por item: a inicial e o cálculo só o mais recente; os demais, todos daquele tipo
  const doItem = (i: (typeof ITENS_KIT)[number]) => {
    const l = docs.filter((d) => i.tipos.includes(d.tipo || ""));
    if (i.n === "01" || i.n === "07") { const pdf = l.find(ehPdf); return pdf && i.n === "01" ? [pdf] : l.slice(0, 1); }
    if (i.n === "03") return [...l].sort((a, b) => ORDEM_03.indexOf(a.tipo || "") - ORDEM_03.indexOf(b.tipo || "") || a.em.localeCompare(b.em));
    return [...l].sort((a, b) => a.em.localeCompare(b.em));
  };
  const anexar = async (files: File[]) => {
    const t = alvo.current?.tipo; if (!t || !files.length) return; setOcupado("Enviando…");
    try { for (const f of files) if (!(await guardarNaFicha(sb, clienteId, t, f.name, f))) aviso("Não consegui guardar " + f.name + "."); await carregar(); aviso("Guardado na ficha do cliente."); }
    finally { setOcupado(""); }
  };
  const baixarZip = async () => {
    setOcupado("Montando a pasta…");
    try {
      const zip = new JSZip(); const faltam: string[] = [];
      for (const i of ITENS_KIT) {
        const l = doItem(i).filter((d) => !fora.has(d.id)); if (!l.length) { faltam.push(i.n + " " + i.nome); continue; }
        setOcupado("Juntando " + i.n + " - " + i.nome + "…");
        const arqs = await Promise.all(l.map(async (d) => { const { data, error } = await sb.storage.from("documentos").download(d.caminho); if (error || !data) throw new Error("Não consegui baixar " + d.nome); return { d, buf: new Uint8Array(await data.arrayBuffer()) }; }));
        const base = `${i.n} - ${semAc(i.nome)}`;
        // o tipo real vem dos primeiros bytes do arquivo (não do nome)
        const tipo = (b: Uint8Array) => b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 ? "pdf" : b[0] === 0x89 && b[1] === 0x50 ? "png" : b[0] === 0xff && b[1] === 0xd8 ? "jpg" : "";
        if (arqs.every((a) => tipo(a.buf))) {
          if (arqs.length === 1 && tipo(arqs[0].buf) === "pdf") { zip.file(base + ".pdf", arqs[0].buf); continue; }
          const out = await PDFDocument.create();
          for (const a of arqs) {
            if (tipo(a.buf) === "pdf") { const src = await PDFDocument.load(a.buf, { ignoreEncryption: true }); (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p)); }
            else {
              const im = tipo(a.buf) === "png" ? await out.embedPng(a.buf) : await out.embedJpg(a.buf);
              const W = 595.28, H = 841.89, m = 28; const k = Math.min((W - 2 * m) / im.width, (H - 2 * m) / im.height, 1.5);
              const pg = out.addPage([W, H]); pg.drawImage(im, { x: (W - im.width * k) / 2, y: (H - im.height * k) / 2, width: im.width * k, height: im.height * k });
            }
          }
          zip.file(base + ".pdf", await out.save());
        } else arqs.forEach((a, k) => zip.file(base + (arqs.length > 1 ? ` (${k + 1})` : "") + "." + (a.d.nome.split(".").pop() || "bin").toLowerCase(), a.buf));
      }
      const blob = await zip.generateAsync({ type: "blob" });
      baixar(`Protocolo - ${semAc(nomeBonito(nomeCliente))}${banco ? " x " + semAc(banco) : ""}.zip`, blob);
      aviso(faltam.length ? "Pasta baixada. Ficou faltando: " + faltam.join(", ") + "." : "Pasta para protocolo baixada.");
    } catch (e) { aviso((e as Error).message || "Não consegui montar a pasta."); }
    finally { setOcupado(""); }
  };
  const apagar = async (d: Documento) => {
    const { error } = await sb.from("documentos").delete().eq("id", d.id); if (error) { aviso(msgErro(error)); return; }
    sb.storage.from("documentos").remove([d.caminho]).catch(() => {}); setDocs(docs.filter((x) => x.id !== d.id));
  };
  return (
    <section className="panel kit">
      <div className="ph"><h3>Pasta para protocolo</h3><button className="btn primary" disabled={!!ocupado} onClick={baixarZip}>{ocupado || "Baixar pasta (.zip)"}</button></div>
      <div className="kit-lista">{ITENS_KIT.map((i) => { const l = doItem(i); return (
        <div key={i.n} className={"kit-item" + (l.filter((d) => !fora.has(d.id)).length ? " ok" : "")}>
          <span className="kit-n">{i.n}</span>
          <div className="kit-main"><div className="kit-t">{i.nome} <span className="muted s">· {i.dica}</span></div>
            {l.length ? l.map((d) => <label key={d.id} className="kit-doc"><input type="checkbox" checked={!fora.has(d.id)} onChange={() => { const n = new Set(fora); if (n.has(d.id)) n.delete(d.id); else n.add(d.id); setFora(n); }} />
              <span className="an">{d.nome}</span><span className="muted s">{dataHoraBR(d.em).slice(0, 10)}{d.tamanho ? " · " + tamanhoBR(d.tamanho) : ""}</span>
              {(i.n === "01" || i.n === "07") && <button className="reflink" style={{ fontSize: 12 }} onClick={(e) => { e.preventDefault(); apagar(d); }}>tirar</button>}</label>)
              : <div className="muted s">{i.n === "01" ? "Gere a inicial acima (o Word fica guardado aqui)." : i.n === "07" ? "Gere o cálculo acima (o PDF fica guardado aqui)." : "Nada na ficha do cliente."}</div>}
          </div>
          <button className="btn ghost" disabled={!!ocupado} onClick={() => { alvo.current = { tipo: i.n === "03" ? "proc_hipo_contrato" : i.tipos[0] }; inp.current?.click(); }}>Anexar</button>
        </div>); })}</div>
      <input ref={inp} type="file" hidden multiple accept="application/pdf,image/jpeg,image/png,.docx" onChange={(e) => { anexar(Array.from(e.target.files || [])); e.target.value = ""; }} />
      <div className="muted" style={{ fontSize: 12.5, padding: "0 16px 14px" }}>O que você anexa aqui fica guardado na ficha do cliente. Fotos e PDFs de um mesmo item viram um PDF só. A inicial vai em Word, a menos que você anexe o PDF final no item 01.</div>
    </section>
  );
}
