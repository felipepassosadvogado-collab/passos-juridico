"use client";
import { useActionState, useState } from "react";
import { cadastrarProcesso, salvarProcesso, comentar } from "@/app/(app)/processos/acoes";
import { cnjValido, infoCnj, mascaraCnj, cidadeDoJuizo, soDigitos } from "@/lib/cnj";
import { FASES } from "@/lib/tipos";

type Opcao = { id: string; nome: string };

export function FormNovoProcesso({ clientes, equipe, clientePadrao, eu }: { clientes: Opcao[]; equipe: Opcao[]; clientePadrao?: string; eu: string }) {
  const [st, acao, salvando] = useActionState(cadastrarProcesso, null);
  const [num, setNum] = useState(""); const [orgao, setOrgao] = useState(""); const [cidade, setCidade] = useState(""); const [cidMan, setCidMan] = useState(false);
  const d = soDigitos(num); const info = infoCnj(d); const valido = d.length === 20 && cnjValido(d);
  return (
    <form action={acao} className="panel"><div className="pb" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <label className="f">Número CNJ<input name="numero" className="mono" inputMode="numeric" placeholder="0000000-00.0000.0.00.0000" value={num} onChange={(e) => setNum(mascaraCnj(e.target.value))} required /></label>
      {d.length === 20 && <div className={"banner" + (valido ? " ok" : " erro")}>{valido && info ? `${info.ramo} · ${info.tribunal} · ajuizado em ${info.ano}` : "Os dígitos verificadores não conferem. Confira o número."}</div>}
      <div className="form2">
        <label className="f full">Vara / juízo<input name="orgao" value={orgao} placeholder="Ex.: 6ª Vara Federal de Joinville" onChange={(e) => { setOrgao(e.target.value); if (!cidMan) setCidade(cidadeDoJuizo(e.target.value)); }} /></label>
        <label className="f">Cidade<input name="cidade" value={cidade} onChange={(e) => { setCidade(e.target.value); setCidMan(true); }} /></label>
        <label className="f">Tribunal<input name="tribunal" defaultValue="" placeholder={info?.tribunal || ""} key={info?.tribunal} /></label>
        <label className="f full">Cliente<select name="cliente_id" defaultValue={clientePadrao || ""}><option value="">— escolher cliente —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
        <label className="f full">Réus (separe por ;)<input name="reus" placeholder="Banco C6 Consignado S.A.; Instituto Nacional do Seguro Social - INSS" /></label>
        <label className="f">Classe<input name="classe" placeholder="Procedimento do Juizado Especial Cível" /></label>
        <label className="f">Fase<select name="fase" defaultValue="Protocolo / citação">{FASES.map((f) => <option key={f}>{f}</option>)}</select></label>
        <label className="f">Responsável<select name="responsavel" defaultValue={eu}><option value="">Sem responsável</option>{equipe.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
      </div>
      {st?.erro && <div className="banner erro">{st.erro}</div>}
      <div className="tools"><button className="btn primary" disabled={!valido || salvando}>{salvando ? "Cadastrando…" : "Cadastrar processo"}</button></div>
    </div></form>
  );
}

export function FormDadosProcesso({ numero, fase, responsavel, clienteId, notas, clientes, equipe }:
  { numero: string; fase: string | null; responsavel: string | null; clienteId: string | null; notas: string | null; clientes: Opcao[]; equipe: Opcao[] }) {
  const [st, acao, salvando] = useActionState(salvarProcesso, null);
  return (
    <form action={acao} className="form2">
      <input type="hidden" name="numero" value={numero} />
      <label className="f">Fase<select name="fase" defaultValue={fase || ""}><option value="">— sem fase —</option>{FASES.map((f) => <option key={f}>{f}</option>)}</select></label>
      <label className="f">Responsável pelo processo<select name="responsavel" defaultValue={responsavel || ""}><option value="">Sem responsável</option>{equipe.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}</select></label>
      <label className="f full">Cliente vinculado<select name="cliente_id" defaultValue={clienteId || ""}><option value="">— sem ficha de cliente —</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</select></label>
      <label className="f full">Anotações fixas<textarea name="notas" rows={2} defaultValue={notas || ""} /></label>
      <div className="tools full"><button className="btn primary" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>
        {st?.erro && <span className="pill late">{st.erro}</span>}{st && "ok" in st && st.ok && <span className="pill ok">{st.ok}</span>}</div>
    </form>
  );
}

export function FormComentario({ numero }: { numero: string }) {
  const [st, acao, enviando] = useActionState(async (a: unknown, f: FormData) => { const r = await comentar(a, f); if (!r.erro) (document.getElementById("tl-texto") as HTMLTextAreaElement).value = ""; return r; }, null);
  return (
    <form action={acao} style={{ display: "flex", gap: 8, alignItems: "flex-end", padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
      <input type="hidden" name="numero" value={numero} />
      <textarea id="tl-texto" name="texto" rows={2} style={{ flex: 1 }} placeholder="Escreva uma anotação para a equipe…" />
      <button className="btn primary" disabled={enviando}>{enviando ? "Enviando…" : "Enviar"}</button>
      {st?.erro && <span className="pill late">{st.erro}</span>}
    </form>
  );
}
