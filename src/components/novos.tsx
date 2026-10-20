"use client";
// Cadastro de processo e de cliente numa caixa compacta (estilo ADVBOX).
// O mesmo formulário de processo serve para a página /processos/novo.
import { useEffect, useMemo, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { bancoDosReus, nomeBonito, semAcento } from "@/lib/formato";
import { cidadeDoJuizo, cnjValido, infoCnj, mascaraCnj, soDigitos } from "@/lib/cnj";
import { FASES } from "@/lib/regras";
import { CamposCliente, EnvioDocumentos, useFichaCliente } from "./cliente";
import { useJanelas } from "./janelas";
import { SelResp } from "./ui";

type PubDjen = { id: number; data: string; tipo_com: string | null; tipo_doc: string | null; orgao: string | null; texto: string; link: string | null };
const S = (d: string) => <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" dangerouslySetInnerHTML={{ __html: d }} />;

/** caixa compacta no meio da tela, com rodapé fixo para o botão principal */
export function CaixaCompacta({ titulo, icone, onFechar, rodape, children, cru }: { titulo: string; icone?: string; onFechar: () => void; rodape?: React.ReactNode; children: React.ReactNode; cru?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onFechar(); };
    document.addEventListener("keydown", k); document.body.classList.add("sem-rolagem");
    return () => { document.removeEventListener("keydown", k); document.body.classList.remove("sem-rolagem"); };
  }, [onFechar]);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar(); }}>
      <div className="modal compacto" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="cx-topo">{icone && <span className="cx-ic">{S(icone)}</span>}<h2>{titulo}</h2><button className="icb" style={{ marginLeft: "auto" }} aria-label="Fechar" onClick={onFechar}>✕</button></div>
        {cru ? children : <div className="cx-corpo">{children}</div>}
        {rodape && <div className="cx-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

/** escolher cliente digitando o nome (como "Nome do contato" no ADVBOX) */
function BuscaCliente({ valor, nomeSemFicha, onEscolher, onNovo, desativado }: { valor: string; nomeSemFicha?: string; onEscolher: (id: string, nome: string) => void; onNovo: () => void; desativado?: boolean }) {
  const { clientes, processos } = useDados(); const [q, setQ] = useState(""); const [aberto, setAberto] = useState(false); const [sel, setSel] = useState(0);
  const c = valor ? clientes.get(valor) : undefined;
  const achados = useMemo(() => {
    const t = semAcento(q.trim()), dg = soDigitos(q); if (t.length < 2 && dg.length < 3) return [];
    return [...clientes.values()].filter((x) => semAcento(x.nome).includes(t) || (dg.length >= 3 && (x.cpf || "").replace(/\D/g, "").includes(dg))).sort((a, b) => a.nome.localeCompare(b.nome)).slice(0, 8);
  }, [q, clientes]);
  if (c) return <div className="cx-cli"><span className="avr">{nomeBonito(c.nome).split(" ").map((x) => x[0]).slice(0, 2).join("")}</span>
    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontWeight: 600 }}>{nomeBonito(c.nome)}</div><div className="muted s">{[c.cpf, [...processos.values()].filter((p) => p.cliente_id === c.id).length + " processo(s)"].filter(Boolean).join(" · ")}</div></div>
    <button className="btn ghost" disabled={desativado} onClick={() => onEscolher("", "")}>Trocar</button></div>;
  return (
    <div className="cx-busca">
      <span className="cx-busca-ic">{S('<circle cx="10" cy="7" r="3.2"/><path d="M4 17c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"/>')}</span>
      <input value={q} disabled={desativado} placeholder={nomeSemFicha ? `Sem ficha: ${nomeSemFicha} — digite para buscar` : "Nome do cliente ou CPF"} onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)}
        onChange={(e) => { setQ(e.target.value); setAberto(true); setSel(0); }}
        onKeyDown={(e) => { if (!achados.length) return; if (e.key === "ArrowDown") { e.preventDefault(); setSel((sel + 1) % achados.length); } else if (e.key === "ArrowUp") { e.preventDefault(); setSel((sel - 1 + achados.length) % achados.length); } else if (e.key === "Enter") { e.preventDefault(); onEscolher(achados[sel].id, achados[sel].nome); setQ(""); } }} />
      {aberto && (achados.length > 0 || q.trim().length >= 2) && <div className="mencao" style={{ top: "calc(100% + 4px)", bottom: "auto", left: 0, right: 0 }}>
        {achados.map((x, i) => <button key={x.id} className={i === sel ? "on" : ""} onMouseDown={(e) => { e.preventDefault(); onEscolher(x.id, x.nome); setQ(""); }}><span className="mn">{nomeBonito(x.nome)}</span><span className="ms">{x.cpf || "sem CPF"}{x.cidade ? " · " + x.cidade : ""}</span></button>)}
        <button onMouseDown={(e) => { e.preventDefault(); onNovo(); }}><span className="mn">+ Cadastrar novo cliente{q.trim() ? `: “${q.trim()}”` : ""}</span><span className="ms">com os documentos, o Claude preenche a ficha</span></button>
      </div>}
    </div>
  );
}

/** o novo cliente dentro do cadastro do processo */
function NovoClienteEmbutido({ onUsar, onCancelar }: { onUsar: (id: string, nome: string, reu?: string) => void; onCancelar: () => void }) {
  const f = useFichaCliente();
  return (
    <div className="novo-cli">
      <div className="av-top"><strong>Novo cliente</strong><span className="tools"><button className="btn primary" disabled={f.salvando || f.lendo} onClick={async () => { const id = await f.salvar(); if (id) onUsar(id, f.ed.nome, f.extra.parteContraria); }}>{f.salvando ? "Salvando…" : "Usar este cliente"}</button><button className="btn ghost" onClick={onCancelar}>Cancelar</button></span></div>
      <EnvioDocumentos f={f} texto="RG ou CNH, comprovante e procuração: o Claude preenche" />
      <CamposCliente f={f} so={["nome", "cpf", "rg", "nascimento", "estado_civil", "profissao", "telefone", "endereco", "cep", "cidade", "nb"]} />
    </div>
  );
}

export type CtxNovoProcesso = { clienteId?: string | null; casoId?: string | null };

/** formulário de novo processo (caixa compacta ou página) */
export function FormNovoProcesso({ ctx, onCriado }: { ctx: CtxNovoProcesso; onCriado: (numero: string) => void }) {
  const j = useJanelas(); const { processos, clientes, casos, sb, eu, aplicar, aviso, registrar } = useDados();
  const caso = ctx.casoId ? casos.get(ctx.casoId) : undefined;
  const [np, setNp] = useState({ numero: "", orgao: "", cidade: "", cidMan: false, tribunal: "", reus: caso ? [caso.banco, "Instituto Nacional do Seguro Social - INSS"].filter(Boolean).join("; ") : "", classe: "", fase: "Protocolo / citação", resp: eu.id as string | null, clienteId: ctx.clienteId || caso?.cliente_id || "", cliente: caso?.nome || "", notas: "" });
  const [pubs, setPubs] = useState<PubDjen[]>([]); const [nota, setNota] = useState(""); const [busy, setBusy] = useState(false); const [novoCli, setNovoCli] = useState(false); const [mais, setMais] = useState(false);
  const dig = soDigitos(np.numero); const info = infoCnj(dig); const valido = dig.length === 20 && cnjValido(dig); const existe = valido && processos.has(dig);
  const varas = useMemo(() => {
    if (!info) return []; const c: Record<string, number> = {};
    for (const p of processos.values()) if (p.orgao && p.numero.slice(13, 20) === dig.slice(13, 20)) c[p.orgao] = (c[p.orgao] || 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]).map((x) => x[0]).filter((o) => !/Presid|Contadoria|Coordenadoria|Vice/i.test(o));
  }, [info?.chave]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (c: Partial<typeof np>) => setNp((x) => ({ ...x, ...c }));
  const buscar = async () => {
    setBusy(true); setNota("");
    try {
      const r = await fetch("/api/djen/processo?numero=" + dig); const jj = await r.json();
      if (!r.ok) { setNota(jj.erro || "Não foi possível consultar o DJEN agora."); return; }
      const d = jj.dados; if (!d) { setNota("O DJEN ainda não tem publicações desse processo. Preencha à mão."); setMais(true); return; }
      const c: Partial<typeof np> = { orgao: d.orgao || np.orgao, tribunal: d.tribunal || np.tribunal, classe: d.classe || np.classe, cidade: cidadeDoJuizo(d.orgao) || np.cidade };
      if (d.reus?.length) c.reus = d.reus.join("; ");
      if (d.autores?.length && !np.clienteId) { const nome = nomeBonito(d.autores[0]); c.cliente = nome; const ex = [...clientes.values()].find((x) => semAcento(x.nome) === semAcento(nome)); if (ex) c.clienteId = ex.id; }
      set(c); setPubs(d.pubs || []);
      setNota(`${d.pubs.length} ${d.pubs.length === 1 ? "publicação encontrada" : "publicações encontradas"} no DJEN. Juízo, partes e classe preenchidos; confira.`);
    } catch { setNota("Não foi possível consultar o DJEN agora. Preencha à mão ou tente de novo."); }
    finally { setBusy(false); }
  };
  // número completo e válido: busca no DJEN sozinho
  useEffect(() => { if (valido && !existe && !np.orgao && !busy) buscar(); }, [valido, existe]); // eslint-disable-line react-hooks/exhaustive-deps
  const cadastrar = async () => {
    if (!valido) { aviso("Número CNJ inválido."); return; } if (existe) { aviso("Esse processo já existe."); return; }
    if (novoCli) { aviso("Clique antes em “Usar este cliente” no quadro do novo cliente."); return; }
    if (!np.fase) { aviso("Escolha a fase."); return; }
    setBusy(true);
    try {
      const reus = np.reus.split(";").map((x) => x.trim()).filter(Boolean); const cli = np.clienteId ? clientes.get(np.clienteId) : undefined;
      const ult = [...pubs].sort((a, b) => b.data.localeCompare(a.data))[0];
      const { data, error } = await sb.from("processos").insert({
        numero: dig, tribunal: np.tribunal.trim() || info?.tribunal || null, orgao: np.orgao.trim() || null, cidade: np.cidade.trim() || null, classe: np.classe.trim() || null,
        cliente_id: np.clienteId || null, cliente_nome: cli?.nome || np.cliente || "", reus, banco: bancoDosReus(reus) || null, fase: np.fase || null, responsavel: np.resp || null, notas: np.notas.trim() || null,
        ultima_data: ult?.data || null, ultimo_ato: ult ? (ult.tipo_doc && ult.tipo_doc !== "Outros" ? ult.tipo_doc : ult.tipo_com) : "Cadastro manual", cadastro_manual: true,
      }).select().single();
      if (error) { aviso(msgErro(error)); return; }
      aplicar("processos", data);
      if (pubs.length) { const r = await sb.from("publicacoes").upsert(pubs.map((x) => ({ ...x, processo_numero: dig, triagem: "concluida" })), { onConflict: "id", ignoreDuplicates: true }); if (r.error) aviso("O processo foi cadastrado, mas as publicações do DJEN não foram gravadas."); }
      await registrar({ processo_numero: dig, tipo: "processo_cadastrado", dados: { texto: pubs.length ? pubs.length + " publicações do DJEN importadas." : "" } });
      if (np.resp) await registrar({ processo_numero: dig, tipo: "responsavel", dados: { responsavel: np.resp } });
      if (caso) {
        const r = await sb.from("casos").update({ processo_numero: dig, etapa: "Protocolado" }).eq("id", caso.id).select().single(); if (r.data) aplicar("casos", r.data);
        registrar({ caso_id: caso.id, tipo: "fase", dados: { fase: "Protocolado: processo " + mascaraCnj(dig) } });
        registrar({ processo_numero: dig, tipo: "comentario", dados: { texto: "Originado do atendimento pré-processual." } });
      }
      aviso("Processo cadastrado."); onCriado(dig);
    } finally { setBusy(false); }
  };
  const campo = (k: "orgao" | "cidade" | "tribunal" | "classe", rot: string, ph?: string, list?: string) =>
    <label className="f">{rot}<input value={np[k]} placeholder={ph} list={list} onChange={(e) => {
      const v = e.target.value; if (k === "orgao") set({ orgao: v, ...(np.cidMan ? {} : { cidade: cidadeDoJuizo(v) }) }); else if (k === "cidade") set({ cidade: v, cidMan: true }); else set({ [k]: v });
    }} /></label>;
  const resumoJuizo = [np.orgao, np.classe && nomeBonito(np.classe)].filter(Boolean).join(" · ");
  return (
    <>
      <div className="cx-corpo"><div className="cx-campos">
        {caso && <div className="banner">A partir do atendimento de <strong>{nomeBonito(caso.nome)}</strong>.</div>}
        <label className="f">Número do processo (CNJ)<input className="mono" inputMode="numeric" autoFocus placeholder="0000000-00.0000.0.00.0000" value={mascaraCnj(np.numero)} onChange={(e) => {
          const d = soDigitos(e.target.value); const i = infoCnj(d); set({ numero: d, ...(d.length === 20 && i ? { tribunal: i.tribunal } : {}) });
        }} /></label>
        {dig.length === 20 && (!valido ? <div className="banner erro">Os dígitos verificadores não conferem. Confira o número.</div>
          : existe ? <div className="banner">Esse processo já está na carteira. <button className="reflink" onClick={() => j.abrirProcesso(dig)}>Abrir o processo</button></div>
            : busy && !nota ? <div className="banner">Buscando no DJEN…</div> : nota ? <div className="banner ok">{nota}</div> : null)}
        <div className="f"><span>Cliente (parte autora)</span>
          {novoCli ? <NovoClienteEmbutido onCancelar={() => setNovoCli(false)} onUsar={(id, nome, reu) => { set({ clienteId: id, cliente: nome, ...(reu && !np.reus.trim() ? { reus: reu + "; Instituto Nacional do Seguro Social - INSS" } : {}) }); setNovoCli(false); aviso("Cliente cadastrado e selecionado."); }} />
            : <BuscaCliente valor={np.clienteId} nomeSemFicha={!np.clienteId ? np.cliente : ""} onEscolher={(id, nome) => set({ clienteId: id, cliente: nome || np.cliente })} onNovo={() => setNovoCli(true)} />}</div>
        <label className="f">Réus (separe por ;)<input value={np.reus} placeholder="Ex.: Banco C6 Consignado S.A.; INSS" onChange={(e) => set({ reus: e.target.value })} /></label>
        <label className="f">Responsável<SelResp valor={np.resp} onChange={(v) => set({ resp: v })} /></label>
        <label className="f">Anotações gerais<textarea rows={2} value={np.notas} placeholder="Anotações, fatos e fundamentos (o Claude lê ao redigir peças)" onChange={(e) => set({ notas: e.target.value })} /></label>
        <label className="f">Fase *<select value={np.fase} onChange={(e) => set({ fase: e.target.value })}>{FASES.map((f) => <option key={f}>{f}</option>)}</select></label>
        <button className="cx-mais" onClick={() => setMais(!mais)} aria-expanded={mais}><span>{mais ? "▾" : "▸"}</span> Juízo, cidade, tribunal e classe{!mais && resumoJuizo ? <span className="muted"> · {resumoJuizo}</span> : !mais ? <span className="muted"> · preenchidos pelo DJEN</span> : null}</button>
        {mais && <div className="form2">
          <datalist id="np-varas">{varas.map((x) => <option key={x} value={x} />)}</datalist>
          <div className="full">{campo("orgao", "Vara / juízo", "Ex.: 6ª Vara Federal de Joinville", "np-varas")}</div>
          {campo("cidade", "Cidade")}{campo("tribunal", "Tribunal")}
          <div className="full">{campo("classe", "Classe", "Ex.: Procedimento do Juizado Especial Cível")}</div>
        </div>}
      </div></div>
      <div className="cx-rodape">
        <button className="btn ghost" onClick={() => { if (novoCli) { aviso("Clique antes em “Usar este cliente” no quadro do novo cliente."); return; } const reus = np.reus.split(";").map((x) => x.trim()).filter(Boolean); j.abrirInicial({ clienteId: np.clienteId || null, banco: bancoDosReus(reus), cidade: np.cidade, casoId: caso?.id || null }); }}>Criar petição inicial (Word)</button>
        <button className="btn primary cx-princ" disabled={!valido || existe || busy} onClick={cadastrar}>{busy && valido && !existe && nota ? "Cadastrando…" : "Criar novo processo"}</button>
      </div>
    </>
  );
}

export function JanelaNovoProcesso({ ctx, onFechar, onCriado }: { ctx: CtxNovoProcesso; onFechar: () => void; onCriado: (numero: string) => void }) {
  return <CaixaCompacta cru titulo="Criar novo processo" icone='<path d="M2.5 6.5a2 2 0 0 1 2-2h3l1.5 1.5h6.5a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/>' onFechar={onFechar}>
    <FormNovoProcesso ctx={ctx} onCriado={onCriado} />
  </CaixaCompacta>;
}

export function JanelaNovoCliente({ onFechar }: { onFechar: () => void }) {
  const f = useFichaCliente(); const j = useJanelas(); const { aviso } = useDados(); const [criado, setCriado] = useState<string | null>(null);
  if (criado) return <CaixaCompacta titulo="Cliente cadastrado" onFechar={onFechar} rodape={<><button className="btn ghost" onClick={onFechar}>Fechar</button>
    <a className="btn" href={"/clientes/" + criado}>Abrir a ficha</a><button className="btn primary" onClick={() => { onFechar(); setTimeout(() => j.novoProcesso({ clienteId: criado }), 0); }}>Criar processo para este cliente</button></>}>
    <div className="banner ok"><strong>{nomeBonito(f.ed.nome)}</strong> foi cadastrado{f.files.length ? `, com ${f.files.length} documento(s) guardados na ficha` : ""}.</div>
  </CaixaCompacta>;
  return (
    <CaixaCompacta titulo="Novo cliente" icone='<circle cx="10" cy="7" r="3.2"/><path d="M4 17c.8-3 3.2-4.5 6-4.5s5.2 1.5 6 4.5"/>' onFechar={onFechar}
      rodape={<><button className="btn ghost" onClick={onFechar}>Cancelar</button><button className="btn primary cx-princ" disabled={f.salvando || f.lendo} onClick={async () => { if (!f.ed.nome.trim()) { aviso("Informe o nome do cliente (ou leia os documentos com o Claude)."); return; } const id = await f.salvar(); if (id) setCriado(id); }}>{f.salvando ? "Salvando…" : "Cadastrar cliente"}</button></>}>
      <div className="cx-campos">
        <div className="cx-docs"><EnvioDocumentos f={f} texto="Documentos (RG ou CNH, comprovante, procuração): o Claude preenche a ficha" /></div>
        <CamposCliente f={f} />
      </div>
    </CaixaCompacta>
  );
}
