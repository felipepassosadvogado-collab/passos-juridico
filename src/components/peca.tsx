"use client";
// "Gerar petição": o Claude redige a peça a partir da publicação, do processo e dos documentos enviados,
// e o Word sai no papel timbrado do escritório.
import { avisarColchetes } from "./colchetes";
import { Cronometro } from "./carregando";
import { useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { nomeBonito } from "@/lib/formato";
import { enviarParaLeitura } from "@/lib/leitura";
import { paginasEmPdf, textoDoPdf, type TextoPdf } from "@/lib/pdftexto";
import { selecionarPaginas, textoSelecionado, type Pagina } from "@/lib/selecaoPaginas";
import { PECAS, rotuloPub } from "@/lib/regras";
import { Janela, SelResp, baixar } from "./ui";
import { useAcoesTarefa } from "./tarefas";
import { useVisor } from "./visor";
import { hojeBR, isoData, paraData, proximoDiaUtil } from "@/lib/prazos";
import type { Documento } from "@/lib/tipos";

const MAX_PAGINAS = 40; const MAX_ESCANEADAS = 10; // modo econômico das petições intermediárias

export type CtxPeca = { numero: string; publicacaoId?: number | null; tarefaId?: string | null; tipo?: string | null; orientacoes?: string };

export function JanelaPeca({ ctx, onFechar, onInicial, onCumprimento }: { ctx: CtxPeca; onFechar: () => void; onInicial?: () => void; onCumprimento?: (numero: string) => void }) {
  const { processos, caixa, tarefas, sb, eu, aviso, equipe, nome, aplicar } = useDados(); const acoes = useAcoesTarefa(); const visor = useVisor();
  const p = processos.get(ctx.numero); const pub = ctx.publicacaoId ? caixa.get(ctx.publicacaoId) : undefined;
  const tarefa = ctx.tarefaId ? tarefas.get(ctx.tarefaId) : undefined;
  /** orientações já preenchidas com o que a tarefa diz (descrição, recado da correção e providência da análise) */
  const sugestao = () => {
    if (ctx.orientacoes?.trim()) return ctx.orientacoes;
    const an = (pub?.analise || null) as { providencia?: string; resumo?: string } | null;
    return [tarefa?.descricao, tarefa?.nota_correcao ? "Recado: " + tarefa.nota_correcao : "", an?.providencia && !/^Nenhuma/i.test(an.providencia) ? "Providência: " + an.providencia : ""].filter(Boolean).join("\n");
  };
  const [tipo, setTipo] = useState(ctx.tipo && ctx.tipo !== "Outra" && ctx.tipo !== "Contato com o cliente" ? ctx.tipo : "");
  const [outro, setOutro] = useState(""); const [orient, setOrient] = useState(sugestao);
  const [files, setFiles] = useState<File[]>([]); const [gerando, setGerando] = useState(false); const [etapa, setEtapa] = useState("");
  const [res, setRes] = useState<{ nome: string; pendencias: string[]; titulo: string; tipo?: string; aviso?: string; anexada?: boolean } | null>(null);
  const [minuta, setMinuta] = useState<{ arq: File; doc: Documento | null; editada: boolean } | null>(null); const [trocando, setTrocando] = useState(false);
  // depois de gerar: a minuta já vai anexada na tarefa e dá para mandar para correção daqui mesmo
  const souTitular = eu.papel === "titular"; const titularId = equipe.find((x) => x.papel === "titular" && x.ativo && x.id !== eu.id)?.id || (souTitular ? eu.id : "");
  const [env, setEnv] = useState({ revisor: titularId, recado: "", ate: isoData(proximoDiaUtil(paraData(hojeBR()))) }); const [enviando, setEnviando] = useState(false); const [enviada, setEnviada] = useState(false);
  const podeEnviar = !!tarefa && tarefa.responsavel === eu.id && !["revisao", "feito"].includes(tarefa.status);
  const enviarCorrecao = async () => {
    if (!env.revisor) { aviso("Escolha quem vai corrigir."); return; }
    if (!minuta) return;
    setEnviando(true);
    try {
      // ligada a uma tarefa minha: a minuta já está nos anexos dela
      if (podeEnviar && minuta.doc) { if (await acoes.enviar(tarefa!, [], env.recado.trim(), env.revisor, env.ate)) setEnviada(true); return; }
      // sem tarefa: cria uma no processo e envia com a minuta anexada
      let t = podeEnviar ? tarefa! : null;
      if (!t) {
        const { data, error } = await sb.from("tarefas").insert({ processo_numero: ctx.numero, publicacao_id: ctx.publicacaoId || null, tipo: res?.tipo || null, descricao: (res?.titulo ? nomeBonito(res.titulo) : "Petição") + ": corrigir a minuta", vencimento: env.ate || null, responsavel: eu.id }).select().single();
        if (error || !data) { aviso(msgErro(error)); return; }
        aplicar("tarefas", data); t = data;
      }
      if (await acoes.enviar(t!, [minuta.arq], env.recado.trim(), env.revisor, env.ate)) setEnviada(true);
    } finally { setEnviando(false); }
  }; const [erroMsg, setErroMsg] = useState("");
  const pecas = PECAS;
  const gerar = async () => {
    const t = tipo === "outra" ? outro.trim() : tipo;
    if (!t) { aviso("Escolha a peça que o Claude vai redigir."); return; }
    setGerando(true); setErroMsg(""); setRes(null);
    try {
      // modo econômico: todo PDF vira texto aqui no navegador (texto custa 3 a 5 vezes menos que a página como imagem)
      // e vão no máximo 40 páginas: começo do processo, páginas do ato que a peça enfrenta e atos mais recentes.
      // Páginas escaneadas (sem texto) escolhidas vão como imagem, até 10. Fotos e imagens continuam indo inteiras.
      const inteiros: File[] = []; const lidos: { f: File; tx: TextoPdf }[] = [];
      for (const f of files) {
        const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
        if (!ehPdf) { inteiros.push(f); continue; }
        setEtapa("Lendo " + f.name + "…");
        try { lidos.push({ f, tx: await textoDoPdf(f, (i, n) => setEtapa(`Lendo ${f.name}: página ${i} de ${n}`)) }); }
        catch { setErroMsg(`Não consegui abrir ${f.name}. Confira se é um PDF válido (sem senha).`); return; }
      }
      const paginas: Pagina[] = lidos.flatMap(({ tx }, a) => (tx.porPagina || []).map((texto, k) => ({ arquivo: a, n: k + 1, texto })));
      const sel = selecionarPaginas(paginas, t, MAX_PAGINAS);
      const textos: TextoPdf[] = textoSelecionado(sel, lidos.map((x) => x.tx.nome));
      const escaneadas = sel.escolhidas.filter((p) => p.texto == null); let vaoImagem = 0, escFora = 0;
      for (const [a, { f }] of lidos.entries()) {
        const nums = escaneadas.filter((p) => p.arquivo === a).map((p) => p.n); if (!nums.length) continue;
        const vai = nums.slice(0, Math.max(0, MAX_ESCANEADAS - vaoImagem)); escFora += nums.length - vai.length;
        if (!vai.length) continue;
        setEtapa("Separando as páginas escaneadas de " + f.name + "…");
        try { inteiros.push(await paginasEmPdf(f, vai)); vaoImagem += vai.length; } catch { escFora += vai.length; }
      }
      const avisoEco = [sel.total > sel.escolhidas.length ? `Modo econômico: foram para o Claude ${sel.escolhidas.length} de ${sel.total} páginas (${sel.motivo}).` : "",
        escFora ? `${escFora} página(s) escaneada(s) ficaram de fora (limite de ${MAX_ESCANEADAS} como imagem).` : ""].filter(Boolean).join(" ");
      setEtapa(inteiros.length ? "Enviando os documentos…" : "");
      const arquivos = inteiros.length ? await enviarParaLeitura(sb, eu.id, inteiros) : [];
      setEtapa("O Claude está lendo e redigindo (1 a 3 minutos)…");
      const r = await fetch("/api/peticao/peca", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ numero: ctx.numero, publicacaoId: ctx.publicacaoId || null, tarefaId: ctx.tarefaId || null, tipo: t, orientacoes: orient, arquivos, textos }) });
      const j = await r.json().catch(() => ({ erro: "A resposta chegou incompleta. Tente de novo." }));
      if (!r.ok || j.erro) { setErroMsg(j.erro || "Não consegui gerar a peça agora."); return; }
      const bin = atob(j.base64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      const blob = new Blob([u], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
      baixar(j.nome, blob); avisarColchetes(blob, j.nome);
      const arq = new File([blob], j.nome, { type: blob.type }); let doc: Documento | null = null;
      if (tarefa) { setEtapa("Anexando a minuta na tarefa…"); doc = (await acoes.anexar(tarefa, [arq]))?.[0] || null; }
      const anexada = !!doc; setMinuta({ arq, doc, editada: false });
      setRes({ nome: j.nome, pendencias: j.pendencias || [], titulo: j.titulo, tipo: t, aviso: avisoEco || undefined, anexada }); setEnviada(false); aviso(anexada ? "Minuta baixada e anexada na tarefa." : "Minuta pronta e baixada. Revise no Word antes de protocolar.");
    } catch (e) { setErroMsg(/load failed|failed to fetch|network/i.test((e as Error).message) ? "A conexão caiu enquanto o Claude trabalhava. Confira a internet e tente de novo." : (e as Error).message || "Não consegui gerar a peça agora."); }
    finally { setGerando(false); setEtapa(""); }
  };
  return (
    <Janela largo onFechar={onFechar} titulo="Petição intermediária" sub={nomeBonito(p?.cliente_nome || "") + (p ? " · " + p.mascara : "")}
      acoes={<button className="btn primary" disabled={gerando} onClick={gerar}>{gerando ? <>O Claude está redigindo… <Cronometro /></> : "Gerar Word (.docx)"}</button>}>
      {onInicial && <AbasPeticao modo="intermediaria" clienteId={p?.cliente_id} numero={ctx.numero} onInicial={onInicial} onCumprimento={onCumprimento} />}
      {p && <div className="muted" style={{ fontSize: 13 }}>Dados do processo que vão para a peça: <b>Autor(a):</b> {nomeBonito(p.cliente_nome || "—")} · <b>Réus:</b> {(p.reus || []).join("; ") || "—"} · <b>Juízo:</b> {p.orgao || "—"} · <b>Processo:</b> {p.mascara}</div>}
      <div className="muted" style={{ fontSize: 13.5, maxWidth: "70ch" }}>O Claude redige a minuta a partir {pub ? "da publicação " + rotuloPub(pub) + ", " : ""}das publicações do processo e dos documentos que você anexar, no papel timbrado do escritório. O que ele não souber fica entre [colchetes] para você completar. Leva de 1 a 2 minutos.
        {" "}Já vão junto, sem precisar repetir: {ctx.tarefaId ? "a descrição da tarefa e o recado de quem a enviou, " : ""}a análise do Claude, as anotações fixas e as anotações da equipe na linha do tempo.</div>
      <div className="form2">
        <label className="f">Peça<select value={tipo} onChange={(e) => setTipo(e.target.value)}><option value="">— escolher —</option>{pecas.map((x) => <option key={x}>{x}</option>)}<option value="outra">Outra peça…</option></select></label>
        {tipo === "outra" && <label className="f">Qual peça<input value={outro} placeholder="Ex.: Petição de juntada de procuração" onChange={(e) => setOutro(e.target.value)} /></label>}
        <label className="f full">Orientações para o Claude{orient && orient === sugestao() ? <span className="muted" style={{ fontWeight: 400 }}> · trazidas da tarefa; complete com a estratégia</span> : " (opcional)"}<textarea rows={3} value={orient} placeholder="Ex.: concordar com o laudo e pedir tutela de urgência para suspender os descontos; o contrato é o nº 010016334309" onChange={(e) => setOrient(e.target.value)} /></label>
      </div>
      <section className="novo-cli">
        <div className="av-top"><strong>Documentos do processo (opcional, mas faz muita diferença)</strong><span className="muted" style={{ fontSize: 12.5 }}>laudo, sentença, contestação, ou a cópia integral do eproc — em PDF ou foto</span></div>
        <input type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(e) => { setFiles([...files, ...Array.from(e.target.files || [])].slice(0, 6)); e.target.value = ""; }} />
        {etapa && <div className="banner">{etapa}</div>}
        {files.length > 0 && <div className="anexos">{files.map((f, i) => <span key={i} className="anexo"><span className="an">{f.name}</span><button className="btn ghost" onClick={() => setFiles(files.filter((_, j) => j !== i))}>Excluir</button></span>)}</div>}
        <div className="muted" style={{ fontSize: 12.5 }}>A publicação do DJEN costuma trazer só o despacho. <b>Para economizar, anexe só o que a peça enfrenta</b> (o laudo, a sentença, a contestação), baixado do eproc. <b>Modo econômico:</b> os PDFs são lidos pelo texto e vão para o Claude no máximo {MAX_PAGINAS} páginas — o começo do processo, as páginas do ato da peça e os atos mais recentes. Páginas escaneadas (sem texto) vão como imagem, até {MAX_ESCANEADAS}.</div>
      </section>
      {erroMsg && <div className="banner erro">{erroMsg}</div>}
      {res && <div className="banner ok"><strong>{res.titulo}</strong> — o arquivo {res.nome} foi baixado.{res.aviso ? " " + res.aviso : ""}
        {res.anexada && " Também ficou anexada na tarefa."}
        {res.pendencias.length > 0 && <><div style={{ marginTop: 6 }}>Confira antes de protocolar:</div><ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{res.pendencias.map((x, i) => <li key={i}>{x}</li>)}</ul></>}</div>}
      {res && minuta && <section className="triage">
        <div className="wide" style={{ fontWeight: 600 }}>Conferir e ajustar a minuta{minuta.editada ? <span className="pill ok" style={{ marginLeft: 8 }}>versão editada</span> : null}</div>
        <div className="wide muted" style={{ fontSize: 12.5 }}>Veja a minuta ao lado sem sair daqui. Para alterar, abra o Word baixado, edite, salve e envie a versão editada: ela {minuta.doc ? "substitui a da tarefa" : "é a que vai para a correção"}.</div>
        <div className="wide tools">
          <button className="btn" onClick={() => visor.verArquivo(minuta.arq, minuta.arq.name)}>👁 Visualizar</button>
          <button className="btn ghost" onClick={() => baixar(minuta.arq.name, minuta.arq)}>Baixar de novo</button>
          {minuta.doc && <label className="btn">{trocando ? "Enviando…" : "Enviar versão editada (.docx)"}<input type="file" hidden accept=".docx" disabled={trocando} onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f || !minuta.doc) return;
            if (!/\.docx$/i.test(f.name)) { aviso("Envie o arquivo do Word (.docx)."); return; }
            setTrocando(true); const d = await acoes.substituir(minuta.doc, f); setTrocando(false);
            if (d) { setMinuta({ arq: f, doc: d, editada: true }); aviso("Versão editada salva na tarefa."); }
          }} /></label>}
          {!minuta.doc && <label className="btn">Enviar versão editada (.docx)<input type="file" hidden accept=".docx" onChange={(e) => {
            const f = e.target.files?.[0]; e.target.value = ""; if (!f) return;
            if (!/\.docx$/i.test(f.name)) { aviso("Envie o arquivo do Word (.docx)."); return; }
            setMinuta({ arq: f, doc: null, editada: true }); aviso("Versão editada anexada: é ela que vai para a correção.");
          }} /></label>}
        </div>
      </section>}
      {res && minuta && (enviada || (podeEnviar && tarefa?.status === "revisao") ? <div className="banner ok">Enviada para correção de {nome(env.revisor)}, com a minuta anexada.</div>
        : <section className="triage">
          <div className="wide" style={{ fontWeight: 600 }}>Enviar para correção</div>
          <label className="f">Quem corrige<SelResp valor={env.revisor} vazio="— escolher —" excluir={souTitular ? [] : [eu.id]} onChange={(v) => setEnv({ ...env, revisor: v || "" })} /></label>
          <label className="f">Corrigir até<input type="date" value={env.ate} min={hojeBR()} onChange={(e) => setEnv({ ...env, ate: e.target.value })} /></label>
          <label className="f wide">Recado (opcional)<input value={env.recado} placeholder="Ex.: conferir o pedido de reinclusão do INSS" onChange={(e) => setEnv({ ...env, recado: e.target.value })} /></label>
          <div className="wide muted" style={{ fontSize: 12.5 }}>Vai {minuta.editada ? "a versão editada" : "a minuta gerada"}{podeEnviar ? ", que já está nos anexos da tarefa." : `. ${tarefa ? "Esta tarefa é de " + nome(tarefa.responsavel) + ", então" : "Como a petição não está ligada a uma tarefa,"} cria a tarefa “${res.titulo ? nomeBonito(res.titulo) : "Petição"}: corrigir a minuta” no processo, já com a minuta anexada.`}</div>
          <div className="wide tools"><button className="btn primary" disabled={enviando || !env.revisor} onClick={enviarCorrecao}>{enviando ? "Enviando…" : "Enviar para correção"}</button></div>
        </section>)}
    </Janela>
  );
}

/** alternância no topo da janela de petição: inicial (modelo do escritório) ou intermediária (o Claude redige no processo) */
export function AbasPeticao({ modo, clienteId, numero, onInicial, onIntermediaria, onCumprimento }: {
  modo: "inicial" | "intermediaria" | "cumprimento"; clienteId: string | null | undefined; numero?: string | null;
  onInicial?: () => void; onIntermediaria?: (numero: string) => void; onCumprimento?: (numero: string) => void;
}) {
  const { processos, aviso } = useDados(); const [escolher, setEscolher] = useState(false);
  const doCliente = [...processos.values()].filter((p) => clienteId && p.cliente_id === clienteId);
  const [destino, setDestino] = useState<"intermediaria" | "cumprimento">("intermediaria");
  const ir = (alvo: "intermediaria" | "cumprimento") => {
    const f = alvo === "intermediaria" ? onIntermediaria : onCumprimento;
    if (modo === alvo || !f) return;
    if (numero && processos.get(numero)) { f(numero); return; }
    if (doCliente.length === 1) { f(doCliente[0].numero); return; }
    if (!doCliente.length) { aviso("Este cliente ainda não tem processo judicial cadastrado. Esta petição precisa do processo."); return; }
    setDestino(alvo); setEscolher(true);
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="seg" role="tablist" aria-label="Tipo de petição" style={{ alignSelf: "flex-start" }}>
        <button role="tab" aria-selected={modo === "inicial"} onClick={() => modo !== "inicial" && onInicial?.()}>Petição inicial</button>
        <button role="tab" aria-selected={modo === "intermediaria"} onClick={() => ir("intermediaria")}>Petição intermediária</button>
        <button role="tab" aria-selected={modo === "cumprimento"} onClick={() => ir("cumprimento")}>Cumprimento de sentença</button>
      </div>
      {escolher && <div className="banner" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span>Em qual processo?</span>
        <div className="tools">{doCliente.map((p) => <button key={p.numero} className="btn" onClick={() => (destino === "cumprimento" ? onCumprimento : onIntermediaria)?.(p.numero)}>{p.mascara}{p.banco ? " · x " + p.banco.split(/\s/)[0] : ""}</button>)}</div>
      </div>}
    </div>
  );
}
