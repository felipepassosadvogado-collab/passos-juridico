"use client";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { dataBR, dataHoraBR } from "@/lib/formato";
import { diaUtil, diferencaDias, feriadosDoAno, hojeBR, isoData, paraData, somaDias, type Foro, type Suspensao } from "@/lib/prazos";

/** "Buscar no DJEN agora": a busca roda no servidor em São Paulo */
export function BotaoDjen({ rotulo = "Buscar no DJEN", dias, classe = "btn primary" }: { rotulo?: string; dias?: number; classe?: string }) {
  const { aviso, recarregar } = useDados(); const [ocupado, setOcupado] = useState(false);
  return (
    <button className={classe} disabled={ocupado} onClick={async () => {
      setOcupado(true);
      try {
        const r = await fetch("/api/djen/sincronizar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(dias ? { dias } : {}) }); const j = await r.json().catch(() => ({}));
        if (!r.ok) { aviso(j.erro || "A busca no DJEN falhou. Tente de novo em alguns minutos."); return; }
        await recarregar();
        const extra = j.avisos?.length ? ` Atenção: ${j.avisos.length} variação(ões) com aviso (veja em Configurações).` : "";
        aviso((j.caixa ? `${j.caixa} ${j.caixa === 1 ? "publicação nova na caixa" : "publicações novas na caixa"}${j.analisadas ? `, ${j.analisadas} já analisadas pelo Claude` : ""}.` : "Busca completa: nenhuma publicação nova no DJEN.") + extra);
      } catch { aviso("A busca no DJEN falhou. Verifique a internet."); }
      finally { setOcupado(false); }
    }}>{ocupado ? "Buscando no DJEN…" : rotulo}</button>
  );
}

/** horas desde a última busca completa (ou null se nunca houve) */
function atrasoDjen(dj: Record<string, any>) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const ref = dj.ultimaCompleta || dj.ultimaBusca; if (!ref) return null;
  return (Date.now() - Date.parse(ref)) / 3600e3;
}

/** faixa vermelha no topo de todas as telas quando a busca do DJEN falhou ou parou de rodar: nunca parecer "dia sem publicações" */
export function AlertaDjen() {
  const { config } = useDados(); const dj = config.djen || {};
  const h = atrasoDjen(dj);
  const falhou = dj.ultimoErro && (!dj.ultimaCompleta || Date.parse(dj.ultimoErroEm || 0) > Date.parse(dj.ultimaCompleta));
  const parado = h != null && h > 30;
  if (!falhou && !parado) return null;
  return (
    <div className="banner erro djen-alerta" role="alert">
      <strong>⚠ {falhou ? "A última busca no DJEN falhou" : "A busca no DJEN não roda há " + Math.floor(h!) + " horas"}.</strong>{" "}
      {falhou ? <>Motivo: {dj.ultimoErro}. </> : null}
      Publicações{dj.ultimaCompleta ? ` posteriores a ${dataHoraBR(dj.ultimaCompleta)}` : ""} podem não estar aparecendo — isso NÃO quer dizer que não houve publicação.
      <span style={{ marginLeft: 10 }}><BotaoDjen rotulo="Buscar agora" classe="btn" /></span>
    </div>
  );
}

type Exec = { id: number; em: string; origem: string; ok: boolean; completa: boolean; desde: string | null; ate: string | null; consultas: { termo: string; count: number; baixadas: number; validas: number; ok: boolean; erro?: string; critica?: boolean }[]; novas: number; caixa: number; processos_novos: number; erro: string | null; avisos: string[] };
type Variacao = { tipo: "oab"; numero: string; uf?: string | null } | { tipo: "advogado" | "parte"; nome: string };
const PADRAO: Variacao[] = [
  { tipo: "oab", numero: "58547", uf: "SC" }, { tipo: "oab", numero: "58547", uf: null },
  { tipo: "advogado", nome: "FELIPE DOS PASSOS SILVA" }, { tipo: "advogado", nome: "FELIPE PASSOS SILVA" }, { tipo: "advogado", nome: "FELIPE D. PASSOS SILVA" },
  { tipo: "parte", nome: "PASSOS SOCIEDADE INDIVIDUAL DE ADVOCACIA" }, { tipo: "advogado", nome: "PASSOS SOCIEDADE INDIVIDUAL DE ADVOCACIA" }, { tipo: "parte", nome: "PASSOS SOCIEDADE DE ADVOGADOS" },
];
const rot = (v: Variacao) => v.tipo === "oab" ? `OAB ${v.numero}${v.uf ? "/" + v.uf : " (qualquer UF)"}` : `${v.tipo === "advogado" ? "Advogado(a)" : "Parte"}: ${v.nome}`;

/** Configurações → DJEN: variações buscadas, histórico de cada busca e cobertura dia a dia */
export function PainelDjen() {
  const { config, sb, aviso } = useDados(); const dj = config.djen || {};
  const variacoes: Variacao[] = Array.isArray(dj.variacoes) && dj.variacoes.length ? dj.variacoes : PADRAO;
  const [novo, setNovo] = useState<{ tipo: Variacao["tipo"]; valor: string; uf: string }>({ tipo: "advogado", valor: "", uf: "SC" });
  const [execs, setExecs] = useState<Exec[] | null>(null); const [porDia, setPorDia] = useState<Record<string, number>>({}); const [semTabela, setSemTabela] = useState(false);
  const [aberta, setAberta] = useState<number | null>(null);
  const hoje = hojeBR(); const inicio = isoData(somaDias(paraData(hoje), -30));
  useEffect(() => {
    sb.from("djen_execucoes").select("*").order("em", { ascending: false }).limit(60).then(({ data, error }: { data: Exec[] | null; error: { message: string } | null }) => { if (error) setSemTabela(true); setExecs(data || []); });
    (async () => {
      const c: Record<string, number> = {};
      for (let de = 0; ; de += 1000) { const { data } = await sb.from("publicacoes").select("data").gte("data", inicio).range(de, de + 999); for (const x of data || []) c[x.data] = (c[x.data] || 0) + 1; if (!data || data.length < 1000) break; }
      setPorDia(c);
    })();
  }, [sb, inicio, dj.ultimaBusca]);
  const salvarVar = async (l: Variacao[]) => {
    const { error } = await sb.from("config").upsert({ chave: "djen", valor: { ...dj, variacoes: l } }, { onConflict: "chave" });
    if (error) aviso(msgErro(error)); else aviso("Variações salvas. Valem a partir da próxima busca.");
  };
  // um dia está coberto se alguma busca COMPLETA incluiu aquela data
  const dias = useMemo(() => {
    const out: { d: string; n: number; coberto: boolean }[] = [];
    for (let d = paraData(inicio); isoData(d) <= hoje; d = somaDias(d, 1)) {
      const s = isoData(d); if (!diaUtil(d, "jf") && !diaUtil(d, "tjsc")) continue;
      out.push({ d: s, n: porDia[s] || 0, coberto: (execs || []).some((e) => e.completa && e.desde && e.ate && e.desde <= s && s <= e.ate) });
    }
    return out;
  }, [execs, porDia, inicio, hoje]);
  const ultima = execs?.[0];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div><div style={{ fontWeight: 600, marginBottom: 6 }}>O que a busca procura</div>
        <div className="muted s" style={{ marginBottom: 6 }}>Cada variação é consultada separadamente no DJEN e os resultados são somados sem repetir. As buscas por nome conferem a OAB do advogado na comunicação, para não trazer homônimos.</div>
        <div className="anexos">{variacoes.map((v, i) => <span key={i} className="anexo"><span className="an">{rot(v)}</span>
          {!(v.tipo === "oab" && v.uf === "SC" && v.numero === "58547") && <button className="btn ghost" onClick={() => salvarVar(variacoes.filter((_, j) => j !== i))}>Tirar</button>}</span>)}</div>
        <div className="tools" style={{ marginTop: 8 }}>
          <select value={novo.tipo} onChange={(e) => setNovo({ ...novo, tipo: e.target.value as Variacao["tipo"] })}><option value="advogado">Nome do advogado</option><option value="parte">Nome da parte (sociedade)</option><option value="oab">Número da OAB</option></select>
          <input style={{ flex: 1, minWidth: 200 }} value={novo.valor} placeholder={novo.tipo === "oab" ? "Ex.: 58547" : "Ex.: FELIPE D P SILVA"} onChange={(e) => setNovo({ ...novo, valor: e.target.value })} />
          {novo.tipo === "oab" && <input style={{ width: 70 }} value={novo.uf} placeholder="UF" onChange={(e) => setNovo({ ...novo, uf: e.target.value.toUpperCase().slice(0, 2) })} />}
          <button className="btn" onClick={() => {
            const v = novo.valor.trim(); if (!v) return;
            const x: Variacao = novo.tipo === "oab" ? { tipo: "oab", numero: v.replace(/\D/g, ""), uf: novo.uf.trim() || null } : { tipo: novo.tipo, nome: v.toUpperCase() };
            salvarVar([...variacoes, x]); setNovo({ ...novo, valor: "" });
          }}>Acrescentar</button>
          <button className="reflink" onClick={() => salvarVar(PADRAO)}>Voltar ao padrão</button>
        </div></div>

      <div><div style={{ fontWeight: 600, marginBottom: 6 }}>Cobertura dos últimos 30 dias</div>
        <div className="muted s" style={{ marginBottom: 6 }}>Verde: busca completa, com publicações. Amarelo: busca completa e nenhuma publicação naquele dia útil (raro: confira no DJEN). Vermelho: nenhuma busca completa cobriu o dia.</div>
        {semTabela ? <div className="banner">Falta instalar a etapa 0023 (0023_djen_execucoes.sql) no Supabase para guardar o histórico das buscas.</div>
          : <div className="djen-dias">{dias.map((x) => <span key={x.d} className={"djd " + (!x.coberto ? "red" : x.n ? "ok" : "warn")} title={`${dataBR(x.d)}: ${x.n} publicação(ões) · ${x.coberto ? "coberto por busca completa" : "NÃO coberto"}`}>
            <b>{x.d.slice(8, 10)}/{x.d.slice(5, 7)}</b><span>{x.n}</span></span>)}</div>}
        <div className="tools" style={{ marginTop: 8 }}><BotaoDjen rotulo="Varrer os últimos 30 dias de novo" dias={30} classe="btn" /><span className="muted s">use se algum dia ficou vermelho ou amarelo</span></div></div>

      <div><div style={{ fontWeight: 600, marginBottom: 6 }}>Histórico das buscas</div>
        {execs == null ? <div className="muted">Carregando…</div> : !execs.length ? <div className="muted">{semTabela ? "" : "Ainda não há buscas registradas (começa a partir desta atualização)."}</div> :
          <div className="tscroll"><table className="grid"><thead><tr><th>Quando</th><th>Origem</th><th>Período</th><th>Resultado</th><th className="num">Novas</th><th className="num">Na caixa</th><th /></tr></thead>
            <tbody>{execs.slice(0, 25).map((e) => <Fragment key={e.id}><tr>
              <td className="mono">{dataHoraBR(e.em)}</td><td>{e.origem}</td><td className="mono">{e.desde ? dataBR(e.desde) + " a " + dataBR(e.ate) : "—"}</td>
              <td>{e.completa ? <span className="pill ok">completa</span> : e.ok ? <span className="pill soon">parcial</span> : <span className="pill late">falhou</span>}{e.avisos?.length ? <span className="muted s"> · {e.avisos.length} aviso(s)</span> : null}</td>
              <td className="num">{e.novas}</td><td className="num">{e.caixa}</td><td><button className="reflink" onClick={() => setAberta(aberta === e.id ? null : e.id)}>{aberta === e.id ? "fechar" : "detalhes"}</button></td></tr>
              {aberta === e.id && <tr><td colSpan={7}><div className="s" style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {e.erro && <div style={{ color: "var(--late)" }}>Erro: {e.erro}</div>}
                {(e.consultas || []).map((c, i) => <div key={i}>{c.ok ? "✓" : "✗"} {c.termo}: o DJEN informou {c.count}, vieram {c.baixadas}{c.validas !== c.baixadas ? `, ${c.validas} nossas` : ""}{c.erro ? ` — ${c.erro}` : ""}</div>)}
                {(e.avisos || []).map((a, i) => <div key={"a" + i} className="muted">• {a}</div>)}
              </div></td></tr>}</Fragment>)}</tbody></table></div>}
        {ultima && !ultima.completa && <div className="banner erro" style={{ marginTop: 8 }}>A última busca não foi completa. O período dela será buscado de novo automaticamente na próxima rodada.</div>}
      </div>
    </div>
  );
}

/** Configurações → feriados e suspensões que entram na contagem dos prazos */
export function PainelFeriados() {
  const { config, sb, aviso } = useDados(); const lista: Suspensao[] = config.suspensoes?.lista || [];
  const [f, setF] = useState<{ ini: string; fim: string; foro: Foro | "todos"; cidade: string; descricao: string }>({ ini: "", fim: "", foro: "todos", cidade: "", descricao: "" });
  const salvar = async (l: Suspensao[]) => {
    const { error } = await sb.from("config").upsert({ chave: "suspensoes", valor: { lista: l } }, { onConflict: "chave" });
    if (error) aviso(msgErro(error)); else aviso("Salvo. Os prazos novos já contam com essa data.");
  };
  const hoje = hojeBR(); const ano = +hoje.slice(0, 4);
  const proximos = (foro: Foro) => [...feriadosDoAno(ano, foro), ...feriadosDoAno(ano + 1, foro)].filter(([d]) => d >= hoje && diferencaDias(d, hoje) <= 120).sort(([a], [b]) => a.localeCompare(b));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="muted s">Já entram sozinhos: fins de semana, feriados nacionais, Carnaval, Semana Santa e Corpus Christi (calculados para cada ano), o recesso de 20/12 a 20/01 e, conforme o processo, os feriados da Justiça Federal (Lei 5.010/66: quarta-feira santa, 11/08 e 01/11) ou do TJSC (Dia do Servidor, 28/10). Cadastre aqui feriados municipais, portarias de suspensão de expediente e indisponibilidade do eproc.</div>
      <div className="form2" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))" }}>
        <label className="f">De<input type="date" value={f.ini} onChange={(e) => setF({ ...f, ini: e.target.value })} /></label>
        <label className="f">Até (opcional)<input type="date" value={f.fim} min={f.ini} onChange={(e) => setF({ ...f, fim: e.target.value })} /></label>
        <label className="f">Vale para<select value={f.foro} onChange={(e) => setF({ ...f, foro: e.target.value as Foro | "todos" })}><option value="todos">Todos os processos</option><option value="jf">Justiça Federal</option><option value="tjsc">TJSC</option></select></label>
        <label className="f">Cidade (opcional)<input value={f.cidade} placeholder="Ex.: Joinville" onChange={(e) => setF({ ...f, cidade: e.target.value })} /></label>
        <label className="f full">Motivo<input value={f.descricao} placeholder="Ex.: Aniversário de Joinville (feriado municipal) · Portaria nº…" onChange={(e) => setF({ ...f, descricao: e.target.value })} /></label>
      </div>
      <div className="tools"><button className="btn primary" onClick={() => {
        if (!f.ini || !f.descricao.trim()) { aviso("Informe a data e o motivo."); return; }
        salvar([...lista, { ini: f.ini, fim: f.fim || null, foro: f.foro, cidade: f.cidade.trim() || null, descricao: f.descricao.trim() }].sort((a, b) => a.ini.localeCompare(b.ini)));
        setF({ ini: "", fim: "", foro: "todos", cidade: "", descricao: "" });
      }}>Acrescentar</button></div>
      {lista.length > 0 && <div className="rows">{lista.map((x, i) => <div key={i} className="row"><span className="pill acc">{dataBR(x.ini)}{x.fim && x.fim !== x.ini ? " a " + dataBR(x.fim) : ""}</span>
        <div className="main"><div className="t">{x.descricao}</div><div className="s">{x.foro === "todos" ? "todos os processos" : x.foro === "jf" ? "Justiça Federal" : "TJSC"}{x.cidade ? " · " + x.cidade : ""}</div></div>
        <button className="btn ghost" onClick={() => salvar(lista.filter((_, j) => j !== i))}>Tirar</button></div>)}</div>}
      <div className="form2" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {(["jf", "tjsc"] as Foro[]).map((fo) => <div key={fo}><div style={{ fontWeight: 600, marginBottom: 4 }}>Próximos dias sem prazo · {fo === "jf" ? "Justiça Federal" : "TJSC"}</div>
          {proximos(fo).map(([d, m]) => <div key={d} className="s"><span className="mono">{dataBR(d)}</span> · {m}</div>)}</div>)}
      </div>
    </div>
  );
}
