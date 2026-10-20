"use client";
// Botão "Emitir kit procuração": procuração, contrato de honorários (com o percentual), declaração de
// hipossuficiência e declaração de residência, já com os dados da ficha (lidos pelo Claude ou digitados).
import { useEffect, useState } from "react";
import { useDados } from "@/lib/dados";
import { moeda, nomeBonito } from "@/lib/formato";
import { enviarParaLeitura } from "@/lib/leitura";
import { BANCOS, chaveBanco } from "@/lib/regras";
import { pctPadrao } from "@/lib/valores";
import { faltasKit, montarKit } from "@/lib/kitProcuracao";
import type { useFichaCliente } from "./cliente";
import { baixar } from "./ui";

type Contrato = { numero: string; averbacao: string; parcela: string };
const dataBRde = (iso?: string | null) => (iso && /^\d{4}-\d\d-\d\d/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export function KitProcuracao({ f, bancoSugerido = "" }: { f: ReturnType<typeof useFichaCliente>; bancoSugerido?: string }) {
  const { config, sb, eu, aviso } = useDados();
  const [aberto, setAberto] = useState(false);
  const fem0 = /a$/i.test((f.ed.estado_civil || "").trim()) || /a$/i.test((f.ed.profissao || "").trim());
  const [k, setK] = useState({ banco: f.kit?.banco || nomeBonito(f.extra.parteContraria || bancoSugerido || ""), pct: String(f.kit?.pct ?? pctPadrao(config)).replace(".", ","), feminino: fem0, email: "" });
  const [cs, setCs] = useState<Contrato[]>(f.kit?.contratos?.length ? f.kit.contratos : [{ numero: "", averbacao: "", parcela: "" }]); const [lendo, setLendo] = useState(false); const [gerando, setGerando] = useState(false);
  const extratos = f.files.filter((x) => x.tipo === "extrato");
  // o que o Claude leu nos documentos entra sozinho (sem apagar o que já foi digitado)
  useEffect(() => {
    const l = f.extra.contratos; if (l?.length) setCs((atual) => (atual.some((c) => c.numero.trim() || c.parcela.trim()) ? atual : l));
    if (f.extra.parteContraria) setK((x) => (x.banco ? x : { ...x, banco: nomeBonito(f.extra.parteContraria!) }));
  }, [f.extra]);
  const abrir = () => { setK((x) => ({ ...x, banco: x.banco || nomeBonito(f.extra.parteContraria || bancoSugerido || ""), feminino: fem0 })); setAberto(!aberto); };
  const lerExtrato = async (files: File[]) => {
    if (!files.length) return; setLendo(true);
    try {
      const arquivos = await enviarParaLeitura(sb, eu.id, files);
      const r = await fetch("/api/claude/ler", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo: "extrato", arquivos, banco: k.banco }) });
      const j = await r.json(); if (!r.ok) { aviso(j.erro || "A leitura do extrato falhou."); return; }
      const todos = (j.dados?.contratos || []) as { numero?: string; banco?: string; parcela?: number; inclusao?: string }[];
      const doBanco = todos.filter((c) => !k.banco || !c.banco || chaveBanco(c.banco) === chaveBanco(k.banco)); const l = doBanco.length ? doBanco : todos;
      if (!l.length) { aviso("Não encontrei contratos no extrato."); return; }
      setCs(l.map((c) => ({ numero: String(c.numero || ""), averbacao: dataBRde(c.inclusao), parcela: c.parcela != null ? moeda(+c.parcela) : "" })));
      if (!k.banco && l[0]?.banco) setK((x) => ({ ...x, banco: nomeBonito(String(l[0].banco)) }));
      aviso(l.length + (l.length === 1 ? " contrato lido do extrato." : " contratos lidos do extrato.") + " Confira antes de emitir.");
    } catch (e) { aviso((e as Error).message || "A leitura do extrato falhou."); }
    finally { setLendo(false); }
  };
  const emitir = async () => {
    const pct = parseFloat(k.pct.replace(",", ".")); if (!(pct > 0 && pct <= 100)) { aviso("Informe o percentual dos honorários."); return; }
    const d = { nome: f.ed.nome, nacionalidade: f.ed.nacionalidade, estadoCivil: f.ed.estado_civil, profissao: f.ed.profissao, cpf: f.ed.cpf, endereco: f.ed.endereco, cep: f.ed.cep, cidade: f.ed.cidade, telefone: f.ed.telefone, email: k.email || f.ed.email, feminino: k.feminino, banco: k.banco, pct, contratos: cs };
    setGerando(true);
    try {
      const { MODELO_KIT_DOCX } = await import("@/modelos/modeloKit");
      const blob = await montarKit(MODELO_KIT_DOCX, d);
      f.guardarKit({ banco: k.banco.trim(), pct, contratos: cs.filter((c) => c.numero.trim() || c.parcela.trim()) });
      baixar(`Kit_Procuracao_-_${nomeBonito(f.ed.nome || "cliente").replace(/\s+/g, "_")}.docx`, blob);
      const faltam = faltasKit(d);
      aviso(faltam.length ? "Kit emitido. Ficou entre [colchetes]: " + faltam.join(", ") + "." : "Kit procuração emitido. Imprima, colha as assinaturas e anexe na ficha.");
    } catch { aviso("Não consegui emitir o kit. Tente de novo."); }
    finally { setGerando(false); }
  };
  const faltam = faltasKit({ nome: f.ed.nome, cpf: f.ed.cpf, endereco: f.ed.endereco, cep: f.ed.cep, cidade: f.ed.cidade, banco: k.banco } as never);
  return (
    <div className="kitp">
      <button type="button" className={aberto ? "btn ghost" : "btn"} onClick={abrir}>{aberto ? "Fechar kit procuração" : "📝 Emitir kit procuração"}</button>
      {aberto && <div className="novo-cli">
        <div className="av-top"><strong>Kit procuração</strong><span className="muted" style={{ fontSize: 12.5 }}>procuração, contrato, hipossuficiência e declaração de residência</span></div>
        <datalist id="kit-bancos">{BANCOS.map((b) => <option key={b} value={b} />)}</datalist>
        <div className="form2">
          <label className="f">Banco réu<input list="kit-bancos" value={k.banco} placeholder="Ex.: Banco C6 Consignado S.A." onChange={(e) => setK({ ...k, banco: e.target.value })} /></label>
          <label className="f">Honorários contratuais (%)<input inputMode="decimal" value={k.pct} onChange={(e) => setK({ ...k, pct: e.target.value })} /></label>
          <label className="f">Concordância<select value={k.feminino ? "F" : "M"} onChange={(e) => setK({ ...k, feminino: e.target.value === "F" })}><option value="F">Feminino (inscrita, domiciliada…)</option><option value="M">Masculino (inscrito, domiciliado…)</option></select></label>
          <label className="f">E-mail do cliente (opcional)<input value={k.email} placeholder={f.ed.email || "fica em branco para preencher à mão"} onChange={(e) => setK({ ...k, email: e.target.value })} /></label>
        </div>
        <div className="f"><span>Contratos impugnados (vão na procuração)</span>
          {cs.map((c, i) => <div key={i} className="kitp-ct">
            <input value={c.numero} placeholder="Nº do contrato" onChange={(e) => setCs(cs.map((x, j) => (j === i ? { ...x, numero: e.target.value } : x)))} />
            <input value={c.averbacao} placeholder="Averbado em (dd/mm/aaaa)" onChange={(e) => setCs(cs.map((x, j) => (j === i ? { ...x, averbacao: e.target.value } : x)))} />
            <input value={c.parcela} inputMode="decimal" placeholder="Parcela (R$)" onChange={(e) => setCs(cs.map((x, j) => (j === i ? { ...x, parcela: e.target.value } : x)))} />
            {cs.length > 1 && <button type="button" className="icb" aria-label="Tirar contrato" onClick={() => setCs(cs.filter((_, j) => j !== i))}>✕</button>}
          </div>)}
          <div className="tools"><button type="button" className="reflink" onClick={() => setCs([...cs, { numero: "", averbacao: "", parcela: "" }])}>+ Contrato</button>
            {extratos.length > 0 ? <button type="button" className="btn ghost" disabled={lendo} onClick={() => lerExtrato(extratos.map((x) => x.file))}>{lendo ? "Lendo o extrato…" : "Ler contratos do extrato anexado"}</button>
              : <label className="btn ghost" style={{ cursor: "pointer" }}>{lendo ? "Lendo o extrato…" : "Ler contratos de um extrato (HISCON)"}<input type="file" hidden accept="application/pdf,image/*" multiple onChange={(e) => { lerExtrato(Array.from(e.target.files || [])); e.target.value = ""; }} /></label>}</div>
        </div>
        {faltam.length > 0 && <div className="banner">Ainda falta: {faltam.join(", ")}. Pode emitir assim mesmo; o que faltar sai entre [colchetes].</div>}
        <div className="tools"><button type="button" className="btn primary" disabled={gerando} onClick={emitir}>{gerando ? "Emitindo…" : "Emitir kit (Word)"}</button></div>
      </div>}
    </div>
  );
}
