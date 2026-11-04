"use client";
// Edição das colunas do CRM (só o titular) e revisão dos atendimentos que já viraram processo.
import { useMemo, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { gravadosDaFase, faseCRM } from "@/lib/regras";
import { mascaraCnj } from "@/lib/cnj";
import { bancoCurto, dataBR, nomeBonito } from "@/lib/formato";
import {
  A_CLASSIFICAR, adicionarColuna, colunasCrm, etapasDe, excluirColuna, fasesDe, moverColuna, processosDoCaso, renomearColuna, validarNome,
  type ColunasCrm, type Quadro,
} from "@/lib/colunasCrm";
import type { Caso, Processo } from "@/lib/tipos";
import { Janela, useConfirmar } from "./ui";
import { useProtocoloDireto } from "./novos";

/** colunas em uso no escritório (as do titular ou as padrão) */
export function useColunas() {
  const { config } = useDados();
  return useMemo(() => { const c = colunasCrm(config); return { ...c, etapas: etapasDe(c), fases: fasesDe(c) }; }, [config]);
}

/** quantos cartões estão em cada coluna (pré: atendimentos ainda sem processo; judicial: processos pela fase) */
function useContagem(quadro: Quadro) {
  const { casos, processos, v } = useDados(); const cols = useColunas();
  return useMemo(() => {
    const n: Record<string, number> = {};
    if (quadro === "pre") { const nomes = new Set(cols.pre.map((c) => c.nome)); for (const c of casos.values()) if (!c.processo_numero) { const k = nomes.has(c.etapa) ? c.etapa : cols.pre[0]?.nome; if (k) n[k] = (n[k] || 0) + 1; } }
    else for (const p of processos.values()) { const f = faseCRM(p.fase); n[f] = (n[f] || 0) + 1; }
    return n;
  }, [quadro, casos, processos, cols, v]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** criar (sem `nome`) ou editar uma coluna: nome, descrição, posição e exclusão (levando os cartões para outra coluna) */
export function JanelaColuna({ quadro, nome, depoisDe, onFechar }: { quadro: Quadro; nome?: string; depoisDe?: string; onFechar: () => void }) {
  const { sb, aviso, aplicar, aplicarConfig } = useDados(); const todas = useColunas(); const cols = todas[quadro]; const confirmar = useConfirmar();
  const atual = nome ? cols.find((c) => c.nome === nome) : undefined; const novo = !nome;
  const [ed, setEd] = useState({ nome: atual?.nome || "", dica: atual?.dica || "" });
  const outras = cols.filter((c) => c.nome !== nome);
  const [destino, setDestino] = useState(quadro === "judicial" ? "" : outras[0]?.nome || "");
  const [ocupado, setOcupado] = useState(false);
  const qtd = useContagem(quadro)[nome || "\u0000"] || 0;
  const rotulo = quadro === "pre" ? "atendimento(s)" : "processo(s)";
  if (nome && !atual) return <Janela onFechar={onFechar} titulo="Coluna"><div className="empty">Essa coluna não existe mais.</div></Janela>;

  const gravar = async (novas: ColunasCrm) => {
    const { error } = await sb.from("config").upsert({ chave: "crm_colunas", valor: novas }, { onConflict: "chave" });
    if (error) { aviso(/row-level|permission|policy/i.test(error.message) ? "Só o titular pode mudar as colunas do CRM." : msgErro(error)); return false; }
    aplicarConfig("crm_colunas", novas); return true;
  };
  const semExtras = (): ColunasCrm => ({ pre: todas.pre, judicial: todas.judicial });
  /** leva os cartões de uma coluna para outra no banco (renomear ou excluir) */
  const levar = async (de: string, para: string) => {
    if (quadro === "pre") {
      const { data, error } = await sb.from("casos").update({ etapa: para }).eq("etapa", de).select();
      if (error) { aviso(msgErro(error)); return false; } for (const x of data || []) aplicar("casos", x);
    } else {
      const { data, error } = await sb.from("processos").update({ fase: para || null }).in("fase", gravadosDaFase(de)).select();
      if (error) { aviso(msgErro(error)); return false; } for (const x of data || []) aplicar("processos", x);
    }
    return true;
  };
  const salvar = async () => {
    const erro = validarNome(quadro, cols, ed.nome, nome); if (erro) { aviso(erro); return; }
    setOcupado(true);
    try {
      if (novo) { if (await gravar({ ...semExtras(), [quadro]: adicionarColuna(cols, ed.nome, ed.dica, depoisDe) })) { aviso("Coluna criada."); onFechar(); } return; }
      const nn = ed.nome.trim();
      if (nn !== nome && !(await levar(nome!, nn))) return;
      if (await gravar({ ...semExtras(), [quadro]: renomearColuna(cols, nome!, nn, ed.dica) })) { aviso(nn !== nome ? `Coluna renomeada; ${qtd} ${rotulo} acompanharam.` : "Coluna salva."); onFechar(); }
    } finally { setOcupado(false); }
  };
  const posicao = async (passo: -1 | 1) => { setOcupado(true); try { await gravar({ ...semExtras(), [quadro]: moverColuna(cols, nome!, passo) }); } finally { setOcupado(false); } };
  const excluir = async () => {
    if (cols.length <= 1) { aviso("O quadro precisa de ao menos uma coluna."); return; }
    const para = quadro === "judicial" && !destino ? A_CLASSIFICAR : destino;
    if (!confirmar("col" + nome, aviso, `Clique de novo em “Excluir coluna” para confirmar.${qtd ? ` Os ${qtd} ${rotulo} dela vão para “${para}”.` : ""}`)) return;
    setOcupado(true);
    try {
      if (qtd && !(await levar(nome!, destino))) return;
      if (await gravar({ ...semExtras(), [quadro]: excluirColuna(cols, nome!) })) { aviso("Coluna excluída."); onFechar(); }
    } finally { setOcupado(false); }
  };
  const i = cols.findIndex((c) => c.nome === nome);
  return (
    <Janela onFechar={onFechar} titulo={novo ? "Nova coluna" : "Editar coluna"} sub={(quadro === "pre" ? "Quadro pré-processual" : "Quadro judicial") + (novo ? "" : ` · ${qtd} ${rotulo} nela`)}>
      <div className="form2">
        <label className="f full">Nome da coluna<input autoFocus value={ed.nome} maxLength={40} onChange={(e) => setEd({ ...ed, nome: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") salvar(); }} /></label>
        <label className="f full">Descrição (aparece embaixo do nome)<input value={ed.dica} maxLength={90} placeholder="Ex.: Aguardando documentos do cliente" onChange={(e) => setEd({ ...ed, dica: e.target.value })} /></label>
      </div>
      {!novo && ed.nome.trim() && ed.nome.trim() !== nome && qtd > 0 && <div className="banner">Os {qtd} {rotulo} desta coluna passam a ficar em “{ed.nome.trim()}”.</div>}
      <div className="tools">
        <button className="btn primary" disabled={ocupado} onClick={salvar}>{novo ? "Criar coluna" : "Salvar"}</button>
        {!novo && <><button className="btn ghost" disabled={ocupado || i <= 0} onClick={() => posicao(-1)} title="Levar a coluna uma posição para a esquerda">← Mover para a esquerda</button>
          <button className="btn ghost" disabled={ocupado || i >= cols.length - 1} onClick={() => posicao(1)} title="Levar a coluna uma posição para a direita">Mover para a direita →</button></>}
      </div>
      {!novo && <section className="panel" style={{ padding: "12px 16px" }}>
        <h3 style={{ marginTop: 0 }}>Excluir coluna</h3>
        {qtd > 0 ? <label className="f">Os {qtd} {rotulo} desta coluna vão para<select value={destino} onChange={(e) => setDestino(e.target.value)}>
          {quadro === "judicial" && <option value="">{A_CLASSIFICAR}</option>}
          {outras.map((c) => <option key={c.nome} value={c.nome}>{c.nome}</option>)}</select></label>
          : <div className="muted" style={{ fontSize: 13 }}>A coluna está vazia.</div>}
        <div className="tools" style={{ marginTop: 8 }}><button className="btn ghost" disabled={ocupado || cols.length <= 1} onClick={excluir}>Excluir coluna</button></div>
      </section>}
    </Janela>
  );
}

/** atendimentos ainda no pré-processual que já têm processo cadastrado para o mesmo cliente e banco */
export function useAtendimentosComProcesso() {
  const { casos, processos, v } = useDados();
  return useMemo(() => {
    const ps = [...processos.values()]; const ligados = new Set([...casos.values()].map((c) => c.processo_numero).filter(Boolean) as string[]);
    const r = new Map<string, Processo[]>();
    for (const c of casos.values()) { const l = processosDoCaso(c, ps, ligados) as Processo[]; if (l.length) r.set(c.id, l); }
    return r;
  }, [casos, processos, v]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** revisão em lote: escolher o processo de cada atendimento e ligar (o cartão sai do pré e as tarefas vão junto) */
export function JanelaLigarProcessos({ onFechar, so }: { onFechar: () => void; so?: string }) {
  const { casos, aviso } = useDados(); const mapa = useAtendimentosComProcesso(); const direto = useProtocoloDireto();
  const itens = [...mapa.entries()].filter(([id]) => !so || id === so).map(([id, ps]) => ({ caso: casos.get(id)! as Caso, ps })).filter((x) => x.caso)
    .sort((a, b) => a.caso.nome.localeCompare(b.caso.nome));
  const [esc, setEsc] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((x) => [x.caso.id, x.ps.length === 1 ? x.ps[0].numero : ""])));
  const [ocupado, setOcupado] = useState(false);
  const marcados = itens.filter((x) => esc[x.caso.id]);
  const ligar = async () => {
    setOcupado(true); let ok = 0;
    try { for (const x of marcados) if (await direto(x.caso.id, esc[x.caso.id], true, true)) ok++; }
    finally { setOcupado(false); }
    aviso(ok ? `${ok} atendimento(s) ligado(s) ao processo; os cartões passaram para o quadro Judicial.` : "Nenhum atendimento ligado.");
    if (ok === marcados.length) onFechar();
  };
  return (
    <Janela largo onFechar={onFechar} titulo="Atendimentos que já viraram processo" sub="Mesmo cliente e mesmo banco, com processo cadastrado depois que o atendimento foi aberto (muitas vezes pelo DJEN)">
      {!itens.length ? <div className="empty">Nenhum atendimento pendente de ligação.</div> : <>
        <div className="tscroll"><table className="grid"><caption className="sr-only">Atendimentos e o processo de cada um</caption>
          <thead><tr><th>Atendimento</th><th>Processo</th></tr></thead>
          <tbody>{itens.map(({ caso: c, ps }) => (
            <tr key={c.id}>
              <td><b>{nomeBonito(c.nome)}</b><div className="muted s">x {c.banco ? bancoCurto(c.banco) : "banco a definir"} · {c.etapa} · desde {dataBR(c.criado_em.slice(0, 10))}</div></td>
              <td><select aria-label={"Processo de " + nomeBonito(c.nome)} value={esc[c.id] || ""} onChange={(e) => setEsc((x) => ({ ...x, [c.id]: e.target.value }))}>
                <option value="">— não ligar —</option>
                {ps.map((p) => <option key={p.numero} value={p.numero}>{mascaraCnj(p.numero)} · {bancoCurto(p.banco)}{p.orgao ? " · " + p.orgao : ""}</option>)}</select>
                {ps.length > 1 && <div className="late s">{ps.length} processos possíveis: escolha o certo.</div>}</td>
            </tr>))}</tbody></table></div>
        <div className="tools"><button className="btn primary" disabled={ocupado || !marcados.length} onClick={ligar}>{ocupado ? "Ligando…" : `Ligar ${marcados.length} atendimento(s)`}</button>
          <span className="muted s">O atendimento vira “Protocolado”, sai do quadro pré-processual e as tarefas abertas passam para o processo.</span></div>
      </>}
    </Janela>
  );
}
