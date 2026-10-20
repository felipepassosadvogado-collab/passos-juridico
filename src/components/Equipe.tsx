"use client";
import { useActionState } from "react";
import { convidar, alterarMembro } from "@/app/(app)/equipe/acoes";
import type { Perfil } from "@/lib/tipos";

export function FormConvite() {
  const [st, acao, enviando] = useActionState(convidar, null);
  return (
    <form action={acao} className="form2">
      <label className="f">Nome<input name="nome" required /></label>
      <label className="f">E-mail<input name="email" type="email" required /></label>
      <label className="f">Função<input name="funcao" placeholder="Ex.: Assistente jurídica" /></label>
      <div className="tools" style={{ alignSelf: "end" }}><button className="btn primary" disabled={enviando}>{enviando ? "Enviando…" : "Enviar convite"}</button></div>
      {st?.erro && <div className="banner erro full">{st.erro}</div>}
      {st && "ok" in st && st.ok && <div className="banner ok full">{st.ok}</div>}
    </form>
  );
}

export function LinhaMembro({ m, eu, titular }: { m: Perfil; eu: string; titular: boolean }) {
  const [st, acao, salvando] = useActionState(alterarMembro, null);
  const podeEditar = titular || m.id === eu;
  return (
    <form action={acao} className="tools" style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", alignItems: "flex-end" }}>
      <input type="hidden" name="id" value={m.id} />
      <label className="f" style={{ flex: "1 1 200px" }}>Nome<input name="nome" defaultValue={m.nome} disabled={!podeEditar} /></label>
      <label className="f" style={{ flex: "1 1 160px" }}>Função<input name="funcao" defaultValue={m.funcao} disabled={!podeEditar} /></label>
      {titular && m.id !== eu ? <>
        <label className="f">Papel<select name="papel" defaultValue={m.papel}><option value="titular">Titular</option><option value="advogado">Advogado(a)</option><option value="colaborador">Colaborador(a)</option></select></label>
        <label className="f" style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 9 }}><input type="checkbox" name="ativo" defaultChecked={m.ativo} /> Acesso ativo</label>
      </> : <span className="pill acc" style={{ marginBottom: 9 }}>{m.papel === "titular" ? "Titular" : m.papel === "advogado" ? "Advogado(a)" : "Colaborador(a)"}{m.id === eu ? " · você" : ""}</span>}
      {podeEditar && <button className="btn" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>}
      {st?.erro && <span className="pill late">{st.erro}</span>}{st && "ok" in st && st.ok && <span className="pill ok">{st.ok}</span>}
    </form>
  );
}
