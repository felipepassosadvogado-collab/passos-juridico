"use client";
// Roteiro de funções da equipe: abre sozinho no primeiro acesso do dia (para quem não é titular), fica no botão da
// barra de cima para abrir quando quiser, baixa em PDF e o titular edita o texto aqui mesmo.
import { useEffect, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { hojeBR } from "@/lib/prazos";
import { FUNCOES_PADRAO, chaveVisto, deveAbrirHoje, type Funcoes } from "@/lib/funcoes";
import { ConteudoFuncoes } from "@/components/funcoesConteudo";
import { CaixaCompacta } from "@/components/novos";
import { baixar } from "@/components/ui";

export function useFuncoes(): Funcoes {
  const { config } = useDados(); const f = config.funcoes_equipe as Funcoes | undefined;
  return f?.texto ? f : FUNCOES_PADRAO;
}

export function CaixaFuncoes() {
  const { eu, titular, sb, aviso, aplicarConfig, carregou } = useDados(); const f = useFuncoes();
  const [aberta, setAberta] = useState(false); const [editando, setEditando] = useState<Funcoes | null>(null); const [salvando, setSalvando] = useState(false);
  // primeiro acesso do dia: abre sozinha (quem não é titular)
  useEffect(() => {
    if (!carregou || !eu?.id) return;
    let visto: string | null = null; try { visto = localStorage.getItem(chaveVisto(eu.id)); } catch { /* sem armazenamento */ }
    if (deveAbrirHoje(visto, hojeBR(), titular)) setAberta(true);
  }, [carregou, eu?.id, titular]);
  const fechar = () => { setAberta(false); setEditando(null); try { localStorage.setItem(chaveVisto(eu.id), hojeBR()); } catch { /* sem armazenamento */ } };
  const pdf = async () => {
    const { pdfFuncoes } = await import("@/lib/funcoesPdf");
    const logo = await fetch("/marca/fp.png").then((r) => r.ok ? r.arrayBuffer() : null).catch(() => null);
    const b = await pdfFuncoes(f, logo ? new Uint8Array(logo) : null);
    baixar(f.titulo.replace(/[\\/:*?"<>|]/g, "-") + ".pdf", new Blob([b as BlobPart], { type: "application/pdf" }), "application/pdf");
  };
  const salvar = async () => {
    if (!editando) return; setSalvando(true);
    const valor: Funcoes = { titulo: editando.titulo.trim() || FUNCOES_PADRAO.titulo, texto: editando.texto, atualizado_em: new Date().toISOString(), atualizado_por: eu.id };
    const { error } = await sb.from("config").upsert({ chave: "funcoes_equipe", valor }, { onConflict: "chave" });
    setSalvando(false);
    if (error) { aviso(msgErro(error)); return; }
    aplicarConfig("funcoes_equipe", valor); setEditando(null); aviso("Roteiro salvo. A equipe vê o texto novo no próximo acesso.");
  };
  return <>
    <button className="icb" onClick={() => setAberta(true)} title="Roteiro de funções da equipe" aria-label="Roteiro de funções da equipe">
      <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="4" y="3" width="12" height="15" rx="2" /><path d="M7.5 3V2h5v1M7 8h6M7 11h6M7 14h4" /></svg>
    </button>
    {aberta && <CaixaCompacta titulo={editando ? "Editar o roteiro de funções" : f.titulo} onFechar={fechar}
      rodape={editando ? <>
        <button className="btn ghost" onClick={() => setEditando({ ...FUNCOES_PADRAO })} title="Volta ao texto padrão (só salva se clicar em Salvar)">Texto padrão</button>
        <button className="btn ghost" style={{ marginLeft: "auto" }} onClick={() => setEditando(null)}>Cancelar</button>
        <button className="btn primary" disabled={salvando} onClick={salvar}>{salvando ? "Salvando…" : "Salvar"}</button></> : <>
        <button className="btn ghost" onClick={pdf}>Baixar PDF</button>
        {titular && <button className="btn ghost" onClick={() => setEditando({ ...f })}>Editar</button>}
        <button className="btn primary" style={{ marginLeft: "auto" }} onClick={fechar}>Entendi, bom trabalho!</button></>}>
      {editando ? <div className="fn-edita">
        <label>Título<input value={editando.titulo} onChange={(e) => setEditando({ ...editando, titulo: e.target.value })} /></label>
        <label>Texto <span className="muted s">— “# ” começa uma seção, “- ” um item, “&gt; ” um destaque</span>
          <textarea rows={22} value={editando.texto} onChange={(e) => setEditando({ ...editando, texto: e.target.value })} /></label>
      </div> : <>
        <div className="muted s" style={{ marginBottom: 8 }}>Aparece no primeiro acesso de cada dia. Clique nos títulos para abrir ou fechar cada parte.{f.atualizado_em ? " Atualizado em " + new Date(f.atualizado_em).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) + "." : ""}</div>
        <ConteudoFuncoes f={f} />
      </>}
    </CaixaCompacta>}
  </>;
}
