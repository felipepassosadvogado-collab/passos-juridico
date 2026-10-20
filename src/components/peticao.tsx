"use client";
// Petição inicial em Word a partir do modelo do escritório, com leitura do extrato do INSS pelo Claude.
import { useState } from "react";
import { useDados } from "@/lib/dados";
import { idade, moeda, nomeBonito, numeroBR, porExtenso } from "@/lib/formato";
import { enviarParaLeitura } from "@/lib/leitura";
import { ESPECIES, QUALIF_PADRAO, chaveBanco } from "@/lib/regras";
import { Janela, baixar } from "./ui";

export type CtxInicial = { clienteId: string | null; banco?: string | null; cidade?: string | null; numero?: string | null; casoId?: string | null };
type Contrato = { numero: string; parcela: string; inclusao: string };

export function JanelaInicial({ ctx, onFechar }: { ctx: CtxInicial; onFechar: () => void }) {
  const { clientes, config, sb, eu, aviso } = useDados();
  const cli = ctx.clienteId ? clientes.get(ctx.clienteId) : undefined;
  const banco = nomeBonito(ctx.banco || ""); const k = chaveBanco(banco);
  const fem = /a$/i.test((cli?.estado_civil || "").trim()) || /a$/i.test((cli?.profissao || "").trim());
  const [pi, setPi] = useState({
    genero: fem ? "F" : "M", especie: "", nb: cli?.nb || "", pagador: "", banco,
    bancoQualif: (config.geral?.bancosQualif || {})[k] || QUALIF_PADRAO[k] || ", pessoa jurídica de direito privado, inscrita no CNPJ sob o nº [CNPJ], com sede na [ENDEREÇO], na cidade de [CIDADE/UF], CEP [CEP]; e",
    total: "", moral: "10.000,00", cidadeJuizo: (ctx.cidade || cli?.cidade || "Joinville/SC").toUpperCase(),
  });
  const [contratos, setContratos] = useState<Contrato[]>([{ numero: "", parcela: "", inclusao: "" }]);
  const [files, setFiles] = useState<File[]>([]); const [nota, setNota] = useState(""); const [lendo, setLendo] = useState(false); const [gerando, setGerando] = useState(false);
  const [confirmQ, setConfirmQ] = useState(false);
  if (!cli) return <Janela onFechar={onFechar} titulo="Petição inicial"><div className="banner">Escolha ou cadastre o cliente primeiro (o processo ou o atendimento precisa estar ligado a uma ficha de cliente).</div></Janela>;
  const set = (c: Partial<typeof pi>) => setPi({ ...pi, ...c });
  const faltam = [["nome", "nome"], ["cpf", "CPF"], ["endereco", "endereço"], ["cep", "CEP"], ["cidade", "cidade"]].filter(([c]) => !cli[c as keyof typeof cli]).map(([, r]) => r);
  const anos = idade(cli.nascimento);
  const tot = numeroBR(pi.total), dobro = tot * 2, moral = numeroBR(pi.moral), causa = dobro + moral;

  const lerExtrato = async () => {
    setLendo(true); setNota("");
    try {
      const arquivos = await enviarParaLeitura(sb, eu.id, files);
      const r = await fetch("/api/claude/ler", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tipo: "extrato", arquivos, banco: pi.banco }) });
      const j = await r.json(); if (!r.ok) { setNota(j.erro || "A leitura falhou."); return; }
      const d = j.dados || {}; const notas: string[] = []; const novo: Partial<typeof pi> = {};
      if (d.especie && !pi.especie) { novo.especie = String(d.especie).toLowerCase(); notas.push("espécie"); }
      if (d.nb && !pi.nb) { novo.nb = String(d.nb); notas.push("nº do benefício"); }
      if (d.bancoPagador && !pi.pagador) { novo.pagador = nomeBonito(String(d.bancoPagador)); notas.push("banco pagador"); }
      const todos = (d.contratos || []) as { numero?: string; banco?: string; parcela?: number; inclusao?: string; parcelasDescontadas?: number }[];
      const doBanco = todos.filter((c) => !pi.banco || !c.banco || chaveBanco(c.banco) === chaveBanco(pi.banco));
      const lista = doBanco.length ? doBanco : todos;
      if (lista.length) { setContratos(lista.map((c) => ({ numero: String(c.numero || ""), parcela: c.parcela != null ? moeda(+c.parcela) : "", inclusao: /^\d{4}-\d\d-\d\d$/.test(c.inclusao || "") ? c.inclusao! : "" }))); notas.push(lista.length + (lista.length === 1 ? " contrato" : " contratos")); }
      const est = lista.reduce((s, c) => s + (+(c.parcelasDescontadas || 0)) * (+(c.parcela || 0)), 0);
      if (est > 0 && !pi.total) { novo.total = moeda(est); notas.push("total estimado pelas parcelas descontadas"); }
      set(novo);
      setNota((notas.length ? "Preenchido pelo Claude: " + notas.join(", ") + "." : "Não encontrei dados no extrato.") + (todos.length > lista.length ? " Há outros contratos no extrato, de outros bancos, que ficaram de fora." : "") + " Confira tudo antes de gerar.");
    } catch (e) { setNota((e as Error).message || "A leitura falhou. Tente de novo."); }
    finally { setLendo(false); }
  };
  const gerar = async () => {
    if (/\[[A-ZÇÃ\/ ]+\]/.test(pi.bancoQualif) && !confirmQ) { setConfirmQ(true); aviso("A qualificação do banco ainda tem campos entre colchetes. Clique de novo para gerar assim mesmo."); return; }
    setGerando(true);
    try {
      const r = await fetch("/api/peticao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...pi, contratos, clienteId: cli.id, numero: ctx.numero || null, casoId: ctx.casoId || null }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); aviso(j.erro || "Não foi possível gerar o arquivo."); return; }
      const nome = decodeURIComponent(r.headers.get("x-nome-arquivo") || "Peticao_Inicial.docx");
      baixar(nome, await r.blob()); aviso("Petição gerada. Revise no Word antes de protocolar.");
    } catch { aviso("Não foi possível gerar o arquivo. Tente de novo."); }
    finally { setGerando(false); }
  };
  const campo = (c: keyof typeof pi, rot: string, ph?: string, list?: string) => <label className="f">{rot}<input value={pi[c]} placeholder={ph} list={list} onChange={(e) => set({ [c]: e.target.value })} /></label>;
  return (
    <Janela largo onFechar={onFechar} titulo="Petição inicial" sub={nomeBonito(cli.nome) + " x " + (pi.banco || "banco") + " e INSS · modelo do escritório"}
      acoes={<button className="btn primary" disabled={gerando} onClick={gerar}>{gerando ? "Gerando…" : "Gerar Word (.docx)"}</button>}>
      {faltam.length > 0 && <div className="banner">Falta na ficha do cliente: {faltam.join(", ")}. Complete a ficha antes de gerar.</div>}
      <div className="muted" style={{ fontSize: 13 }}>Qualificação: {[nomeBonito(cli.nome), cli.nacionalidade || (pi.genero === "F" ? "brasileira" : "brasileiro"), cli.estado_civil, cli.profissao, "CPF " + (cli.cpf || "—"), cli.endereco, cli.cep, cli.cidade].filter(Boolean).join(", ")}{anos != null ? ` · ${anos} anos${anos >= 60 ? " (pede prioridade de idoso)" : ""}` : ""}</div>
      <section className="novo-cli">
        <div className="av-top"><strong>Extrato de empréstimos do INSS (HISCON)</strong><span className="muted" style={{ fontSize: 12.5 }}>o Claude lê benefício, banco pagador e contratos</span></div>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
        {files.length > 0 && <div className="anexos">{files.map((f, i) => <span key={i} className="anexo"><span className="an">{f.name}</span><button className="btn ghost" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Tirar</button></span>)}</div>}
        {files.length > 0 && <div><button className="btn primary" disabled={lendo} onClick={lerExtrato}>{lendo ? "Lendo o extrato…" : "Ler extrato com Claude"}</button></div>}
        {nota && <div className="ai" style={{ whiteSpace: "pre-wrap" }}>{nota}</div>}
      </section>
      <datalist id="pi-esp">{ESPECIES.map((e) => <option key={e} value={e} />)}</datalist>
      <div className="form2">
        <label className="f">Gênero (concordância)<select value={pi.genero} onChange={(e) => set({ genero: e.target.value })}><option value="F">Feminino</option><option value="M">Masculino</option></select></label>
        {campo("cidadeJuizo", "Juízo (cidade/UF)", "JOINVILLE/SC")}
        {campo("especie", "Espécie do benefício", "aposentadoria por tempo de contribuição", "pi-esp")}
        {campo("nb", "Nº do benefício", "000.000.000-0")}
        {campo("pagador", "Banco que paga o benefício", "Ex.: Banrisul")}
        <label className="f">Banco réu<input value={pi.banco} placeholder="Banco C6 Consignado S.A." onChange={(e) => { const b = e.target.value; const kk = chaveBanco(b); set({ banco: b, bancoQualif: (config.geral?.bancosQualif || {})[kk] || QUALIF_PADRAO[kk] || pi.bancoQualif }); }} /></label>
        <label className="f full">Qualificação do banco réu (CNPJ e sede)<textarea rows={2} value={pi.bancoQualif} onChange={(e) => set({ bancoQualif: e.target.value })} /></label>
      </div>
      <section className="panel"><div className="ph"><h3>Contratos impugnados</h3><button className="btn ghost" onClick={() => setContratos([...contratos, { numero: "", parcela: "", inclusao: "" }])}>+ Contrato</button></div>
        <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>{contratos.map((c, i) => (
          <div key={i} className="triage">
            <label className="f">Nº do contrato<input value={c.numero} onChange={(e) => setContratos(contratos.map((x, j) => (j === i ? { ...x, numero: e.target.value } : x)))} /></label>
            <label className="f">Parcela (R$)<input inputMode="decimal" value={c.parcela} onChange={(e) => setContratos(contratos.map((x, j) => (j === i ? { ...x, parcela: e.target.value } : x)))} /></label>
            <label className="f">Incluído em<input type="date" value={c.inclusao} onChange={(e) => setContratos(contratos.map((x, j) => (j === i ? { ...x, inclusao: e.target.value } : x)))} /></label>
            {contratos.length > 1 && <div className="tools"><button className="btn ghost" onClick={() => setContratos(contratos.filter((_, j) => j !== i))}>Tirar</button></div>}
          </div>))}</div></section>
      <div className="form2">{campo("total", "Total já descontado (R$)", "5.446,28")}{campo("moral", "Danos morais (R$)")}</div>
      <div className="valores"><span>Restituição em dobro: <strong>R$ {moeda(dobro)}</strong></span><span>Valor da causa: <strong>R$ {moeda(causa)}</strong></span><span className="muted">({porExtenso(causa)})</span></div>
    </Janela>
  );
}
