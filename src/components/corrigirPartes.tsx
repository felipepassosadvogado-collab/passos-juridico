"use client";
// Processo → Dados → "Corrigir cliente e partes": quando o processo foi ligado à pessoa errada (ex.: o número do
// Valentin protocolado no atendimento da Valentina). Troca o cliente, corrige réus/banco e desliga o atendimento
// que foi marcado como protocolado com esse número. Tudo fica registrado no histórico do processo.
import { useEffect, useMemo, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { nomeBonito } from "@/lib/formato";
import { BuscaCliente } from "./whatsapp";
import type { Processo } from "@/lib/tipos";

const ETAPA_VOLTA = "Pronto para protocolar";

export function CorrigirPartes({ p }: { p: Processo }) {
  const { sb, clientes, casos, tarefas, aplicar, aviso, registrar } = useDados();
  const [aberto, setAberto] = useState(false); const [ocupado, setOcupado] = useState(false);
  const [semFicha, setSemFicha] = useState(""); const [reus, setReus] = useState(p.reus.join("; ")); const [banco, setBanco] = useState(p.banco || "");
  useEffect(() => { setReus(p.reus.join("; ")); setBanco(p.banco || ""); }, [p.reus, p.banco]); // depois de gravar, mostra o que ficou
  const ligados = useMemo(() => [...casos.values()].filter((c) => c.processo_numero === p.numero), [casos, p.numero]);
  const atual = p.cliente_id ? clientes.get(p.cliente_id) : null;

  const gravar = async (campos: Record<string, unknown>, texto: string) => {
    setOcupado(true);
    try {
      const { data, error } = await sb.from("processos").update(campos).eq("numero", p.numero).select().single();
      if (error) { aviso(msgErro(error)); return false; }
      aplicar("processos", data); await registrar({ processo_numero: p.numero, tipo: "comentario", dados: { texto: "Correção: " + texto } });
      aviso("Corrigido: " + texto); return true;
    } finally { setOcupado(false); }
  };
  const trocarPara = async (id: string) => {
    const c = clientes.get(id); if (!c) return;
    await gravar({ cliente_id: c.id, cliente_nome: c.nome }, `cliente trocado de ${nomeBonito(p.cliente_nome) || "—"} para ${nomeBonito(c.nome)}.`);
  };
  const soNome = async () => {
    const n = semFicha.trim(); if (!n) return;
    if (await gravar({ cliente_id: null, cliente_nome: n.toUpperCase() }, `processo desligado da ficha de ${nomeBonito(p.cliente_nome) || "—"}; autor(a): ${nomeBonito(n)} (ainda sem ficha).`)) setSemFicha("");
  };
  const salvarReus = async () => {
    const lista = reus.split(/\s*;\s*/).map((x) => x.trim().toUpperCase()).filter(Boolean);
    await gravar({ reus: lista, banco: banco.trim() || null }, `réus: ${lista.map(nomeBonito).join("; ") || "—"}; banco: ${(banco.trim() || "—").replace(/\.$/, "")}.`);
  };
  const desligar = async (casoId: string) => {
    const c = casos.get(casoId); if (!c) return;
    setOcupado(true);
    try {
      const { data, error } = await sb.from("casos").update({ processo_numero: null, etapa: ETAPA_VOLTA }).eq("id", casoId).select().single();
      if (error) { aviso(msgErro(error)); return; }
      aplicar("casos", data);
      // as tarefas que o atendimento levou para o processo quando foi "protocolado" voltam para o atendimento
      const ts = [...tarefas.values()].filter((t) => t.caso_id === casoId && t.processo_numero === p.numero);
      if (ts.length) { const u = await sb.from("tarefas").update({ processo_numero: null }).in("id", ts.map((t) => t.id)).select(); for (const t of u.data || []) aplicar("tarefas", t); }
      await registrar({ caso_id: casoId, tipo: "comentario", dados: { texto: `Correção: desligado do processo ${p.mascara}, que não é deste atendimento. Voltou para “${ETAPA_VOLTA}” para protocolar com o número certo.` } });
      await registrar({ processo_numero: p.numero, tipo: "comentario", dados: { texto: `Correção: desligado do atendimento de ${nomeBonito(c.nome)} (o número não era desse atendimento).` } });
      aviso(`Atendimento de ${nomeBonito(c.nome)} desligado${ts.length ? ` e ${ts.length} tarefa(s) dele voltaram para o atendimento` : ""}. Ele voltou para “${ETAPA_VOLTA}” no CRM pré-processual.`);
    } finally { setOcupado(false); }
  };

  if (!aberto) return <div className="tools"><button className="btn ghost" onClick={() => setAberto(true)} title="Use quando o processo foi ligado ao cliente errado ou os réus estão errados">Corrigir cliente e partes</button></div>;
  return (
    <section className="panel cp-corr">
      <div className="ph"><h3>Corrigir cliente e partes</h3><button className="btn ghost" onClick={() => setAberto(false)}>Fechar</button></div>
      <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div className="s"><b>Cliente (autor):</b> {atual ? nomeBonito(atual.nome) : nomeBonito(p.cliente_nome) || "—"}{!atual && p.cliente_nome ? " (sem ficha)" : ""}</div>
          <div className="muted s" style={{ margin: "4px 0 6px" }}>Confira no eproc quem é o autor. Escolha a ficha certa, ou deixe só o nome se a pessoa ainda não tem ficha (dá para ligar depois em Clientes).</div>
          <BuscaCliente placeholder="Trocar para outro cliente: nome ou CPF" onEscolher={(id) => trocarPara(id)} />
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <input value={semFicha} onChange={(e) => setSemFicha(e.target.value)} placeholder="ou só o nome do autor, sem ficha (ex.: Valentin da Silva Soares)" aria-label="Nome do autor sem ficha" style={{ flex: 1 }} />
            <button className="btn" disabled={ocupado || !semFicha.trim()} onClick={soNome}>Usar só o nome</button>
          </div>
        </div>
        <div className="form2">
          <label className="f">Réus (separe com ;)<input value={reus} onChange={(e) => setReus(e.target.value)} placeholder="BANCO C6 CONSIGNADO S.A.; INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS" /></label>
          <label className="f">Banco<input value={banco} onChange={(e) => setBanco(e.target.value)} placeholder="BANCO C6 CONSIGNADO S.A." /></label>
          <div className="wide tools"><button className="btn" disabled={ocupado} onClick={salvarReus}>Salvar réus e banco</button></div>
        </div>
        <div>
          <div className="s"><b>Atendimento ligado a este número:</b> {ligados.length ? "" : "nenhum"}</div>
          {ligados.map((c) => (
            <div key={c.id} className="row" style={{ marginTop: 6 }}>
              <div className="main"><div className="t">{nomeBonito(c.nome)}</div><div className="s muted">{c.banco || "—"} · {c.etapa}</div></div>
              <button className="btn" disabled={ocupado} onClick={() => desligar(c.id)} title={`O atendimento sai deste processo e volta para “${ETAPA_VOLTA}”, para protocolar com o número certo`}>Desligar deste processo</button>
            </div>))}
        </div>
      </div>
    </section>
  );
}
