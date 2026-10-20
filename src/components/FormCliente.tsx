"use client";
import { useActionState, useState } from "react";
import { salvarCliente } from "@/app/(app)/clientes/acoes";
import { cpfValido, mascaraCpf } from "@/lib/formato";
import type { Cliente } from "@/lib/tipos";

const CAMPOS: [keyof Cliente, string, string, boolean?][] = [
  ["nome", "Nome completo", "text", true], ["cpf", "CPF", "text"], ["rg", "RG (nº e órgão emissor)", "text"], ["nascimento", "Data de nascimento", "date"],
  ["nacionalidade", "Nacionalidade", "text"], ["estado_civil", "Estado civil", "text"], ["profissao", "Profissão", "text"], ["nome_mae", "Nome da mãe", "text"],
  ["telefone", "Telefone / WhatsApp", "tel"], ["email", "E-mail", "email"], ["endereco", "Endereço (rua, nº, complemento, bairro)", "text", true],
  ["cep", "CEP", "text"], ["cidade", "Cidade / UF", "text"], ["nb", "Nº do benefício (INSS)", "text"],
];

export function FormCliente({ cliente }: { cliente?: Cliente }) {
  const [st, acao, salvando] = useActionState(salvarCliente, null);
  const [cpf, setCpf] = useState(cliente?.cpf || "");
  const cpfRuim = cpf.replace(/\D/g, "").length === 11 && !cpfValido(cpf);
  return (
    <form action={acao} className="panel"><div className="pb" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {cliente && <input type="hidden" name="id" value={cliente.id} />}
      <div className="form2">
        {CAMPOS.map(([k, rot, tipo, cheio]) => (
          <label key={k} className={"f" + (cheio ? " full" : "")}>{rot}
            {k === "cpf"
              ? <input name="cpf" value={cpf} onChange={(e) => setCpf(mascaraCpf(e.target.value))} inputMode="numeric" />
              : <input name={k} type={tipo} defaultValue={(cliente?.[k] as string) || ""} required={k === "nome"} />}
          </label>
        ))}
        <label className="f full">Observações<textarea name="obs" rows={3} defaultValue={cliente?.obs || ""} /></label>
      </div>
      {cpfRuim && <div className="banner">Os dígitos verificadores deste CPF não conferem.</div>}
      {st?.erro && <div className="banner erro">{st.erro}</div>}
      {st && "ok" in st && st.ok && <div className="banner ok">{st.ok}</div>}
      <div className="tools"><button className="btn primary" disabled={salvando}>{salvando ? "Salvando…" : cliente ? "Salvar" : "Cadastrar cliente"}</button></div>
    </div></form>
  );
}
