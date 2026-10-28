"use client";
import { obterIndices } from "@/lib/indicesBcb";
// Cumprimento de sentença: o Claude lê a cópia integral do processo e extrai o título executivo; o sistema calcula a liquidação
// com os índices do Banco Central (critérios do título), gera a memória de cálculo em PDF e a petição no modelo do escritório,
// e manda as duas para correção.
import { useEffect, useMemo, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { moeda, nomeBonito, numeroBR } from "@/lib/formato";
import { enviarParaLeitura } from "@/lib/leitura";
import { LIMITE_VISUAL, contarPaginas, textoDoPdf, type TextoPdf } from "@/lib/pdftexto";
import { mesBR, type Indices } from "@/lib/calculo";
import { REGIMES_CS, SALARIO_MINIMO, liquidar, ultimoMesComIndice, type AtualizacaoComp, type ParamsCs, type RegimeCs, type ResultadoCs } from "@/lib/cumprimento";
import { hojeBR, isoData, paraData, proximoDiaUtil } from "@/lib/prazos";
import { Janela, SelResp, baixar } from "./ui";
import { useAcoesTarefa } from "./tarefas";
import { useVisor } from "./visor";
import { AbasPeticao } from "./peca";

export type CtxCumprimento = { numero: string; tarefaId?: string | null };
type Ct = { numero: string; parcela: string; inicio: string; fim: string; fonte?: string };
type Lido = { enderecamento: string; jef: boolean; executado: string; inss: "subsidiaria" | "solidaria" | "nenhuma"; titulo: string; custas: string; fonteExtrato: string; nb: string; oficiarInss: boolean; pisoTexto: string; criterioTexto: string; alertas: string[] };
const mesOk = (s: unknown) => (typeof s === "string" && /^\d{4}-\d\d/.test(s) ? s.slice(0, 7) : "");
const n2 = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" ? numeroBR(v) : 0);

export function JanelaCumprimento({ ctx, onFechar, onInicial, onIntermediaria }: { ctx: CtxCumprimento; onFechar: () => void; onInicial?: () => void; onIntermediaria?: (n: string) => void }) {
  const { processos, clientes, tarefas, sb, eu, aviso, equipe, nome, aplicar, registrar } = useDados(); const acoes = useAcoesTarefa(); const visor = useVisor();
  const p = processos.get(ctx.numero); const cli = p?.cliente_id ? clientes.get(p.cliente_id) : undefined;
  const tarefa = ctx.tarefaId ? tarefas.get(ctx.tarefaId) : undefined;
  const banco = (p?.reus || []).find((r) => !/INSS|Instituto Nacional/i.test(r)) || p?.banco || "";
  const [files, setFiles] = useState<File[]>([]); const [orient, setOrient] = useState(""); const [etapa, setEtapa] = useState(""); const [lendo, setLendo] = useState(false); const [erroMsg, setErroMsg] = useState("");
  const [lido, setLido] = useState<Lido>({ enderecamento: p?.orgao ? "Ao Juízo da " + p.orgao : "", jef: /juizado|JEF/i.test((p?.orgao || "") + (p?.classe || "")), executado: nomeBonito(banco), inss: "subsidiaria", titulo: "", custas: "", fonteExtrato: "", nb: cli?.nb || "", oficiarInss: true, pisoTexto: "", criterioTexto: "", alertas: [] });
  const [prm, setPrm] = useState({ base: "", regime: "ipcae_selic" as RegimeCs, restituicao: "simples" as ParamsCs["restituicao"], jurosMateriais: "desconto" as ParamsCs["jurosMateriais"], citacao: "",
    temMoral: true, moral: "", moralJuros: "", moralCorr: "", temComp: false, comp: "", compMes: "", compAtual: "completa" as AtualizacaoComp,
    hTipo: "percentual" as ParamsCs["honorarios"]["tipo"], hPct: "10", hMin: "", hMinDesde: "", hValor: "", hValorDesde: "" });
  const [cts, setCts] = useState<Ct[]>([{ numero: "", parcela: "", inicio: "", fim: "" }]);
  const [ix, setIx] = useState<(Indices & { fonte: string }) | null>(null); const [res, setRes] = useState<ResultadoCs | null>(null); const [calculando, setCalculando] = useState(false);
  const [docx, setDocx] = useState<File | null>(null); const [pdf, setPdf] = useState<File | null>(null); const [gerando, setGerando] = useState("");
  const titularId = equipe.find((x) => x.papel === "titular" && x.ativo && x.id !== eu.id)?.id || (eu.papel === "titular" ? eu.id : "");
  const [env, setEnv] = useState({ revisor: titularId, recado: "", ate: isoData(proximoDiaUtil(paraData(hojeBR()))) }); const [enviando, setEnviando] = useState(false); const [enviada, setEnviada] = useState(false);
  const set = (c: Partial<typeof prm>) => { setPrm((x) => ({ ...x, ...c })); setRes(null); };
  const setL = (c: Partial<Lido>) => setLido((x) => ({ ...x, ...c }));

  const indices = async () => {
    if (ix) return ix;
    const j = await obterIndices();
    setIx(j); setPrm((x) => (x.base ? x : { ...x, base: ultimoMesComIndice(j) })); return j as Indices & { fonte: string };
  };
  useEffect(() => { indices().catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const ler = async () => {
    if (!files.length) { aviso("Anexe a cópia integral do processo (PDF)."); return; }
    setLendo(true); setErroMsg("");
    try {
      const inteiros: File[] = []; const textos: TextoPdf[] = [];
      for (const f of files) {
        const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
        let grande = ehPdf && f.size > LIMITE_VISUAL.bytes;
        if (ehPdf && !grande) { setEtapa("Abrindo " + f.name + "…"); try { grande = (await contarPaginas(f)) > LIMITE_VISUAL.paginas; } catch { grande = false; } }
        if (!grande) { inteiros.push(f); continue; }
        setEtapa("Lendo " + f.name + "…");
        let tx: TextoPdf;
        try { tx = await textoDoPdf(f, (i, n) => setEtapa(`Lendo ${f.name}: página ${i} de ${n}`)); } catch { setErroMsg(`Não consegui abrir ${f.name}. Confira se é um PDF válido (sem senha).`); return; }
        if (tx.semTexto.length >= tx.paginas * 0.9) { setErroMsg(`${f.name} parece escaneado (páginas só com imagem). Envie a sentença, o acórdão e o extrato em PDFs menores.`); return; }
        textos.push(tx);
      }
      setEtapa(inteiros.length ? "Enviando os documentos…" : "");
      const arquivos = inteiros.length ? await enviarParaLeitura(sb, eu.id, inteiros) : [];
      setEtapa("O Claude está lendo o processo e o título executivo (1 a 3 minutos)…");
      const r = await fetch("/api/peticao/cumprimento/ler", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ numero: ctx.numero, arquivos, textos, orientacoes: orient }) });
      const j = await r.json().catch(() => ({ erro: "A resposta chegou incompleta. Tente de novo." }));
      if (!r.ok || j.erro) { setErroMsg(j.erro || "Não consegui ler o processo agora."); return; }
      const d = (j.dados || {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      const h = d.honorarios || {}; const mo = d.moral; const co = d.compensacao;
      setLido((x) => ({ ...x, enderecamento: d.enderecamento || x.enderecamento, jef: d.jef ?? x.jef, executado: d.executado || x.executado, inss: ["subsidiaria", "solidaria", "nenhuma"].includes(d.inss) ? d.inss : x.inss,
        titulo: Array.isArray(d.titulo) ? d.titulo.join("\n\n") : x.titulo, custas: d.custas || "", nb: d.nb || x.nb, oficiarInss: d.oficiarInss ?? x.oficiarInss, pisoTexto: h.pisoTexto || "",
        criterioTexto: d.criterioTexto || "", alertas: Array.isArray(d.alertas) ? d.alertas.map(String) : [],
        fonteExtrato: Array.isArray(d.contratos) && d.contratos[0]?.fonte ? "o extrato de créditos do benefício (" + d.contratos[0].fonte + ")" : x.fonteExtrato }));
      if (Array.isArray(d.contratos) && d.contratos.length) setCts(d.contratos.map((c: Record<string, unknown>) => ({ numero: String(c.numero || ""), parcela: n2(c.parcela) ? moeda(n2(c.parcela)) : "", inicio: mesOk(c.inicio), fim: mesOk(c.fim), fonte: String(c.fonte || "") })));
      setPrm((x) => ({ ...x,
        regime: (d.regime in REGIMES_CS ? d.regime : x.regime) as RegimeCs, restituicao: ["simples", "dobro", "dobro_modulado", "nenhuma"].includes(d.restituicao) ? d.restituicao : x.restituicao,
        jurosMateriais: d.jurosMateriais === "citacao" ? "citacao" : "desconto", citacao: mesOk(d.citacao),
        temMoral: !!(mo && n2(mo.valor)), moral: mo && n2(mo.valor) ? moeda(n2(mo.valor)) : "", moralJuros: mesOk(mo?.jurosDesde), moralCorr: mesOk(mo?.correcaoDesde),
        temComp: !!(co && n2(co.valor)), comp: co && n2(co.valor) ? moeda(n2(co.valor)) : "", compMes: mesOk(co?.mes), compAtual: (["completa", "correcao", "historico"].includes(co?.atualizacao) ? co.atualizacao : "completa") as AtualizacaoComp,
        hTipo: ["nenhum", "percentual", "fixo"].includes(h.tipo) ? h.tipo : x.hTipo, hPct: h.pct != null ? String(h.pct).replace(".", ",") : x.hPct, hMin: n2(h.minimo) ? moeda(n2(h.minimo)) : "",
        hMinDesde: mesOk(h.minimoDesde), hValor: n2(h.valor) ? moeda(n2(h.valor)) : "", hValorDesde: mesOk(h.valorDesde) }));
      setRes(null); setDocx(null); setPdf(null);
      aviso("Título executivo lido pelo Claude. Confira os dados antes de calcular.");
    } catch (e) { setErroMsg(/load failed|failed to fetch|network/i.test((e as Error).message) ? "A conexão caiu durante a leitura. Confira a internet e tente de novo." : (e as Error).message || "A leitura falhou."); }
    finally { setLendo(false); setEtapa(""); }
  };

  const params = (): ParamsCs => ({
    base: prm.base, regime: prm.regime, restituicao: prm.restituicao, jurosMateriais: prm.jurosMateriais, citacao: prm.citacao || undefined,
    contratos: cts.map((c) => ({ numero: c.numero.trim(), parcela: numeroBR(c.parcela), inicio: c.inicio, fim: c.fim })).filter((c) => c.parcela > 0 && c.inicio),
    moral: prm.temMoral && numeroBR(prm.moral) > 0 ? { valor: numeroBR(prm.moral), jurosDesde: prm.moralJuros, correcaoDesde: prm.moralCorr || prm.moralJuros } : null,
    compensacao: prm.temComp && numeroBR(prm.comp) > 0 && prm.compMes ? { valor: numeroBR(prm.comp), mes: prm.compMes, atualizacao: prm.compAtual } : null,
    honorarios: { tipo: prm.hTipo, pct: numeroBR(prm.hPct), minimo: numeroBR(prm.hMin), minimoDesde: prm.hMinDesde, valor: numeroBR(prm.hValor), valorDesde: prm.hValorDesde },
  });
  // o cálculo vira o novo valor da causa do processo (total da condenação; os honorários de sucumbência ficam de fora,
  // porque são do advogado e não entram na base dos honorários contratuais). Reflete no CRM, na ficha e nos relatórios.
  const [valorNovo, setValorNovo] = useState<{ de: number | null; para: number } | null>(null);
  const atualizarValorCausa = async (r: ResultadoCs) => {
    const proc = processos.get(ctx.numero); const v = Math.round(r.condenacao * 100) / 100;
    if (!proc || !(v > 0) || Math.abs((proc.valor_causa || 0) - v) < 0.01) return;
    const { data, error } = await sb.from("processos").update({ valor_causa: v }).eq("numero", proc.numero).select().single();
    if (error) { aviso(msgErro(error)); return; }
    aplicar("processos", data); setValorNovo({ de: proc.valor_causa ?? null, para: v });
    registrar({ processo_numero: proc.numero, tipo: "comentario", dados: { texto: `Valor da causa atualizado pelo cálculo de cumprimento de sentença (data-base ${mesBR(prm.base)}): ${proc.valor_causa ? "de R$ " + moeda(proc.valor_causa) + " " : ""}para R$ ${moeda(v)}.` } });
  };
  const calcular = async (): Promise<{ r: ResultadoCs; ps: ParamsCs; ix: Indices & { fonte: string } } | null> => {
    const ps = params();
    if (!ps.base) { aviso("Informe a data-base do cálculo."); return null; }
    if (ps.restituicao !== "nenhuma" && !ps.contratos.length) { aviso("Informe, em cada contrato, a parcela e a competência do 1º desconto."); return null; }
    if (ps.moral && !ps.moral.jurosDesde) { aviso("Informe desde quando correm os juros dos danos morais."); return null; }
    setCalculando(true);
    try { const i = await indices(); const r = liquidar(ps, i); setRes(r); await atualizarValorCausa(r); return { r, ps, ix: i }; }
    catch (e) { aviso((e as Error).message); return null; }
    finally { setCalculando(false); }
  };
  const nomeBase = nomeBonito(cli?.nome || p?.cliente_nome || "").replace(/\s+/g, "_");
  const gerarPdf = async () => {
    const c = await calcular(); if (!c || !p) return null;
    setGerando("pdf");
    try {
      const { pdfCumprimento } = await import("@/lib/cumprimentoPdf");
      const bytes = await pdfCumprimento(c.r, c.ps, { exequente: nomeBonito(cli?.nome || p.cliente_nome), cpf: cli?.cpf, executados: [lido.executado, lido.inss !== "nenhuma" ? "Instituto Nacional do Seguro Social - INSS" + (lido.inss === "subsidiaria" ? " (subsidiariamente)" : "") : ""].filter(Boolean).join(" e "), processo: p.mascara, juizo: p.orgao, nb: lido.nb }, c.ix.fonte);
      const f = new File([bytes as BlobPart], `Calculo_Cumprimento_-_${nomeBase.normalize("NFD").replace(/[\u0300-\u036f]/g, "")}.pdf`, { type: "application/pdf" });
      setPdf(f); baixar(f.name, f); aviso("Memória de cálculo gerada em PDF."); return f;
    } catch (e) { aviso((e as Error).message || "Não consegui gerar o PDF."); return null; }
    finally { setGerando(""); }
  };
  const gerarDocx = async () => {
    if (!lido.titulo.trim()) { aviso("Leia o processo com o Claude (ou escreva o título executivo) antes de gerar a petição."); return null; }
    const c = await calcular(); if (!c) return null;
    setGerando("docx");
    try {
      const r = await fetch("/api/peticao/cumprimento", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        numero: ctx.numero, enderecamento: lido.enderecamento, executado: lido.executado, inss: lido.inss, jef: lido.jef, titulo: lido.titulo.split(/\n\s*\n/), custas: lido.custas,
        fonteExtrato: lido.fonteExtrato, nb: lido.nb, oficiarInss: lido.oficiarInss, pisoTexto: lido.pisoTexto, params: c.ps, r: c.r }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { aviso(j.erro || "Não consegui gerar a petição."); return null; }
      const bin = atob(j.base64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const f = new File([u], j.nome, { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      setDocx(f); baixar(f.name, f); aviso("Petição de cumprimento gerada. Revise no Word antes de protocolar."); return f;
    } catch (e) { aviso((e as Error).message || "Não consegui gerar a petição."); return null; }
    finally { setGerando(""); }
  };
  const podeUsarTarefa = !!tarefa && tarefa.responsavel === eu.id && !["revisao", "feito"].includes(tarefa.status);
  const enviar = async () => {
    if (!docx || !pdf) { aviso("Gere a petição e o cálculo antes de enviar."); return; }
    if (!env.revisor) { aviso("Escolha quem vai corrigir."); return; }
    setEnviando(true);
    try {
      let t = podeUsarTarefa ? tarefa! : null;
      if (!t) {
        const { data, error } = await sb.from("tarefas").insert({ processo_numero: ctx.numero, tipo: "Cumprimento de sentença / cálculos", descricao: "Cumprimento de sentença: corrigir a petição e o cálculo de liquidação", vencimento: env.ate || null, responsavel: eu.id }).select().single();
        if (error || !data) { aviso(msgErro(error)); return; }
        aplicar("tarefas", data); t = data;
      }
      const ok = await acoes.enviar(t!, [docx, pdf], env.recado.trim(), env.revisor, env.ate);
      if (ok) setEnviada(true);
    } finally { setEnviando(false); }
  };
  const ct = (i: number, c: Partial<Ct>) => { setCts(cts.map((x, j) => (j === i ? { ...x, ...c } : x))); setRes(null); };
  const sm = SALARIO_MINIMO[(prm.hMinDesde || hojeBR()).slice(0, 4)];
  const totalPrevio = useMemo(() => res, [res]);
  if (!p) return <Janela onFechar={onFechar} titulo="Cumprimento de sentença"><div className="banner">Processo não encontrado.</div></Janela>;
  return (
    <Janela largo onFechar={onFechar} titulo="Cumprimento de sentença" sub={nomeBonito(p.cliente_nome || "") + " · " + p.mascara}
      acoes={<><button className="btn" disabled={!!gerando || calculando} onClick={gerarPdf}>{gerando === "pdf" ? "Gerando…" : "Gerar cálculo (PDF)"}</button><button className="btn primary" disabled={!!gerando || calculando} onClick={gerarDocx}>{gerando === "docx" ? "Gerando…" : "Gerar petição (Word)"}</button></>}>
      {(onInicial || onIntermediaria) && <AbasPeticao modo="cumprimento" clienteId={p.cliente_id} numero={ctx.numero} onInicial={onInicial} onIntermediaria={onIntermediaria} />}
      <div className="muted" style={{ fontSize: 13 }}>Exequente: <b>{nomeBonito(cli?.nome || p.cliente_nome)}</b>{cli?.cpf ? " · CPF " + cli.cpf : ""} · Executado: <b>{lido.executado || "—"}</b>{lido.inss !== "nenhuma" ? " e INSS" + (lido.inss === "subsidiaria" ? " (subsidiário)" : "") : ""} · Juízo: {p.orgao || "—"}</div>

      <section className="novo-cli">
        <div className="av-top"><strong>1. Cópia integral do processo</strong><span className="muted" style={{ fontSize: 12.5 }}>o Claude lê a sentença, o acórdão, o trânsito e o extrato de descontos</span></div>
        <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files || [])].slice(0, 6)); e.target.value = ""; }} />
        {files.length > 0 && <div className="anexos">{files.map((f, i) => <span key={i} className="anexo"><span className="an">{f.name}</span><button className="btn ghost" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Excluir</button></span>)}</div>}
        <label className="f">Orientações para o Claude (opcional)<input value={orient} placeholder="Ex.: considerar o extrato HISCRE atualizado anexo; os descontos cessaram em 04/2026" onChange={(e) => setOrient(e.target.value)} /></label>
        <div className="tools"><button className="btn primary" disabled={lendo || !files.length} onClick={ler}>{lendo ? "O Claude está lendo…" : "Ler processo com o Claude"}</button></div>
        {etapa && <div className="banner">{etapa}</div>}
        {erroMsg && <div className="banner erro">{erroMsg}</div>}
        {lido.alertas.length > 0 && <div className="banner"><strong>O Claude pede para conferir:</strong><ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{lido.alertas.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
      </section>

      <section className="panel"><div className="ph"><h3>2. Título executivo</h3>{lido.criterioTexto && <span className="muted" style={{ fontSize: 12 }}>critério no título: {lido.criterioTexto}</span>}</div>
        <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="form2">
            <label className="f full">Endereçamento<input value={lido.enderecamento} placeholder="AO JUÍZO DO JUIZADO ESPECIAL FEDERAL DA 2ª VARA FEDERAL DE JOINVILLE/SC" onChange={(e) => setL({ enderecamento: e.target.value })} /></label>
            <label className="f">Executado (banco)<input value={lido.executado} onChange={(e) => setL({ executado: e.target.value })} /></label>
            <label className="f">INSS no título<select value={lido.inss} onChange={(e) => setL({ inss: e.target.value as Lido["inss"] })}><option value="subsidiaria">Responsável subsidiário</option><option value="solidaria">Responsável solidário</option><option value="nenhuma">Sem condenação do INSS</option></select></label>
            <label className="f">Nº do benefício<input value={lido.nb} onChange={(e) => setL({ nb: e.target.value })} /></label>
            <div className="f" style={{ justifyContent: "flex-end", gap: 6 }}>
              <label className="chk"><input type="checkbox" checked={lido.jef} onChange={(e) => setL({ jef: e.target.checked })} /> Juizado Especial (Leis 9.099 e 10.259)</label>
              <label className="chk"><input type="checkbox" checked={lido.oficiarInss} onChange={(e) => setL({ oficiarInss: e.target.checked })} /> Pedir ofício ao INSS (cessação dos descontos)</label>
            </div>
          </div>
          <label className="f">Seção “I – Do título executivo judicial” (um parágrafo por bloco; **negrito** entre asteriscos)<textarea rows={9} value={lido.titulo} placeholder="Clique em “Ler processo com o Claude”: ele redige esta seção a partir da sentença, do acórdão e do trânsito em julgado." onChange={(e) => setL({ titulo: e.target.value })} /></label>
          <label className="f">Custas e compensação (item final da memória)<input value={lido.custas} placeholder="Ex.: não há custas por força do art. 55 da Lei 9.099/95" onChange={(e) => setL({ custas: e.target.value })} /></label>
        </div></section>

      <section className="panel calc"><div className="ph"><h3>3. Cálculo de liquidação</h3><span className="muted" style={{ fontSize: 12 }}>índices do Banco Central, critério da Justiça Federal</span></div>
        <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="form2">
            <label className="f full">Critério de correção e juros<select value={prm.regime} onChange={(e) => set({ regime: e.target.value as RegimeCs })}>{(Object.keys(REGIMES_CS) as RegimeCs[]).map((k) => <option key={k} value={k}>{REGIMES_CS[k].nome}</option>)}</select></label>
            <label className="f">Data-base (último mês com índice)<input type="month" value={prm.base} onChange={(e) => set({ base: e.target.value })} /></label>
            <label className="f">Restituição<select value={prm.restituicao} onChange={(e) => set({ restituicao: e.target.value as ParamsCs["restituicao"] })}><option value="simples">Simples</option><option value="dobro">Em dobro</option><option value="dobro_modulado">Em dobro após 30/03/2021 (EAREsp 676.608)</option><option value="nenhuma">Sem danos materiais</option></select></label>
            <label className="f">Juros dos danos materiais<select value={prm.jurosMateriais} onChange={(e) => set({ jurosMateriais: e.target.value as ParamsCs["jurosMateriais"] })}><option value="desconto">Desde cada desconto (Súmula 54)</option><option value="citacao">Desde a citação</option></select></label>
            {prm.jurosMateriais === "citacao" && <label className="f">Mês da citação<input type="month" value={prm.citacao} onChange={(e) => set({ citacao: e.target.value })} /></label>}
          </div>
          <div className="muted" style={{ fontSize: 12.5 }}>{REGIMES_CS[prm.regime].texto}</div>
          {prm.restituicao !== "nenhuma" && <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="tools" style={{ justifyContent: "space-between" }}><strong style={{ fontSize: 13.5 }}>Parcelas descontadas</strong><button className="btn ghost" onClick={() => setCts([...cts, { numero: "", parcela: "", inicio: "", fim: "" }])}>+ Contrato</button></div>
            {cts.map((c, i) => <div key={i} className="triage">
              <label className="f">Nº do contrato<input value={c.numero} onChange={(e) => ct(i, { numero: e.target.value })} /></label>
              <label className="f">Parcela (R$)<input inputMode="decimal" value={c.parcela} onChange={(e) => ct(i, { parcela: e.target.value })} /></label>
              <label className="f">1ª competência descontada<input type="month" value={c.inicio} onChange={(e) => ct(i, { inicio: e.target.value })} /></label>
              <label className="f">Última competência<input type="month" value={c.fim} onChange={(e) => ct(i, { fim: e.target.value })} /></label>
              {c.fonte && <div className="muted s" style={{ alignSelf: "center" }}>fonte: {c.fonte}</div>}
              {cts.length > 1 && <div className="tools"><button className="btn ghost" onClick={() => { setCts(cts.filter((_, j) => j !== i)); setRes(null); }}>Excluir</button></div>}
            </div>)}
            <div className="muted s">Sem a última competência, conta até a data-base (descontos ainda ativos).</div>
          </div>}
          <label className="chk"><input type="checkbox" checked={prm.temMoral} onChange={(e) => set({ temMoral: e.target.checked })} /> Danos morais</label>
          {prm.temMoral && <div className="triage">
            <label className="f">Valor fixado (R$)<input inputMode="decimal" value={prm.moral} onChange={(e) => set({ moral: e.target.value })} /></label>
            <label className="f">Juros desde (mês)<input type="month" value={prm.moralJuros} onChange={(e) => set({ moralJuros: e.target.value })} /></label>
            <label className="f">Correção desde (mês)<input type="month" value={prm.moralCorr} onChange={(e) => set({ moralCorr: e.target.value })} /></label>
            <div className="muted s" style={{ alignSelf: "center" }}>juros: evento danoso (Súmula 54) · correção: arbitramento (Súmula 362)</div>
          </div>}
          <label className="chk"><input type="checkbox" checked={prm.temComp} onChange={(e) => set({ temComp: e.target.checked })} /> Deduzir valor creditado (só se o título mandou compensar)</label>
          {prm.temComp && <div className="triage">
            <label className="f">Valor creditado (R$)<input inputMode="decimal" value={prm.comp} onChange={(e) => set({ comp: e.target.value })} /></label>
            <label className="f">Mês do crédito<input type="month" value={prm.compMes} onChange={(e) => set({ compMes: e.target.value })} /></label>
            <label className="f">Como abater<select value={prm.compAtual} onChange={(e) => set({ compAtual: e.target.value as AtualizacaoComp })}>
              <option value="completa">Atualizado (correção + juros)</option><option value="correcao">Só correção monetária, sem juros</option><option value="historico">Valor histórico (sem correção e sem juros)</option></select></label>
          </div>}
          <div className="triage">
            <label className="f">Honorários sucumbenciais<select value={prm.hTipo} onChange={(e) => set({ hTipo: e.target.value as ParamsCs["honorarios"]["tipo"] })}><option value="percentual">% sobre a condenação</option><option value="fixo">Valor fixo</option><option value="nenhum">Sem honorários</option></select></label>
            {prm.hTipo === "percentual" && <>
              <label className="f">Percentual (%)<input inputMode="decimal" value={prm.hPct} onChange={(e) => set({ hPct: e.target.value })} /></label>
              <label className="f">Piso (R$)<input inputMode="decimal" value={prm.hMin} placeholder="sem piso" onChange={(e) => set({ hMin: e.target.value })} />{sm && !prm.hMin ? <button type="button" className="reflink" style={{ fontSize: 12, alignSelf: "flex-start" }} onClick={() => set({ hMin: moeda(sm) })}>usar 1 salário mínimo (R$ {moeda(sm)})</button> : null}</label>
              <label className="f">Piso atualizado desde<input type="month" value={prm.hMinDesde} onChange={(e) => set({ hMinDesde: e.target.value })} /></label>
              <label className="f wide2">Texto do piso na petição<input value={lido.pisoTexto} placeholder="Ex.: 1 (um) salário mínimo vigente na data do acórdão (27/08/2026)" onChange={(e) => setL({ pisoTexto: e.target.value })} /></label>
            </>}
            {prm.hTipo === "fixo" && <>
              <label className="f">Valor (R$)<input inputMode="decimal" value={prm.hValor} onChange={(e) => set({ hValor: e.target.value })} /></label>
              <label className="f">Atualizado desde<input type="month" value={prm.hValorDesde} onChange={(e) => set({ hValorDesde: e.target.value })} /></label>
            </>}
          </div>
          <div className="tools"><button className="btn" disabled={calculando} onClick={calcular}>{calculando ? "Calculando…" : "Calcular"}</button></div>
          {totalPrevio && <div className="calc-res">
            <table className="grid"><tbody>
              {totalPrevio.linhas.length > 0 && <tr><td>Danos materiais ({totalPrevio.linhas.length} parcelas{totalPrevio.porContrato.length ? ", " + totalPrevio.porContrato.map((c) => `${mesBR(c.ini)} a ${mesBR(c.fim)}`).join("; ") : ""})</td><td className="num">{moeda(totalPrevio.materiais)}</td></tr>}
              {totalPrevio.moral && <tr><td>Danos morais atualizados</td><td className="num">{moeda(totalPrevio.moral.total)}</td></tr>}
              {totalPrevio.compensacao && <tr><td>(−) Compensação {prm.compAtual === "historico" ? "(valor histórico)" : prm.compAtual === "correcao" ? "corrigida" : "atualizada"}</td><td className="num">−{moeda(totalPrevio.compensacao.total)}</td></tr>}
              <tr><td><strong>Total da condenação</strong></td><td className="num"><strong>{moeda(totalPrevio.condenacao)}</strong></td></tr>
              {totalPrevio.honorarios && <tr><td>Honorários sucumbenciais{totalPrevio.honorarios.prevaleceMinimo ? " (piso)" : ""}</td><td className="num">{moeda(totalPrevio.honorarios.valor)}</td></tr>}
              <tr><td><strong>Total líquido exequendo</strong></td><td className="num"><strong>R$ {moeda(totalPrevio.total)}</strong></td></tr>
            </tbody></table>
            {valorNovo && <div className="banner ok" style={{ marginTop: 8 }}>Valor da causa do processo atualizado {valorNovo.de ? `de R$ ${moeda(valorNovo.de)} ` : ""}para <b>R$ {moeda(valorNovo.para)}</b> (total da condenação, sem os honorários de sucumbência). Já aparece no CRM, na ficha e nos relatórios.</div>}
            <div className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>Data-base {mesBR(prm.base)}.{totalPrevio.faltam.length ? " Índices ainda não divulgados (contados como zero): " + totalPrevio.faltam.slice(0, 4).join(", ") + "." : ""}</div>
          </div>}
        </div></section>

      <section className="panel kit"><div className="ph"><h3>4. Petição e cálculo</h3><span className="muted" style={{ fontSize: 12 }}>anexe e envie para quem vai corrigir</span></div>
        <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[["docx", "Petição de cumprimento (Word)", docx, setDocx, gerarDocx, ".docx"] as const, ["pdf", "Memória de cálculo (PDF)", pdf, setPdf, gerarPdf, ".pdf,application/pdf"] as const].map(([k, rot, f, setF, gerar, aceita]) => (
            <div key={k} className={"kit-item" + (f ? " ok" : "")}>
              <span className="kit-n">{k === "docx" ? "01" : "02"}</span>
              <div className="kit-main"><div className="kit-t">{rot}</div>
                {f ? <button className="reflink an" onClick={() => visor.verArquivo(f, f.name)}>{f.name}</button> : <div className="muted s">Ainda não gerado.</div>}</div>
              <span className="tools">
                {f ? <><button className="btn ghost" onClick={() => visor.verArquivo(f, f.name)}>👁 Ver</button><button className="btn ghost" onClick={() => baixar(f.name, f)}>Baixar</button></>
                  : <button className="btn" disabled={!!gerando} onClick={gerar}>Gerar</button>}
                <label className="btn ghost">{f ? "Trocar pela editada" : "Anexar"}<input type="file" hidden accept={aceita} onChange={(e) => { const x = e.target.files?.[0]; e.target.value = ""; if (x) { setF(x); aviso("Arquivo anexado: " + x.name); } }} /></label>
              </span>
            </div>))}
          {enviada ? <div className="banner ok">Enviado para correção de {nome(env.revisor)}, com a petição e o cálculo anexados.</div> : <div className="triage">
            <div className="wide" style={{ fontWeight: 600 }}>Enviar para correção</div>
            <label className="f">Quem corrige<SelResp valor={env.revisor} vazio="— escolher —" excluir={eu.papel === "titular" ? [] : [eu.id]} onChange={(v) => setEnv({ ...env, revisor: v || "" })} /></label>
            <label className="f">Corrigir até<input type="date" value={env.ate} min={hojeBR()} onChange={(e) => setEnv({ ...env, ate: e.target.value })} /></label>
            <label className="f wide">Recado (opcional)<input value={env.recado} placeholder="Ex.: conferir as competências do extrato e o piso dos honorários" onChange={(e) => setEnv({ ...env, recado: e.target.value })} /></label>
            <div className="wide muted" style={{ fontSize: 12.5 }}>{podeUsarTarefa ? `Os dois arquivos vão anexados nesta tarefa (${tarefa!.descricao}).` : "Cria a tarefa “Cumprimento de sentença: corrigir a petição e o cálculo” e envia com os dois arquivos anexados."}</div>
            <div className="wide tools"><button className="btn primary" disabled={enviando || !docx || !pdf || !env.revisor} onClick={enviar}>{enviando ? "Enviando…" : "Enviar para correção"}</button>{(!docx || !pdf) && <span className="muted s">gere (ou anexe) a petição e o cálculo primeiro</span>}</div>
          </div>}
        </div></section>
    </Janela>
  );
}
