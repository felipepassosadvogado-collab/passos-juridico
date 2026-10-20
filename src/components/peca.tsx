"use client";
// "Gerar petição": o Claude redige a peça a partir da publicação, do processo e dos documentos enviados,
// e o Word sai no papel timbrado do escritório.
import { useState } from "react";
import { useDados } from "@/lib/dados";
import { nomeBonito } from "@/lib/formato";
import { enviarParaLeitura } from "@/lib/leitura";
import { LIMITE_VISUAL, contarPaginas, textoDoPdf, type TextoPdf } from "@/lib/pdftexto";
import { TAREFAS, rotuloPub } from "@/lib/regras";
import { Janela, baixar } from "./ui";

export type CtxPeca = { numero: string; publicacaoId?: number | null; tarefaId?: string | null; tipo?: string | null; orientacoes?: string };

export function JanelaPeca({ ctx, onFechar }: { ctx: CtxPeca; onFechar: () => void }) {
  const { processos, caixa, tarefas, sb, eu, aviso } = useDados();
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
  const [res, setRes] = useState<{ nome: string; pendencias: string[]; titulo: string; aviso?: string } | null>(null); const [erroMsg, setErroMsg] = useState("");
  const pecas = TAREFAS.filter((t) => !["Contato com o cliente", "Audiência", "Outra"].includes(t));
  const gerar = async () => {
    const t = tipo === "outra" ? outro.trim() : tipo;
    if (!t) { aviso("Escolha a peça que o Claude vai redigir."); return; }
    setGerando(true); setErroMsg(""); setRes(null);
    try {
      // PDFs grandes (cópia integral) viram texto aqui no navegador; os pequenos vão inteiros
      const inteiros: File[] = []; const textos: TextoPdf[] = [];
      for (const f of files) {
        const ehPdf = f.type === "application/pdf" || /\.pdf$/i.test(f.name);
        let grande = ehPdf && f.size > LIMITE_VISUAL.bytes;
        if (ehPdf && !grande) { setEtapa("Abrindo " + f.name + "…"); try { grande = (await contarPaginas(f)) > LIMITE_VISUAL.paginas; } catch { grande = false; } }
        if (!grande) { inteiros.push(f); continue; }
        setEtapa("Lendo " + f.name + "…");
        let tx: TextoPdf;
        try { tx = await textoDoPdf(f, (i, n) => setEtapa(`Lendo ${f.name}: página ${i} de ${n}`)); }
        catch { setErroMsg(`Não consegui abrir ${f.name}. Confira se é um PDF válido (sem senha).`); return; }
        if (tx.semTexto.length >= tx.paginas * 0.9) { setErroMsg(`${f.name} parece escaneado (páginas só com imagem). Envie em separado as páginas que importam (laudo, sentença), em PDFs menores.`); return; }
        textos.push(tx);
      }
      setEtapa(inteiros.length ? "Enviando os documentos…" : "");
      const arquivos = inteiros.length ? await enviarParaLeitura(sb, eu.id, inteiros) : [];
      setEtapa("O Claude está lendo e redigindo (1 a 3 minutos)…");
      const r = await fetch("/api/peticao/peca", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ numero: ctx.numero, publicacaoId: ctx.publicacaoId || null, tarefaId: ctx.tarefaId || null, tipo: t, orientacoes: orient, arquivos, textos }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErroMsg(j.erro || "Não consegui gerar a peça agora."); return; }
      const bin = atob(j.base64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      baixar(j.nome, new Blob([u], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
      setRes({ nome: j.nome, pendencias: j.pendencias || [], titulo: j.titulo, aviso: textos.filter((x) => x.semTexto.length).map((x) => `Em ${x.nome}, ${x.semTexto.length} de ${x.paginas} páginas eram só imagem e não foram lidas.`).join(" ") || undefined }); aviso("Minuta pronta e baixada. Revise no Word antes de protocolar.");
    } catch (e) { setErroMsg((e as Error).message || "Não consegui gerar a peça agora."); }
    finally { setGerando(false); setEtapa(""); }
  };
  return (
    <Janela largo onFechar={onFechar} titulo="Gerar petição" sub={nomeBonito(p?.cliente_nome || "") + (p ? " · " + p.mascara : "")}
      acoes={<button className="btn primary" disabled={gerando} onClick={gerar}>{gerando ? "O Claude está redigindo…" : "Gerar Word (.docx)"}</button>}>
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
        <div className="muted" style={{ fontSize: 12.5 }}>A publicação do DJEN costuma trazer só o despacho. Anexe o laudo ou a sentença baixados do eproc, ou a cópia integral do processo: PDFs grandes (mais de 80 páginas ou 12 MB) são lidos só pelo texto, então páginas escaneadas como imagem não entram. Em processos muito longos, o meio pode ser resumido, e o começo e os atos mais recentes têm prioridade.</div>
      </section>
      {erroMsg && <div className="banner erro">{erroMsg}</div>}
      {res && <div className="banner ok"><strong>{res.titulo}</strong> — o arquivo {res.nome} foi baixado.{res.aviso ? " " + res.aviso : ""}
        {res.pendencias.length > 0 && <><div style={{ marginTop: 6 }}>Confira antes de protocolar:</div><ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{res.pendencias.map((x, i) => <li key={i}>{x}</li>)}</ul></>}</div>}
    </Janela>
  );
}
