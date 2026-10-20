"use client";
import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useDados, msgErro } from "@/lib/dados";
import { bancoDosReus, nomeBonito, semAcento } from "@/lib/formato";
import { cidadeDoJuizo, cnjValido, infoCnj, mascaraCnj, soDigitos } from "@/lib/cnj";
import { FASES } from "@/lib/regras";
import { CamposCliente, EnvioDocumentos, useFichaCliente } from "@/components/cliente";
import { useJanelas } from "@/components/janelas";
import { SelResp } from "@/components/ui";

type PubDjen = { id: number; data: string; tipo_com: string | null; tipo_doc: string | null; orgao: string | null; texto: string; link: string | null };

function NovoCliente({ onUsar }: { onUsar: (id: string, nome: string, reu?: string) => void }) {
  const f = useFichaCliente(); const [min, setMin] = useState(false);
  const usar = async () => { const id = await f.salvar(); if (id) onUsar(id, f.ed.nome, f.extra.parteContraria); };
  const resumo = [f.ed.nome || "(sem nome)", f.ed.cpf, f.files.length ? f.files.length + (f.files.length === 1 ? " documento" : " documentos") : ""].filter(Boolean).join(" · ");
  const botoes = <span className="tools"><button className="btn primary" disabled={f.salvando || f.lendo} onClick={usar}>{f.salvando ? "Salvando…" : "Usar este cliente"}</button><button className="btn ghost" onClick={() => setMin(!min)}>{min ? "Expandir" : "Minimizar"}</button></span>;
  return (
    <div className={"novo-cli" + (min ? " min" : "")}>
      <div className="av-top"><button className="av-tit" onClick={() => setMin(!min)}><span className="seta">{min ? "▸" : "▾"}</span><strong>Novo cliente</strong></button>{botoes}</div>
      {min ? <div className="muted" style={{ fontSize: 13 }}>{resumo}</div> : <>
        <div className="muted" style={{ fontSize: 12.5 }}>Anexe RG ou CNH, comprovante de residência e procuração; o Claude preenche. Depois clique em “Usar este cliente” para continuar o processo.</div>
        <EnvioDocumentos f={f} texto="Documentos do cliente" />
        <CamposCliente f={f} so={["nome", "cpf", "rg", "nascimento", "estado_civil", "profissao", "telefone", "endereco", "cep", "cidade", "nb"]} />
      </>}
    </div>
  );
}

function Novo() {
  const sp = useSearchParams(); const router = useRouter(); const j = useJanelas();
  const { processos, clientes, casos, sb, eu, aplicar, aviso, registrar } = useDados();
  const caso = sp.get("caso") ? casos.get(sp.get("caso")!) : undefined;
  const cliIni = sp.get("cliente") || caso?.cliente_id || "";
  const [np, setNp] = useState({ numero: "", orgao: "", cidade: "", cidMan: false, tribunal: "", reus: caso ? [caso.banco, "Instituto Nacional do Seguro Social - INSS"].filter(Boolean).join("; ") : "", classe: "", fase: "Protocolo / citação", resp: eu.id as string | null, clienteId: cliIni, cliente: caso?.nome || "" });
  const [pubs, setPubs] = useState<PubDjen[]>([]); const [nota, setNota] = useState(""); const [busy, setBusy] = useState(false); const [novoCli, setNovoCli] = useState(false);
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
      const d = jj.dados; if (!d) { setNota("O DJEN ainda não tem publicações desse processo. Preencha os dados à mão."); return; }
      const c: Partial<typeof np> = { orgao: d.orgao || np.orgao, tribunal: d.tribunal || np.tribunal, classe: d.classe || np.classe, cidade: cidadeDoJuizo(d.orgao) || np.cidade };
      if (d.reus?.length) c.reus = d.reus.join("; ");
      if (d.autores?.length && !np.clienteId) { const nome = nomeBonito(d.autores[0]); c.cliente = nome; const ex = [...clientes.values()].find((x) => semAcento(x.nome) === semAcento(nome)); if (ex) c.clienteId = ex.id; }
      set(c); setPubs(d.pubs || []);
      setNota(`${d.pubs.length} ${d.pubs.length === 1 ? "publicação encontrada" : "publicações encontradas"}. Dados preenchidos; confira antes de cadastrar.`);
    } catch { setNota("Não foi possível consultar o DJEN agora. Preencha à mão ou tente de novo."); }
    finally { setBusy(false); }
  };
  const cadastrar = async () => {
    if (!valido) { aviso("Número CNJ inválido."); return; } if (existe) { aviso("Esse processo já existe."); return; }
    if (novoCli) { aviso("Clique antes em “Usar este cliente” no quadro do novo cliente."); return; }
    setBusy(true);
    try {
      const reus = np.reus.split(";").map((x) => x.trim()).filter(Boolean); const cli = np.clienteId ? clientes.get(np.clienteId) : undefined;
      const ult = [...pubs].sort((a, b) => b.data.localeCompare(a.data))[0];
      const { data, error } = await sb.from("processos").insert({
        numero: dig, tribunal: np.tribunal.trim() || info?.tribunal || null, orgao: np.orgao.trim() || null, cidade: np.cidade.trim() || null, classe: np.classe.trim() || null,
        cliente_id: np.clienteId || null, cliente_nome: cli?.nome || np.cliente || "", reus, banco: bancoDosReus(reus) || null, fase: np.fase || null, responsavel: np.resp || null,
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
      aviso("Processo cadastrado."); router.replace("/processos/" + dig);
    } finally { setBusy(false); }
  };
  const campo = (k: "orgao" | "cidade" | "tribunal" | "classe" | "reus", rot: string, ph?: string, full?: boolean, list?: string) =>
    <label className={"f" + (full ? " full" : "")}>{rot}<input value={np[k]} placeholder={ph} list={list} onChange={(e) => {
      const v = e.target.value; if (k === "orgao") set({ orgao: v, ...(np.cidMan ? {} : { cidade: cidadeDoJuizo(v) }) }); else if (k === "cidade") set({ cidade: v, cidMan: true }); else set({ [k]: v });
    }} /></label>;
  return (
    <>
      <div className="head"><div><h2>Novo processo</h2>{caso && <div className="sub">A partir do atendimento de {nomeBonito(caso.nome)}</div>}</div></div>
      <section className="panel"><div className="pb" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <label className="f">Número CNJ<input className="mono" inputMode="numeric" placeholder="0000000-00.0000.0.00.0000" value={mascaraCnj(np.numero)} onChange={(e) => {
          const d = soDigitos(e.target.value); const i = infoCnj(d); set({ numero: d, ...(d.length === 20 && i ? { tribunal: i.tribunal } : {}) });
        }} /></label>
        {dig.length === 20 && <div className={"banner" + (valido && !existe ? " ok" : !valido ? " erro" : "")}>
          {!valido ? "Os dígitos verificadores não conferem. Confira o número." : existe ? "Esse processo já está na carteira." : [info?.ramo, info?.tribunal, "ajuizado em " + info?.ano, varas.length ? "varas conhecidas desta origem: " + varas.slice(0, 3).join("; ") : "origem ainda sem processos na carteira"].join(" · ")}</div>}
        {existe && <div className="tools"><button className="btn primary" onClick={() => router.push("/processos/" + dig)}>Abrir o processo existente</button></div>}
        {valido && !existe && <div className="tools"><button className="btn" disabled={busy} onClick={buscar}>{busy ? "Buscando no DJEN…" : "Buscar dados no DJEN"}</button><span className="muted" style={{ fontSize: 12 }}>Preenche vara, partes e traz as publicações, se houver.</span></div>}
        {nota && <div className="banner">{nota}</div>}
        <datalist id="np-varas">{varas.map((x) => <option key={x} value={x} />)}</datalist>
        <div className="form2">
          {campo("orgao", "Vara / juízo", "Ex.: 6ª Vara Federal de Joinville", true, "np-varas")}
          {campo("cidade", "Cidade")}{campo("tribunal", "Tribunal")}
          <div className="full" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="tools">
              <label className="f" style={{ flex: 1, minWidth: 220 }}>Cliente<select disabled={novoCli} value={np.clienteId} onChange={(e) => set({ clienteId: e.target.value, cliente: clientes.get(e.target.value)?.nome || np.cliente })}>
                <option value="">{np.cliente && !np.clienteId ? "Sem ficha: " + np.cliente : "— escolher cliente —"}</option>
                {[...clientes.values()].sort((a, b) => a.nome.localeCompare(b.nome)).map((c) => <option key={c.id} value={c.id}>{nomeBonito(c.nome)}</option>)}</select></label>
              <button className={novoCli ? "btn ghost" : "btn"} style={{ alignSelf: "flex-end" }} onClick={() => { setNovoCli(!novoCli); if (!novoCli) set({ clienteId: "" }); }}>{novoCli ? "Cancelar novo cliente" : "+ Novo cliente com documentos"}</button>
            </div>
            {novoCli && <NovoCliente onUsar={(id, nome, reu) => { set({ clienteId: id, cliente: nome, ...(reu && !np.reus.trim() ? { reus: reu + "; Instituto Nacional do Seguro Social - INSS" } : {}) }); setNovoCli(false); aviso("Cliente cadastrado e selecionado. Continue o processo."); }} />}
          </div>
          {campo("reus", "Réus (separe por ;)", "Ex.: Banco C6 Consignado S.A.; INSS", true)}
          {campo("classe", "Classe", "Ex.: Procedimento do Juizado Especial Cível")}
          <label className="f">Fase<select value={np.fase} onChange={(e) => set({ fase: e.target.value })}>{FASES.map((f) => <option key={f}>{f}</option>)}</select></label>
          <label className="f">Responsável<SelResp valor={np.resp} onChange={(v) => set({ resp: v })} /></label>
        </div>
        <div className="tools"><button className="btn primary" disabled={!valido || existe || busy} onClick={cadastrar}>Cadastrar processo</button>
          <button className="btn" onClick={() => { if (novoCli) { aviso("Clique antes em “Usar este cliente” no quadro do novo cliente."); return; } const reus = np.reus.split(";").map((x) => x.trim()).filter(Boolean); j.abrirInicial({ clienteId: np.clienteId || null, banco: bancoDosReus(reus), cidade: np.cidade, casoId: caso?.id || null }); }}>Criar petição inicial (Word)</button></div>
      </div></section>
    </>
  );
}
export default function Pagina() { return <Suspense><Novo /></Suspense>; }
