"use client";
// Ficha do cliente com documentos (RG, comprovante, procuração) lidos pelo Claude.
import { useEffect, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { cpfValido, dataBR, mascaraCpf, nomeBonito, semAcento } from "@/lib/formato";
import { enviarParaLeitura } from "@/lib/leitura";
import { TIPOS_DOC } from "@/lib/regras";
import type { Cliente, Documento, KitSalvo } from "@/lib/tipos";
import { useVisor } from "./visor";
import { useConfirmar } from "./ui";

export const CAMPOS: [keyof Cliente, string, string][] = [
  ["nome", "Nome completo", "text"], ["cpf", "CPF", "text"], ["rg", "RG (nº e órgão emissor)", "text"], ["nascimento", "Data de nascimento", "date"],
  ["nacionalidade", "Nacionalidade", "text"], ["estado_civil", "Estado civil", "text"], ["profissao", "Profissão", "text"], ["nome_mae", "Nome da mãe", "text"],
  ["telefone", "Telefone / WhatsApp", "tel"], ["email", "E-mail", "email"], ["endereco", "Endereço (rua, nº, complemento, bairro)", "text"],
  ["cep", "CEP", "text"], ["cidade", "Cidade / UF", "text"], ["nb", "Nº do benefício (INSS)", "text"], ["obs", "Observações", "area"],
];
const DOC_PARA_CAMPO: Record<string, keyof Cliente> = { nome: "nome", cpf: "cpf", rg: "rg", nascimento: "nascimento", nacionalidade: "nacionalidade", estadoCivil: "estado_civil", profissao: "profissao", nomeMae: "nome_mae", endereco: "endereco", cep: "cep", cidade: "cidade", telefone: "telefone", email: "email" };
const ROT = Object.fromEntries(CAMPOS.map(([k, r]) => [k, r]));
type Ed = Record<string, string>;
type Arq = { file: File; tipo: string };

/** estado e ações compartilhados entre a ficha completa e o "novo cliente" dentro do novo processo */
export function useFichaCliente(c?: Cliente) {
  const { sb, eu, aplicar, aviso, clientes } = useDados();
  const [ed, setEd] = useState<Ed>(() => Object.fromEntries(CAMPOS.map(([k]) => [k, (c?.[k] as string) || ""])));
  const [files, setFiles] = useState<Arq[]>([]); const [nota, setNota] = useState(""); const [lendo, setLendo] = useState(false); const [salvando, setSalvando] = useState(false);
  const [extra, setExtra] = useState<{ parteContraria?: string; contratos?: { numero: string; averbacao: string; parcela: string }[] }>({});
  const [kit, setKit] = useState<KitSalvo | null>(c?.kit || null); const [kitNovo, setKitNovo] = useState(false);
  /** guarda o que foi usado no kit procuração (já grava se o cliente existe; senão, vai junto no cadastro) */
  const guardarKit = async (k: Omit<KitSalvo, "em">) => {
    const v = { ...k, em: new Date().toISOString() }; setKit(v);
    if (!c?.id) { setKitNovo(true); return; }
    const { data, error } = await sb.from("clientes").update({ kit: v }).eq("id", c.id).select().single();
    if (error) { if (/kit/.test(error.message)) aviso("Para guardar os contratos na ficha, falta instalar a etapa 11 (0010_kit_cliente.sql)."); return; }
    aplicar("clientes", data);
  };
  const ler = async () => {
    setLendo(true); setNota("");
    try {
      const arquivos = await enviarParaLeitura(sb, eu.id, files.map((f) => f.file));
      const r = await fetch("/api/claude/ler", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo: "documentos", arquivos }) });
      const j = await r.json(); if (!r.ok) { setNota(j.erro || "A leitura falhou."); return; }
      const d = j.dados || {}; const novo = { ...ed }; const preenchidos: string[] = [], conflitos: string[] = [];
      for (const [chave, campo] of Object.entries(DOC_PARA_CAMPO)) {
        let val = d[chave]; if (val == null || val === "") continue; val = String(val).trim();
        if (campo === "cpf") val = mascaraCpf(val); if (campo === "nome") val = nomeBonito(val); if (campo === "nascimento" && !/^\d{4}-\d\d-\d\d$/.test(val)) continue;
        const atual = (novo[campo] || "").trim();
        if (!atual) { novo[campo] = val; preenchidos.push(ROT[campo]); }
        else if (semAcento(atual).replace(/\W/g, "") !== semAcento(val).replace(/\W/g, "")) conflitos.push(`${ROT[campo]}: na ficha “${atual}”, no documento “${val}”`);
      }
      setEd(novo);
      const tipos: string[] = d.tipos || []; setFiles(files.map((f, i) => ({ ...f, tipo: f.tipo || (TIPOS_DOC[tipos[i]] ? tipos[i] : "") })));
      const cts = (Array.isArray(d.contratos) ? d.contratos : []).filter((x: { numero?: unknown }) => x && x.numero).map((x: { numero: unknown; averbacao?: unknown; parcela?: unknown }) => ({
        numero: String(x.numero).trim(), averbacao: String(x.averbacao || "").replace(/^(\d{4})-(\d\d)-(\d\d).*$/, "$3/$2/$1"),
        parcela: x.parcela != null && x.parcela !== "" ? Number(x.parcela).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "" }));
      if (d.parteContraria || cts.length) setExtra((e) => ({ ...e, ...(d.parteContraria ? { parteContraria: String(d.parteContraria).split(/\s*[(;]/)[0].trim() } : {}), ...(cts.length ? { contratos: cts } : {}) }));
      const partes = [preenchidos.length ? "Preenchido pelo Claude: " + preenchidos.join(", ") + ". Confira antes de salvar." : "Nenhum campo novo encontrado nos documentos."];
      if (conflitos.length) partes.push("Diferente do que já está na ficha (mantive o da ficha):\n• " + conflitos.join("\n• "));
      if (d.observacoes) partes.push(String(d.observacoes));
      if (novo.cpf && !cpfValido(novo.cpf)) partes.push("Atenção: o CPF lido não passa na verificação dos dígitos. Confira no documento.");
      setNota(partes.join("\n\n"));
    } catch (e) { setNota((e as Error).message || "A leitura falhou. Tente de novo."); }
    finally { setLendo(false); }
  };
  /** grava a ficha e os documentos; devolve o id do cliente */
  const salvar = async (): Promise<string | null> => {
    const dados: Record<string, string | null> = Object.fromEntries(CAMPOS.map(([k]) => [k, (ed[k] || "").trim() || null]));
    if (!dados.nome) { aviso("Informe o nome do cliente."); return null; }
    if (dados.cpf) { dados.cpf = mascaraCpf(dados.cpf); if (!cpfValido(dados.cpf)) { aviso("O CPF informado não é válido. Confira os números."); return null; } }
    setSalvando(true);
    try {
      let id = c?.id;
      if (id) {
        const { data, error } = await sb.from("clientes").update({ ...dados, atualizado_em: new Date().toISOString() }).eq("id", id).select().single();
        if (error) { aviso(msgErro(error)); return null; } aplicar("clientes", data);
      } else {
        const mesmoCpf = dados.cpf ? [...clientes.values()].find((x) => x.cpf && x.cpf.replace(/\D/g, "") === dados.cpf!.replace(/\D/g, "")) : undefined;
        if (mesmoCpf) { aviso("Já existe a ficha de " + nomeBonito(mesmoCpf.nome) + " com esse CPF."); return null; }
        let r = await sb.from("clientes").insert(kitNovo && kit ? { ...dados, kit } : dados).select().single();
        if (r.error && /kit/.test(r.error.message)) r = await sb.from("clientes").insert(dados).select().single();
        const { data, error } = r;
        if (error) { aviso(msgErro(error)); return null; } aplicar("clientes", data); id = data.id as string;
      }
      let n = 0;
      for (const f of files) {
        const caminho = `clientes/${id}/${Date.now().toString(36)}-${f.file.name.replace(/[^\w.\-]+/g, "_")}`;
        const up = await sb.storage.from("documentos").upload(caminho, f.file, { contentType: f.file.type || undefined });
        if (up.error) { aviso("Não foi possível guardar " + f.file.name + "."); continue; }
        await sb.from("documentos").insert({ cliente_id: id, tipo: f.tipo || "outro", nome: f.file.name, caminho, tamanho: f.file.size, mime: f.file.type || null }); n++;
      }
      setFiles([]);
      aviso((c?.id ? "Ficha salva" : "Cliente cadastrado") + (n ? ", " + n + (n === 1 ? " documento guardado." : " documentos guardados.") : "."));
      return id!;
    } finally { setSalvando(false); }
  };
  return { ed, setEd, files, setFiles, nota, lendo, salvando, ler, salvar, extra, kit, guardarKit };
}

export function CamposCliente({ f, so }: { f: ReturnType<typeof useFichaCliente>; so?: (keyof Cliente)[] }) {
  const cpfRuim = f.ed.cpf && f.ed.cpf.replace(/\D/g, "").length === 11 && !cpfValido(f.ed.cpf);
  return <>
    <div className="form2">{CAMPOS.filter(([k]) => !so || so.includes(k)).map(([k, rot, tipo]) => (
      <label key={k} className={"f" + (tipo === "area" || k === "nome" || k === "endereco" ? " full" : "")}>{rot}
        {tipo === "area" ? <textarea rows={3} value={f.ed[k]} onChange={(e) => f.setEd({ ...f.ed, [k]: e.target.value })} />
          : <input type={tipo} value={f.ed[k]} inputMode={k === "cpf" ? "numeric" : undefined} onChange={(e) => f.setEd({ ...f.ed, [k]: k === "cpf" ? mascaraCpf(e.target.value) : e.target.value })} />}</label>))}</div>
    {cpfRuim && <div className="banner">Os dígitos verificadores deste CPF não conferem. Confira no documento.</div>}
  </>;
}

export function EnvioDocumentos({ f, texto }: { f: ReturnType<typeof useFichaCliente>; texto: string }) {
  const visor = useVisor();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <label className="f">{texto}<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { f.setFiles([...f.files, ...Array.from(e.target.files || []).map((file) => ({ file, tipo: "" }))]); e.target.value = ""; }} /></label>
      {f.files.length > 0 && <div className="anexos">{f.files.map((x, i) => (
        <span key={i} className="anexo"><span className="ext">{x.file.type === "application/pdf" ? "PDF" : "IMG"}</span><span className="an">{x.file.name}</span>
          <select value={x.tipo} onChange={(e) => f.setFiles(f.files.map((y, j) => (j === i ? { ...y, tipo: e.target.value } : y)))} style={{ padding: "2px 4px", fontSize: 12 }}>
            <option value="">tipo…</option>{Object.entries(TIPOS_DOC).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
          <button type="button" className="btn ghost" title="Ver o documento numa caixa ao lado" onClick={() => visor.verArquivo(x.file)}>👁 Ver</button>
          <button className="btn ghost" onClick={() => f.setFiles(f.files.filter((_, j) => j !== i))}>Excluir</button></span>))}</div>}
      {f.files.length > 0 && <div><button className="btn primary" disabled={f.lendo} onClick={f.ler}>{f.lendo ? "Lendo os documentos…" : "Ler documentos com Claude"}</button> <span className="muted" style={{ fontSize: 12.5 }}>Os arquivos são guardados na ficha ao salvar.</span></div>}
      {f.nota && <div className="ai" style={{ whiteSpace: "pre-wrap" }}>{f.nota}</div>}
    </div>
  );
}

/** documentos já guardados na ficha */
export function DocumentosSalvos({ clienteId, atualizar }: { clienteId: string; atualizar: number }) {
  const { sb, aviso, titular } = useDados(); const [docs, setDocs] = useState<Documento[] | null>(null); const confirmar = useConfirmar(); const visor = useVisor();
  useEffect(() => { sb.from("documentos").select("*").eq("cliente_id", clienteId).order("em").then(({ data }: { data: unknown }) => setDocs(((data as Documento[]) || []))); }, [clienteId, atualizar, sb]);
  if (!docs?.length) return null;
  return <div className="rows">{docs.map((d) => (
    <div key={d.id} className="row"><span className="pill">{TIPOS_DOC[d.tipo || ""] || "Documento"}</span>
      <div className="main"><div className="t">{d.nome}</div><div className="s mono">{dataBR(d.em.slice(0, 10))}</div></div>
      <span className="tools"><button className="btn ghost" onClick={() => visor.verGuardado(d.caminho, d.nome, d.mime)}>👁 Ver</button>
        {titular && <button className="btn ghost" onClick={async () => { if (!confirmar(d.id, aviso, "Clique de novo em “Apagar” para confirmar.")) return;
          await sb.storage.from("documentos").remove([d.caminho]); const { error } = await sb.from("documentos").delete().eq("id", d.id); if (error) aviso(msgErro(error)); else setDocs(docs.filter((x) => x.id !== d.id)); }}>Apagar</button>}</span></div>))}</div>;
}
