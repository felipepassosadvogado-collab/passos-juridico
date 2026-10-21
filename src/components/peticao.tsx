"use client";
// Petição inicial em Word a partir do modelo do escritório, com leitura do extrato do INSS pelo Claude.
import { useEffect, useState } from "react";
import { useDados } from "@/lib/dados";
import { idade, moeda, nomeBonito, numeroBR, porExtenso } from "@/lib/formato";
import { enviarParaLeitura } from "@/lib/leitura";
import { ESPECIES, QUALIF_PADRAO, chaveBanco } from "@/lib/regras";
import { Janela, baixar } from "./ui";
import { PastaProtocolo, guardarNaFicha } from "./kit";
import { REGIMES, calcular, mesBR, somaMes, type Indices, type Regime, type Resultado } from "@/lib/calculo";

export type CtxInicial = { clienteId: string | null; banco?: string | null; cidade?: string | null; numero?: string | null; casoId?: string | null };
type Contrato = { numero: string; parcela: string; inclusao: string; inicio?: string; qtd?: string };
const mesAtual = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }).slice(0, 7);

export function JanelaInicial({ ctx, onFechar }: { ctx: CtxInicial; onFechar: () => void }) {
  const { clientes, config, sb, eu, aviso } = useDados();
  const cli = ctx.clienteId ? clientes.get(ctx.clienteId) : undefined;
  const banco = nomeBonito((ctx.banco || cli?.kit?.banco || "").replace(/\s*(?:\be\b|;|,|\/)\s*(?:o\s+)?(?:INSS|Instituto Nacional do Seguro Social).*$/i, "").trim()); const k = chaveBanco(banco);
  const fem = /a$/i.test((cli?.estado_civil || "").trim()) || /a$/i.test((cli?.profissao || "").trim());
  const [pi, setPi] = useState({
    genero: fem ? "F" : "M", especie: "", nb: cli?.nb || "", pagador: "", banco,
    bancoQualif: (config.geral?.bancosQualif || {})[k] || QUALIF_PADRAO[k] || ", pessoa jurídica de direito privado, inscrita no CNPJ sob o nº [CNPJ], com sede na [ENDEREÇO], na cidade de [CIDADE/UF], CEP [CEP]; e",
    total: "", moral: "10.000,00", cidadeJuizo: (ctx.cidade || cli?.cidade || "Joinville/SC").toUpperCase(),
  });
  // contratos preenchidos no kit procuração do cliente já vêm aqui
  const [contratos, setContratos] = useState<Contrato[]>(() => {
    const l = (cli?.kit?.contratos || []).filter((c) => c.numero.trim());
    return l.length ? l.map((c) => ({ numero: c.numero, parcela: c.parcela, inclusao: /^\d\d\/\d\d\/\d{4}$/.test(c.averbacao) ? c.averbacao.split("/").reverse().join("-") : "" })) : [{ numero: "", parcela: "", inclusao: "" }];
  });
  const [files, setFiles] = useState<File[]>([]); const [nota, setNota] = useState(""); const [lendo, setLendo] = useState(false); const [gerando, setGerando] = useState(false);
  const [confirmQ, setConfirmQ] = useState(false); const [kitV, setKitV] = useState(0); const [totalManual, setTotalManual] = useState(false);
  const [calc, setCalc] = useState({ regime: "jf" as Regime, ate: mesAtual(), dobro: true, modulacao: false, usarNaCausa: true });
  const [ix, setIx] = useState<(Indices & { fonte: string }) | null>(null); const [res, setRes] = useState<Resultado | null>(null); const [calculando, setCalculando] = useState(false);
  // qualificação cadastrada no réu (cadastro de réus) tem preferência sobre o texto com [colchetes]
  useEffect(() => {
    const b = pi.banco.trim(); if (!b || !/\[CNPJ\]|\[ENDEREÇO\]/.test(pi.bancoQualif)) return;
    sb.from("reus").select("nome,qualificacao").ilike("nome", b).limit(1).then(({ data }: { data: { qualificacao: string | null }[] | null }) => {
      const q = data?.[0]?.qualificacao; if (q) setPi((x) => ({ ...x, bancoQualif: q.startsWith(",") ? q : ", " + q }));
    });
  }, [pi.banco]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!cli) return <Janela onFechar={onFechar} titulo="Petição inicial"><div className="banner">Escolha ou cadastre o cliente primeiro (o processo ou o atendimento precisa estar ligado a uma ficha de cliente).</div></Janela>;
  const set = (c: Partial<typeof pi>) => setPi({ ...pi, ...c });
  const faltam = [["nome", "nome"], ["cpf", "CPF"], ["endereco", "endereço"], ["cep", "CEP"], ["cidade", "cidade"]].filter(([c]) => !cli[c as keyof typeof cli]).map(([, r]) => r);
  const anos = idade(cli.nascimento);
  function somaDescontada() { return Math.round(paraCalculo().reduce((s, c) => s + c.parcela * c.qtd, 0) * 100) / 100; }
  const autoTotal = somaDescontada(); const totalStr = !totalManual && autoTotal > 0 ? moeda(autoTotal) : pi.total;
  const tot = numeroBR(totalStr), dobro = tot * 2, moral = numeroBR(pi.moral); const atualizado = res && calc.usarNaCausa ? res.tot.total : 0; const causa = (atualizado || dobro) + moral;

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
      const todos = (d.contratos || []) as { numero?: string; banco?: string; parcela?: number; inclusao?: string; inicioDesconto?: string; parcelasDescontadas?: number }[];
      const doBanco = todos.filter((c) => !pi.banco || !c.banco || chaveBanco(c.banco) === chaveBanco(pi.banco));
      const lista = doBanco.length ? doBanco : todos;
      if (lista.length) { setContratos(lista.map((c) => ({ numero: String(c.numero || ""), parcela: c.parcela != null ? moeda(+c.parcela) : "", inclusao: /^\d{4}-\d\d-\d\d$/.test(c.inclusao || "") ? c.inclusao! : "", inicio: /^\d{4}-\d\d/.test(c.inicioDesconto || "") ? c.inicioDesconto!.slice(0, 7) : "", qtd: c.parcelasDescontadas ? String(c.parcelasDescontadas) : "" }))); setRes(null); notas.push(lista.length + (lista.length === 1 ? " contrato" : " contratos")); }
      const est = lista.reduce((s, c) => s + (+(c.parcelasDescontadas || 0)) * (+(c.parcela || 0)), 0);
      if (est > 0) notas.push("total calculado pelas parcelas descontadas");
      set(novo);
      setNota((notas.length ? "Preenchido pelo Claude: " + notas.join(", ") + "." : "Não encontrei dados no extrato.") + (todos.length > lista.length ? " Há outros contratos no extrato, de outros bancos, que ficaram de fora." : "") + " Confira tudo antes de gerar.");
    } catch (e) { setNota((e as Error).message || "A leitura falhou. Tente de novo."); }
    finally { setLendo(false); }
  };
  const gerar = async () => {
    if (/\[[A-ZÇÃ\/ ]+\]/.test(pi.bancoQualif) && !confirmQ) { setConfirmQ(true); aviso("A qualificação do banco ainda tem campos entre colchetes. Clique de novo para gerar assim mesmo."); return; }
    setGerando(true);
    try {
      const r = await fetch("/api/peticao", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...pi, total: totalStr, indebitoAtualizado: atualizado ? moeda(atualizado) : "", contratos, clienteId: cli.id, numero: ctx.numero || null, casoId: ctx.casoId || null }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); aviso(j.erro || "Não foi possível gerar o arquivo."); return; }
      const nome = decodeURIComponent(r.headers.get("x-nome-arquivo") || "Peticao_Inicial.docx");
      const blob = await r.blob(); baixar(nome, blob); aviso("Petição gerada e guardada na pasta para protocolo. Revise no Word antes de protocolar.");
      guardarNaFicha(sb, cli.id, "inicial", nome, blob).then(() => setKitV((x) => x + 1));
    } catch { aviso("Não foi possível gerar o arquivo. Tente de novo."); }
    finally { setGerando(false); }
  };
  /** contratos prontos para o cálculo: 1º desconto (ou o mês seguinte à inclusão) e nº de parcelas (vazio = até a data-base) */
  function paraCalculo() { return contratos.map((c) => {
    const inicio = c.inicio || (c.inclusao ? somaMes(c.inclusao.slice(0, 7), 1) : "");
    const ate = calc.ate; let n = 0; if (inicio) for (let m = inicio; m < ate; m = somaMes(m, 1)) n++;
    return { numero: c.numero, parcela: numeroBR(c.parcela), inicio, qtd: c.qtd ? Math.min(+c.qtd || 0, n) : n };
  }); }
  const rodarCalculo = async (pdf: boolean) => {
    const cs = paraCalculo().filter((c) => c.parcela > 0 && c.inicio && c.qtd > 0);
    if (!cs.length) { aviso("Informe, em cada contrato, a parcela e o mês do 1º desconto (ou a data de inclusão)."); return; }
    setCalculando(true);
    try {
      let indices = ix;
      if (!indices) { const r = await fetch("/api/calculo/indices"); const j = await r.json().catch(() => ({})); if (!r.ok) { aviso(j.erro || "Não consegui buscar os índices."); return; } indices = j; setIx(j); }
      const r = calcular(cs, indices!, calc); setRes(r);
      if (pdf) {
        const { pdfCalculo } = await import("@/lib/calculoPdf");
        const bytes = await pdfCalculo(r, calc, { autor: nomeBonito(cli.nome), cpf: cli.cpf, reus: [pi.banco || "banco", "Instituto Nacional do Seguro Social - INSS"].join(" e "), processo: ctx.numero ? ctx.numero.replace(/^(\d{7})(\d{2})(\d{4})(\d)(\d{2})(\d{4})$/, "$1-$2.$3.$4.$5.$6") : null, nb: pi.nb, moral }, indices!.fonte);
        const nomePdf = `Calculo_-_${nomeBonito(cli.nome).replace(/\s+/g, "_")}.pdf`; const blobPdf = new Blob([bytes as BlobPart], { type: "application/pdf" });
        baixar(nomePdf, blobPdf); aviso("Cálculo gerado em PDF e guardado na pasta para protocolo.");
        guardarNaFicha(sb, cli.id, "calculo", nomePdf, blobPdf).then(() => setKitV((x) => x + 1));
      }
    } catch (e) { aviso((e as Error).message || "O cálculo falhou."); }
    finally { setCalculando(false); }
  };
  const campo = (c: keyof typeof pi, rot: string, ph?: string, list?: string) => <label className="f">{rot}<input value={pi[c]} placeholder={ph} list={list} onChange={(e) => set({ [c]: e.target.value })} /></label>;
  return (
    <Janela largo onFechar={onFechar} titulo="Petição inicial" sub={nomeBonito(cli.nome) + " x " + (pi.banco || "banco") + " e INSS · modelo do escritório"}
      acoes={<><button className="btn" disabled={calculando} onClick={() => rodarCalculo(true)}>{calculando ? "Calculando…" : "Gerar cálculo (PDF)"}</button><button className="btn primary" disabled={gerando} onClick={gerar}>{gerando ? "Gerando…" : "Gerar Word (.docx)"}</button></>}>
      {faltam.length > 0 && <div className="banner">Falta na ficha do cliente: {faltam.join(", ")}. Complete a ficha antes de gerar.</div>}
      <div className="muted" style={{ fontSize: 13 }}>Qualificação: {[nomeBonito(cli.nome), cli.nacionalidade || (pi.genero === "F" ? "brasileira" : "brasileiro"), cli.estado_civil, cli.profissao, "CPF " + (cli.cpf || "—"), cli.endereco, cli.cep, cli.cidade].filter(Boolean).join(", ")}{anos != null ? ` · ${anos} anos${anos >= 60 ? " (pede prioridade de idoso)" : ""}` : ""}</div>
      <section className="novo-cli">
        <div className="av-top"><strong>Extrato de empréstimos do INSS (HISCON)</strong><span className="muted" style={{ fontSize: 12.5 }}>o Claude lê benefício, banco pagador e contratos</span></div>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files || [])]); e.target.value = ""; }} />
        {files.length > 0 && <div className="anexos">{files.map((f, i) => <span key={i} className="anexo"><span className="an">{f.name}</span><button className="btn ghost" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Excluir</button></span>)}</div>}
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
            <label className="f">1º desconto (mês)<input type="month" value={c.inicio || ""} placeholder={c.inclusao ? mesBR(somaMes(c.inclusao.slice(0, 7), 1)) : ""} onChange={(e) => { setRes(null); setContratos(contratos.map((x, j) => (j === i ? { ...x, inicio: e.target.value } : x))); }} /></label>
            <label className="f">Parcelas descontadas<input inputMode="numeric" value={c.qtd || ""} placeholder="até hoje" onChange={(e) => { setRes(null); setContratos(contratos.map((x, j) => (j === i ? { ...x, qtd: e.target.value.replace(/\D/g, "") } : x))); }} /></label>
            {contratos.length > 1 && <div className="tools"><button className="btn ghost" onClick={() => setContratos(contratos.filter((_, j) => j !== i))}>Excluir</button></div>}
          </div>))}</div></section>
      <div className="form2">
        <label className="f">Total já descontado (R$){!totalManual && autoTotal > 0 ? <span className="muted" style={{ fontWeight: 400 }}> · soma das parcelas dos contratos</span> : null}
          <input inputMode="decimal" value={totalStr} placeholder="preencha parcela e 1º desconto dos contratos" onChange={(e) => { setTotalManual(true); set({ total: e.target.value }); }} />
          {totalManual && autoTotal > 0 && numeroBR(pi.total) !== autoTotal && <button className="reflink" style={{ alignSelf: "flex-start" }} onClick={() => setTotalManual(false)}>Voltar à soma dos contratos (R$ {moeda(autoTotal)})</button>}</label>
        {campo("moral", "Danos morais (R$)")}</div>
      <section className="panel calc"><div className="ph"><h3>Cálculo atualizado</h3><span className="muted" style={{ fontSize: 12 }}>parcelas em dobro, com correção e juros desde cada desconto</span></div>
        <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="form2">
            <label className="f full">Critério de atualização<select value={calc.regime} onChange={(e) => { setRes(null); setCalc({ ...calc, regime: e.target.value as Regime }); }}>{(Object.keys(REGIMES) as Regime[]).map((k) => <option key={k} value={k}>{REGIMES[k].nome}</option>)}</select></label>
            <label className="f">Data-base (mês do cálculo)<input type="month" value={calc.ate} onChange={(e) => { setRes(null); setCalc({ ...calc, ate: e.target.value || mesAtual() }); }} /></label>
            <div className="f" style={{ justifyContent: "flex-end", gap: 6 }}>
              <label className="chk"><input type="checkbox" checked={calc.dobro} onChange={(e) => { setRes(null); setCalc({ ...calc, dobro: e.target.checked }); }} /> Restituição em dobro (art. 42 do CDC)</label>
              <label className="chk"><input type="checkbox" checked={calc.modulacao} disabled={!calc.dobro} onChange={(e) => { setRes(null); setCalc({ ...calc, modulacao: e.target.checked }); }} /> Dobro só após 30/03/2021 (STJ, EAREsp 676.608)</label>
            </div>
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>{REGIMES[calc.regime].texto} Índices do Banco Central, buscados na hora.</div>
          <div className="tools"><button className="btn" disabled={calculando} onClick={() => rodarCalculo(false)}>{calculando ? "Calculando…" : "Calcular"}</button>
            {res && <button className="btn primary" disabled={calculando} onClick={() => rodarCalculo(true)}>Baixar PDF</button>}</div>
          {res && <div className="calc-res">
            <table className="grid"><thead><tr><th>Contrato</th><th>Parcelas</th><th className="num">Descontado</th><th className="num">{calc.dobro ? "Em dobro" : "Valor"}</th><th className="num">Correção</th><th className="num">Juros</th><th className="num">Atualizado</th></tr></thead>
              <tbody>{res.porContrato.map((c) => <tr key={c.contrato}><td className="mono">{c.contrato}</td><td>{c.n}</td><td className="num">{moeda(c.valor)}</td><td className="num">{moeda(c.base)}</td><td className="num">{moeda(c.correcao)}</td><td className="num">{moeda(c.juros)}</td><td className="num"><strong>{moeda(c.total)}</strong></td></tr>)}
                <tr><td><strong>Total</strong></td><td>{res.linhas.length}</td><td className="num"><strong>{moeda(res.tot.valor)}</strong></td><td className="num">{moeda(res.tot.base)}</td><td className="num">{moeda(res.tot.correcao)}</td><td className="num">{moeda(res.tot.juros)}</td><td className="num"><strong>R$ {moeda(res.tot.total)}</strong></td></tr></tbody></table>
            <div className="tools" style={{ marginTop: 8 }}>
              <span className="muted" style={{ fontSize: 12.5 }}>Atualizado até {mesBR(res.ultimoMes)}.{res.faltam.length ? " Índices ainda não divulgados (contados como zero): " + res.faltam.slice(0, 4).join(", ") + "." : ""}</span>
              <label className="chk"><input type="checkbox" checked={calc.usarNaCausa} onChange={(e) => setCalc({ ...calc, usarNaCausa: e.target.checked })} /> Usar o valor atualizado no valor da causa</label>
            </div>
          </div>}
        </div></section>
      <div className="valores"><span>Restituição em dobro: <strong>R$ {moeda(dobro)}</strong></span>{atualizado ? <span>Indébito atualizado: <strong>R$ {moeda(atualizado)}</strong></span> : null}<span>Valor da causa: <strong>R$ {moeda(causa)}</strong></span><span className="muted">({porExtenso(causa)})</span></div>
      <PastaProtocolo clienteId={cli.id} nomeCliente={cli.nome} banco={pi.banco} atualizar={kitV} numero={ctx.numero} casoId={ctx.casoId} />
    </Janela>
  );
}
