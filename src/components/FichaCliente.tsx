"use client";
// Ficha do cliente no estilo do ADVBOX: foto/iniciais, nome, abas (dados, documentos, processos e honorários).
// Abre numa caixa a partir da lista de clientes e também como página (/clientes/[id]).
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { bancoCurto, dataBR, dataHoraBR, iniciais, moeda, nomeBonito } from "@/lib/formato";
import { soDigitos } from "@/lib/cnj";
import { faseCRM } from "@/lib/regras";
import { honorarios, pctPadrao } from "@/lib/valores";
import type { Cliente } from "@/lib/tipos";
import { CamposCliente, DocumentosSalvos, EnvioDocumentos, useFichaCliente } from "@/components/cliente";
import { useConfirmar } from "@/components/ui";
import { useJanelas } from "@/components/janelas";
import { CampoValores } from "@/components/valores";
import { KitProcuracao } from "@/components/kitProcuracao";

const S = (d: string) => <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;
type Aba = "dados" | "docs" | "processos";

export function FichaCliente({ c, emJanela, onFechar }: { c?: Cliente; emJanela?: boolean; onFechar?: () => void }) {
  const { processos, casos, config, sb, aplicar, remover, aviso, titular } = useDados(); const router = useRouter(); const confirmar = useConfirmar(); const j = useJanelas();
  const f = useFichaCliente(c); const [vinc, setVinc] = useState(""); const [n, setN] = useState(0); const [aba, setAba] = useState<Aba>("dados");
  const ps = c ? [...processos.values()].filter((p) => p.cliente_id === c.id).sort((a, b) => (b.ultima_data || "").localeCompare(a.ultima_data || "")) : [];
  const cs = c ? [...casos.values()].filter((x) => x.cliente_id === c.id && !x.processo_numero) : [];
  const padrao = pctPadrao(config);
  const tot = [...ps, ...cs].reduce((s, x) => ({ v: s.v + (x.valor_causa || 0), h: s.h + honorarios(x.valor_causa, x.honorarios_pct ?? padrao) }), { v: 0, h: 0 });
  const salvarProc = async (numero: string, v: Record<string, unknown>) => {
    const { data, error } = await sb.from("processos").update(v).eq("numero", numero).select().single();
    if (error) { aviso(/valor_causa|honorarios/.test(error.message) ? "Falta instalar a etapa 10 (0009_valores.sql) no Supabase." : msgErro(error)); return; } aplicar("processos", data); aviso("Valores salvos.");
  };
  const salvarCaso = async (id: string, v: Record<string, unknown>) => {
    const { data, error } = await sb.from("casos").update(v).eq("id", id).select().single();
    if (error) { aviso(/valor_causa|honorarios/.test(error.message) ? "Falta instalar a etapa 10 (0009_valores.sql) no Supabase." : msgErro(error)); return; } aplicar("casos", data); aviso("Valores salvos.");
  };
  const nomeTela = nomeBonito(f.ed.nome || c?.nome || "") || "Novo cliente";
  const botaoAba = (k: Aba, rot: string, icone: string) => <button type="button" role="tab" aria-selected={aba === k} title={rot} aria-label={rot} className={"fc-aba" + (aba === k ? " on" : "")} onClick={() => setAba(k)}>{S(icone)}</button>;
  return (
    <div className={"ficha" + (emJanela ? " em-janela" : "")}>
      <div className="fc-barra">
        <div className="fc-abas" role="tablist">
          {botaoAba("dados", "Dados do cliente", '<circle cx="10" cy="7" r="3"/><path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"/>')}
          {c && botaoAba("docs", "Documentos", '<path d="M5 2.5h7l3.5 3.5v11.5H5z"/><path d="M12 2.5V6h3.5"/>')}
          {c && botaoAba("processos", "Processos e honorários", '<path d="M2.5 6V15a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V8a1.5 1.5 0 0 0-1.5-1.5H10L8.5 4.5H4A1.5 1.5 0 0 0 2.5 6z"/>')}
        </div>
        {emJanela && <><a className="icb" title="Abrir em página inteira" aria-label="Abrir em página inteira" href={"/clientes/" + c?.id} onClick={(e) => { e.preventDefault(); onFechar?.(); router.push("/clientes/" + c?.id); }}>{S('<path d="M11.5 3.5h5v5M16.5 3.5l-6 6M8.5 4.5h-4v11h11v-4"/>')}</a>
          <button type="button" className="icb" aria-label="Fechar" onClick={onFechar}>✕</button></>}
      </div>
      <div className="fc-corpo">
        <div className="fc-topo">
          <div className="fc-foto" aria-hidden="true">{nomeTela !== "Novo cliente" ? iniciais(nomeTela) : S('<circle cx="10" cy="7" r="3"/><path d="M4 16.5c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"/>')}</div>
          <h2>{nomeTela.toUpperCase()}</h2>
          {c && <div className="muted s">Cadastrado em {dataHoraBR(c.criado_em)} · {ps.length} {ps.length === 1 ? "processo" : "processos"}{cs.length ? ` · ${cs.length} atendimento(s)` : ""}</div>}
          {c && tot.v > 0 && <div className="fc-hon"><span>Causas: <b>R$ {moeda(tot.v)}</b></span><span>Honorários: <b className="acc">R$ {moeda(tot.h)}</b></span></div>}
        </div>

        {aba === "dados" && <div className="fc-campos">
          {!c && <div className="cx-docs"><EnvioDocumentos f={f} texto="Anexe RG ou CNH, comprovante e procuração: o Claude preenche a ficha" /></div>}
          <CamposCliente f={f} />
          <KitProcuracao f={f} bancoSugerido={ps[0]?.banco || cs[0]?.banco || ""} />
          <button className="btn primary fc-salvar" disabled={f.salvando} onClick={async () => { const id = await f.salvar(); if (id && !c) router.replace("/clientes/" + id); else setN(n + 1); }}>{f.salvando ? "Salvando…" : c ? "Atualizar dados do cliente" : "Cadastrar cliente"}</button>
          {c && !ps.length && titular && <button className="btn ghost" onClick={async () => {
            if (!confirmar("del" + c.id, aviso, "Clique de novo em “Excluir ficha” para confirmar.")) return;
            const { error } = await sb.from("clientes").delete().eq("id", c.id); if (error) { aviso(msgErro(error)); return; } remover("clientes", c.id); aviso("Ficha excluída."); if (emJanela) onFechar?.(); else router.replace("/clientes");
          }}>Excluir ficha</button>}
        </div>}

        {aba === "docs" && c && <div className="fc-campos">
          <DocumentosSalvos clienteId={c.id} atualizar={n} />
          <EnvioDocumentos f={f} texto="Anexar mais documentos" />
          {f.files.length > 0 && <button className="btn primary fc-salvar" disabled={f.salvando} onClick={async () => { await f.salvar(); setN(n + 1); }}>{f.salvando ? "Salvando…" : "Guardar documentos na ficha"}</button>}
        </div>}

        {aba === "processos" && c && <div className="fc-campos">
          {ps.map((p) => (
            <div key={p.numero} className="fc-proc">
              <button className="fc-proc-tit" onClick={() => j.abrirProcesso(p.numero)}>
                <span className="mono">{p.mascara}</span><span className="pill">{bancoCurto(p.banco)}</span></button>
              <div className="muted s">{(faseCRM(p.fase) || "Sem fase") + " · " + (p.orgao || "juízo não informado")}{p.ultima_data ? " · " + dataBR(p.ultima_data) : ""}</div>
              <CampoValores compacto valor={p.valor_causa} pct={p.honorarios_pct} onSalvar={(v) => salvarProc(p.numero, v)} />
            </div>))}
          {cs.map((x) => (
            <div key={x.id} className="fc-proc">
              <button className="fc-proc-tit" onClick={() => j.abrirCaso(x.id)}><span>Atendimento pré-processual</span><span className="pill">{bancoCurto(x.banco)}</span></button>
              <div className="muted s">Etapa: {x.etapa}</div>
              <CampoValores compacto valor={x.valor_causa} pct={x.honorarios_pct} onSalvar={(v) => salvarCaso(x.id, v)} />
            </div>))}
          {!ps.length && !cs.length && <div className="empty">Nenhum processo vinculado.</div>}
          <button className="btn" onClick={() => j.novoProcesso({ clienteId: c.id })}>Novo processo para este cliente</button>
          <div className="tools">
            <input value={vinc} placeholder="Nº do processo para vincular" onChange={(e) => setVinc(e.target.value)} style={{ flex: 1 }} />
            <button className="btn ghost" onClick={async () => { const num = soDigitos(vinc); if (!processos.has(num)) { aviso("Processo não encontrado na carteira."); return; }
              const { data, error } = await sb.from("processos").update({ cliente_id: c.id, cliente_nome: processos.get(num)!.cliente_nome || c.nome }).eq("numero", num).select().single();
              if (error) aviso(msgErro(error)); else { aplicar("processos", data); setVinc(""); aviso("Processo vinculado."); } }}>Vincular</button></div>
        </div>}
      </div>
    </div>
  );
}

export function JanelaCliente({ id, onFechar }: { id: string; onFechar: () => void }) {
  const { clientes } = useDados(); const c = clientes.get(id);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal compacto fc-modal" role="dialog" aria-modal="true" aria-label={"Cliente " + (c?.nome || "")}>
        {c ? <FichaCliente key={c.id} c={c} emJanela onFechar={onFechar} /> : <div className="empty">Cliente não encontrado. <button className="reflink" onClick={onFechar}>Fechar</button></div>}
      </div>
    </div>
  );
}
