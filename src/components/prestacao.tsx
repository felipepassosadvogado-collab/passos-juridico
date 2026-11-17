"use client";
// Prestação de contas ao cliente: o Claude lê os autos (alvarás, RPV, depósitos, empréstimo creditado/compensado),
// a pessoa confere os valores, o sistema calcula os honorários (30% sobre o proveito econômico; sucumbência fora da
// base), gera o PDF no papel do escritório, guarda na pasta do cliente e lança os honorários no Financeiro.
import { useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { moeda, nomeBonito, numeroBR } from "@/lib/formato";
import { enviarParaLeitura } from "@/lib/leitura";
import { LIMITE_VISUAL, contarPaginas, textoDoPdf, type TextoPdf } from "@/lib/pdftexto";
import { calcularPrestacao, lancamentosDaPrestacao } from "@/lib/prestacao";
import { hojeBR } from "@/lib/prazos";
import { Janela, baixar } from "./ui";
import { AbasPeticao } from "./peca";
import { Cronometro } from "./carregando";

export type CtxPrestacao = { numero: string; tarefaId?: string | null };
type Linha = { descricao: string; valor: string; data?: string; sucumbencia?: boolean };
const n2 = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : typeof v === "string" ? numeroBR(v) : 0);
const brl = (v: number) => "R$ " + moeda(v);

export function JanelaPrestacao({ ctx, onFechar, onInicial, onIntermediaria, onCumprimento }: { ctx: CtxPrestacao; onFechar: () => void; onInicial?: () => void; onIntermediaria?: (n: string) => void; onCumprimento?: (n: string) => void }) {
  const { processos, clientes, sb, eu, titular, aviso, aplicar, registrar } = useDados();
  const [jaLancado, setJaLancado] = useState(0); const [relancar, setRelancar] = useState(false);
  const p = processos.get(ctx.numero); const cli = p?.cliente_id ? clientes.get(p.cliente_id) : undefined;
  const banco = (p?.reus || []).find((r) => !/INSS|Instituto Nacional/i.test(r)) || p?.banco || "";
  const [files, setFiles] = useState<File[]>([]); const [orient, setOrient] = useState(""); const [etapa, setEtapa] = useState(""); const [lendo, setLendo] = useState(false); const [erroMsg, setErroMsg] = useState("");
  const [creditos, setCreditos] = useState<Linha[]>([{ descricao: "", valor: "" }]);
  const [emp, setEmp] = useState({ valor: "", descricao: "" }); const [pct, setPct] = useState("30");
  const [despesas, setDespesas] = useState<Linha[]>([]); const [resumo, setResumo] = useState(""); const [alertas, setAlertas] = useState<string[]>([]);
  const [gerando, setGerando] = useState(false); const [lido, setLido] = useState(false);
  if (!p) return <Janela onFechar={onFechar} titulo="Prestação de contas"><div className="empty">Processo não encontrado.</div></Janela>;
  const nomeCli = nomeBonito(cli?.nome || p.cliente_nome || "");
  const dados = { creditos: creditos.filter((c) => n2(c.valor) > 0).map((c) => ({ descricao: c.descricao || "Crédito no processo", valor: n2(c.valor), data: c.data || null, sucumbencia: !!c.sucumbencia })),
    emprestimo: n2(emp.valor), emprestimoDescricao: emp.descricao, pct: n2(pct), despesas: despesas.filter((d) => n2(d.valor) > 0).map((d) => ({ descricao: d.descricao || "Despesa", valor: n2(d.valor) })) };
  const r = calcularPrestacao(dados);

  const ler = async () => {
    if (!files.length) { aviso("Anexe os alvarás/comprovantes ou a cópia do processo (PDF)."); return; }
    setLendo(true); setErroMsg("");
    try {
      const inteiros: File[] = []; const textos: TextoPdf[] = [];
      for (const f of files) {
        const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
        let grande = ehPdf && f.size > LIMITE_VISUAL.bytes;
        if (ehPdf && !grande) { try { grande = (await contarPaginas(f)) > LIMITE_VISUAL.paginas; } catch { grande = false; } }
        if (!grande) { inteiros.push(f); continue; }
        let tx: TextoPdf;
        try { tx = await textoDoPdf(f, (i, n) => setEtapa(`Lendo ${f.name}: página ${i} de ${n}`)); } catch { setErroMsg(`Não consegui abrir ${f.name}. Confira se é um PDF válido (sem senha).`); return; }
        textos.push(tx);
      }
      setEtapa(inteiros.length ? "Enviando os documentos…" : "");
      const arquivos = inteiros.length ? await enviarParaLeitura(sb, eu.id, inteiros) : [];
      setEtapa("O Claude está lendo os valores pagos no processo…");
      const res = await fetch("/api/peticao/prestacao/ler", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ numero: ctx.numero, arquivos, textos, orientacoes: orient }) });
      const j = await res.text().then((t) => JSON.parse(t.trim() || "{}")).catch(() => ({ erro: "A resposta chegou incompleta. Tente de novo." }));
      if (!res.ok || j.erro) { setErroMsg(j.erro || "Não consegui ler agora."); return; }
      const d = j.dados || {};
      const cs = (Array.isArray(d.creditos) ? d.creditos : []).map((c: Record<string, unknown>) => ({ descricao: String(c.descricao || ""), valor: moeda(n2(c.valor)), data: typeof c.data === "string" ? c.data : "", sucumbencia: !!c.sucumbencia }));
      if (cs.length) setCreditos(cs);
      if (d.emprestimo) setEmp({ valor: n2(d.emprestimo.valor) ? moeda(n2(d.emprestimo.valor)) : "", descricao: String(d.emprestimo.descricao || "") });
      if (n2(d.pct) > 0) setPct(String(n2(d.pct)).replace(".", ","));
      setDespesas((Array.isArray(d.despesas) ? d.despesas : []).map((x: Record<string, unknown>) => ({ descricao: String(x.descricao || ""), valor: moeda(n2(x.valor)) })));
      setResumo(String(d.resumo || "")); setAlertas(Array.isArray(d.alertas) ? d.alertas.map(String) : []); setLido(true);
      aviso("Valores lidos. Confira cada um antes de gerar.");
    } catch (e) { setErroMsg((e as Error).message); }
    finally { setLendo(false); setEtapa(""); }
  };

  const gerar = async () => {
    if (!dados.creditos.length) { aviso("Informe ao menos um valor recebido no processo."); return; }
    setGerando(true);
    try {
      const hoje = hojeBR();
      const { pdfPrestacao } = await import("@/lib/prestacaoPdf");
      const bytes = await pdfPrestacao({ dados, r, cliente: nomeCli, cpf: cli?.cpf || "", processo: p.mascara, orgao: p.orgao || "", reu: nomeBonito(banco), resumo });
      const nomeArq = `Prestacao_de_contas_-_${nomeCli.replace(/\s+/g, "_")}.pdf`;
      const blob = new Blob([bytes as BlobPart], { type: "application/pdf" }); baixar(nomeArq, blob, "application/pdf");
      // guarda na pasta do cliente (para anexar no aviso pelo WhatsApp)
      let caminho = "";
      if (cli) {
        caminho = `clientes/${cli.id}/${Date.now().toString(36)}-${nomeArq}`;
        const up = await sb.storage.from("documentos").upload(caminho, blob, { contentType: "application/pdf" });
        if (up.error) caminho = "";
        else { const rd = await sb.from("documentos").insert({ cliente_id: cli.id, tipo: "Prestação de contas", nome: nomeArq, caminho, tamanho: blob.size, mime: "application/pdf" }).select().single(); if (rd.data) aplicar("anexos", rd.data); }
      }
      registrar({ processo_numero: p.numero, tipo: "comentario", dados: { texto: `Prestação de contas gerada: recebido ${brl(r.liquidoCliente)}, honorários contratuais ${brl(r.honorarios)} (${pct}% sobre ${brl(r.base)}), ${r.aDevolver ? "cliente deve " + brl(r.aDevolver) : "repasse ao cliente " + brl(r.repasse)}.` } });
      // lança no Financeiro (só o titular; se já houver lançamento desta prestação, pergunta antes)
      if (!titular) { aviso("Prestação gerada e guardada na pasta do cliente. O lançamento no Financeiro é feito pelo titular."); return; }
      const ls = lancamentosDaPrestacao(r, n2(pct), nomeCli, hoje);
      const ja = await sb.from("financeiro").select("id,valor").eq("processo_numero", p.numero).eq("origem", "prestacao");
      if (ja.error) { aviso("Prestação gerada. Não lancei no Financeiro: " + (/financeiro/.test(ja.error.message) ? "falta rodar a etapa 0028 no Supabase." : msgErro(ja.error))); return; }
      if (ja.data?.length && !relancar) { setJaLancado(ja.data.length); aviso(`Prestação gerada. Este processo já tem ${ja.data.length} lançamento(s) de prestação no Financeiro, então não lancei de novo. Para lançar mesmo assim, marque “Lançar de novo” e gere outra vez.`); return; }
      const ins = await sb.from("financeiro").insert(ls.map((x) => ({ ...x, processo_numero: p.numero, cliente_id: cli?.id || null, origem: "prestacao", documento_caminho: caminho || null }))).select();
      if (ins.error) { aviso("Prestação gerada, mas não lancei no Financeiro: " + msgErro(ins.error)); return; }
      setRelancar(false); setJaLancado(0);
      aviso(`Prestação gerada e guardada na pasta do cliente. Lancei no Financeiro: ${ls.map((x) => `${x.categoria.toLowerCase()} ${brl(x.valor)}${x.status === "previsto" ? " (a receber)" : ""}`).join(" e ")}.`);
    } catch (e) { aviso("Não consegui gerar: " + ((e as Error).message || "erro")); }
    finally { setGerando(false); }
  };

  const linhaEd = (l: Linha[], set: (x: Linha[]) => void, i: number, comSuc: boolean) => (
    <div key={i} className="pc-linha">
      <input aria-label="Descrição" placeholder={comSuc ? "Ex.: Alvará — depósito do banco (evento 98)" : "Ex.: Honorários periciais"} value={l[i].descricao} onChange={(e) => set(l.map((x, k) => k === i ? { ...x, descricao: e.target.value } : x))} />
      <input aria-label="Valor (R$)" inputMode="decimal" placeholder="0,00" value={l[i].valor} onChange={(e) => set(l.map((x, k) => k === i ? { ...x, valor: e.target.value } : x))} />
      {comSuc && <label className="chk" title="Honorários de sucumbência pagos pela parte contrária: são do advogado e não entram na base dos 30%"><input type="checkbox" checked={!!l[i].sucumbencia} onChange={(e) => set(l.map((x, k) => k === i ? { ...x, sucumbencia: e.target.checked } : x))} />sucumbência</label>}
      <button className="icb" aria-label="Tirar esta linha" onClick={() => set(l.filter((_, k) => k !== i))}><span aria-hidden="true">✕</span></button>
    </div>);

  return (
    <Janela largo onFechar={onFechar} titulo="Prestação de contas" sub={`${nomeCli} · ${p.mascara} · x ${nomeBonito(banco)}`}
      acoes={<button className="btn primary" disabled={gerando || !dados.creditos.length} onClick={gerar}>{gerando ? "Gerando…" : "Gerar prestação de contas (PDF)"}</button>}>
      {(onInicial || onIntermediaria || onCumprimento) && <AbasPeticao modo="prestacao" clienteId={p.cliente_id} numero={ctx.numero} onInicial={onInicial} onIntermediaria={onIntermediaria} onCumprimento={onCumprimento} />}
      <section className="panel"><div className="ph"><h3>1. Ler os valores pagos</h3><span className="muted" style={{ fontSize: 12.5 }}>alvarás, RPV, depósitos, empréstimo creditado ou compensado (opcional: dá para preencher à mão)</span></div>
        <div className="pb" style={{ display: "grid", gap: 8 }}>
          <input type="file" multiple accept="application/pdf,image/*" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          <textarea rows={2} placeholder="Orientações ao Claude (opcional). Ex.: o alvará do evento 120 foi só da sucumbência; o empréstimo de R$ 4.300,00 foi compensado na sentença" value={orient} onChange={(e) => setOrient(e.target.value)} />
          <div className="tools"><button className="btn" disabled={lendo || !files.length} onClick={ler}>{lendo ? <>Lendo… <Cronometro /></> : "★ Ler com o Claude"}</button>{etapa && <span className="muted s">{etapa}</span>}</div>
          {erroMsg && <div className="banner erro" role="alert">{erroMsg}</div>}
          {alertas.length > 0 && <div className="banner"><b>Conferir:</b><ul style={{ margin: "4px 0 0 18px" }}>{alertas.map((a, i) => <li key={i}>{a}</li>)}</ul></div>}
        </div></section>
      <section className="panel"><div className="ph"><h3>2. Conferir os valores</h3>{lido && <span className="muted" style={{ fontSize: 12.5 }}>lidos pelo Claude: confira um por um</span>}</div>
        <div className="pb" style={{ display: "grid", gap: 10 }}>
          <div><b>Valores recebidos no processo</b>{creditos.map((_, i) => linhaEd(creditos, setCreditos, i, true))}<button className="reflink" onClick={() => setCreditos([...creditos, { descricao: "", valor: "" }])}>+ outro valor</button></div>
          <div className="pc-grade">
            <label className="f">Empréstimo creditado na conta / compensado (R$)<input inputMode="decimal" placeholder="0,00" value={emp.valor} onChange={(e) => setEmp({ ...emp, valor: e.target.value })} /></label>
            <label className="f">De onde vem esse valor<input placeholder="Ex.: contrato nº 0123 creditado em 05/2021 e compensado na sentença" value={emp.descricao} onChange={(e) => setEmp({ ...emp, descricao: e.target.value })} /></label>
            <label className="f">Honorários contratuais (%)<input inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} /></label>
          </div>
          <div><b>Despesas descontadas do cliente</b> <span className="muted s">(adiantadas pelo escritório: perícia, custas…)</span>{despesas.map((_, i) => linhaEd(despesas, setDespesas, i, false))}<button className="reflink" onClick={() => setDespesas([...despesas, { descricao: "", valor: "" }])}>+ despesa</button></div>
          <label className="f">Resumo do processo (abre o documento)<textarea rows={2} value={resumo} onChange={(e) => setResumo(e.target.value)} placeholder="Ex.: a sentença declarou nulo o contrato e condenou o banco a devolver em dobro e a pagar danos morais; os valores foram depositados e levantados." /></label>
        </div></section>
      <section className="panel"><div className="ph"><h3>3. Resultado</h3></div>
        <div className="pb pc-res">
          <div><span>Recebido para o cliente</span><b>{brl(r.liquidoCliente)}</b></div>
          <div><span>+ Empréstimo creditado/compensado</span><b>{brl(dados.emprestimo)}</b></div>
          <div className="t"><span>= Proveito econômico (base)</span><b>{brl(r.base)}</b></div>
          <div><span>Honorários contratuais ({pct}%)</span><b>− {brl(r.honorarios)}</b></div>
          {r.despesas > 0 && <div><span>Despesas</span><b>− {brl(r.despesas)}</b></div>}
          <div className={"t fim" + (r.aDevolver ? " late" : "")}><span>{r.aDevolver ? "Cliente deve ao escritório" : "Repasse ao cliente"}</span><b>{brl(r.aDevolver || r.repasse)}</b></div>
          {r.sucumbencia > 0 && <div className="muted"><span>Honorários de sucumbência (do advogado, fora da base)</span><b>{brl(r.sucumbencia)}</b></div>}
          {jaLancado > 0 && <label className="chk" style={{ gridColumn: "1 / -1" }}><input type="checkbox" checked={relancar} onChange={(e) => setRelancar(e.target.checked)} />Lançar de novo no Financeiro (já há {jaLancado} lançamento(s) de prestação deste processo)</label>}
          <div className="muted s" style={{ gridColumn: "1 / -1" }}>Ao gerar: baixa o PDF, guarda na pasta do cliente (para anexar no aviso pelo WhatsApp){titular ? " e lança no Financeiro os honorários recebidos" : ""}.</div>
        </div></section>
    </Janela>
  );
}
