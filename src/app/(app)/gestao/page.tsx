"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDados } from "@/lib/dados";
import { dataBR, dataHoraBR, semAcento } from "@/lib/formato";
import { dataValida, diferencaDias, hojeBR, isoData, paraData, situacaoPrazo, somaDias } from "@/lib/prazos";
import type { Tarefa } from "@/lib/tipos";
import { usePartes } from "@/components/tarefas";
import { useJanelas } from "@/components/janelas";
import { Avatar, ChipResp, Ic, baixar } from "@/components/ui";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const diaLocal = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }) : "");
type G = { modo: "dia" | "mes" | "ano"; ref: string; pessoa: string; lista: "pend" | "atras" | "conc" };

function periodo(g: G) {
  const d = paraData(g.ref); const y = d.getUTCFullYear(), m = d.getUTCMonth();
  if (g.modo === "dia") return { ini: g.ref, fim: g.ref, rot: d.toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long", year: "numeric" }) };
  if (g.modo === "mes") return { ini: isoData(new Date(Date.UTC(y, m, 1))), fim: isoData(new Date(Date.UTC(y, m + 1, 0))), rot: MESES[m] + " de " + y };
  return { ini: y + "-01-01", fim: y + "-12-31", rot: "Ano de " + y };
}
function mover(g: G, s: number): string {
  const d = paraData(g.ref);
  if (g.modo === "dia") return isoData(somaDias(d, s));
  if (g.modo === "mes") return isoData(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + s, 1)));
  return isoData(new Date(Date.UTC(d.getUTCFullYear() + s, 0, 1)));
}
function numeros(ts: Tarefa[], ini: string, fim: string, t0: string) {
  const pend = ts.filter((t) => t.status !== "feito" && t.vencimento && t.vencimento >= ini && t.vencimento <= fim);
  const atras = pend.filter((t) => t.vencimento! < t0);
  const conc = ts.filter((t) => t.status === "feito" && ((x) => x >= ini && x <= fim)(diaLocal(t.feito_em)));
  const venceram = ts.filter((t) => t.vencimento && t.vencimento >= ini && t.vencimento <= fim && t.vencimento < t0);
  const ok = venceram.filter((t) => t.status === "feito" && diaLocal(t.feito_em) <= t.vencimento!);
  return { pend, atras, conc, venceram, taxa: venceram.length ? Math.round((ok.length / venceram.length) * 100) : null };
}

function Grafico({ ts, ini, fim, modo }: { ts: Tarefa[]; ini: string; fim: string; modo: "mes" | "ano" }) {
  // o gráfico acompanha a largura da tela (e do zoom)
  const caixa = useRef<HTMLDivElement>(null); const [cw, setCw] = useState(0);
  useEffect(() => { const el = caixa.current; if (!el) return; const ro = new ResizeObserver(() => setCw(Math.floor(el.clientWidth))); ro.observe(el); return () => ro.disconnect(); }, []);
  const chaves: string[] = [];
  if (modo === "mes") { let d = paraData(ini); while (isoData(d) <= fim) { chaves.push(isoData(d)); d = somaDias(d, 1); } } else for (let m = 1; m <= 12; m++) chaves.push(ini.slice(0, 4) + "-" + String(m).padStart(2, "0"));
  const k = (x: string) => (modo === "mes" ? x : x.slice(0, 7)); const t0 = hojeBR();
  const conc: Record<string, number> = Object.fromEntries(chaves.map((c) => [c, 0])), venc: Record<string, number> = Object.fromEntries(chaves.map((c) => [c, 0]));
  for (const t of ts) { if (t.status === "feito") { const c = k(diaLocal(t.feito_em)); if (c in conc) conc[c]++; } else if (t.vencimento && t.vencimento < t0) { const c = k(t.vencimento); if (c in venc) venc[c]++; } }
  const max = Math.max(1, ...chaves.map((c) => Math.max(conc[c], venc[c]))); const W = Math.max(520, chaves.length * 26, cw), H = 200, pb = 26, pt = 12, pl = 28;
  const bw = (W - pl) / chaves.length; const y = (v: number) => H - pb - (v / max) * (H - pb - pt); const passo = max <= 5 ? 1 : Math.ceil(max / 4);
  const grades = []; for (let v = 0; v <= max; v += passo) grades.push(v);
  return (
    <section className="panel"><div className="ph"><h3>{modo === "mes" ? "Dia a dia" : "Mês a mês"}</h3><span className="legenda"><span className="lg ok">Concluídas</span><span className="lg late">Vencidas sem cumprir</span></span></div>
      <div className="tscroll" style={{ padding: "12px 16px" }}><div className="gchart" ref={caixa}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={"Tarefas concluídas e vencidas por " + (modo === "mes" ? "dia" : "mês")}>
          {grades.map((v) => <g key={v}><line x1={pl} x2={W} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={pl - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{v}</text></g>)}
          {chaves.map((c, i) => { const x0 = pl + i * bw + bw * 0.15, w = Math.max(3, (bw * 0.7 - 2) / 2); const rot = modo === "mes" ? dataBR(c) : MESES[+c.slice(5, 7) - 1] + " " + c.slice(0, 4);
            const lbl = modo === "mes" ? (+c.slice(8, 10) % 5 === 1 || chaves.length < 12 ? c.slice(8, 10) : "") : MESES[+c.slice(5, 7) - 1].slice(0, 3);
            return <g key={c}>
              {conc[c] > 0 && <rect x={x0} y={y(conc[c])} width={w} height={H - pb - y(conc[c])} rx="2" fill="var(--ok)"><title>{rot}: {conc[c]} concluída(s)</title></rect>}
              {venc[c] > 0 && <rect x={x0 + w + 2} y={y(venc[c])} width={w} height={H - pb - y(venc[c])} rx="2" fill="var(--late)"><title>{rot}: {venc[c]} vencida(s) sem cumprir</title></rect>}
              {lbl && <text x={pl + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize="10" fill="var(--muted)">{lbl}</text>}</g>; })}
        </svg></div></div></section>
  );
}

type Visao = "prod" | "atraso" | "pend" | "atrasadas" | "acessos";
type Acesso = { usuario: string; dia: string; primeiro: string; ultimo: string; segundos: number };
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const tempo = (s: number) => { const m = Math.round(s / 60); return m < 1 ? "menos de 1 min" : m < 60 ? m + " min" : Math.floor(m / 60) + "h" + String(m % 60).padStart(2, "0"); };
const VISOES: Record<Visao, string> = { prod: "Produtividade (concluídas)", atraso: "Concluídas em atraso", pend: "Pendentes no prazo", atrasadas: "Atrasadas (não cumpridas)", acessos: "Acessos ao sistema (entrada e saída)" };
const PRESETS: [string, () => [string, string]][] = [
  ["Hoje", () => [hojeBR(), hojeBR()]],
  ["Esta semana", () => { const d = paraData(hojeBR()); const w = (d.getUTCDay() + 6) % 7; return [isoData(somaDias(d, -w)), isoData(somaDias(d, 6 - w))]; }],
  ["Este mês", () => { const d = paraData(hojeBR()); return [isoData(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))), isoData(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)))]; }],
  ["Mês passado", () => { const d = paraData(hojeBR()); return [isoData(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))), isoData(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)))]; }],
  ["Este ano", () => { const y = hojeBR().slice(0, 4); return [y + "-01-01", y + "-12-31"]; }],
];
/** "2 dias 23 horas" */
function duracao(ms: number) {
  if (!isFinite(ms) || ms <= 0) return "—";
  const h = Math.round(ms / 3600000); const d = Math.floor(h / 24), r = h % 24;
  return d ? `${d} ${d === 1 ? "dia" : "dias"}${r ? ` ${r} ${r === 1 ? "hora" : "horas"}` : ""}` : `${r || 1} ${r === 1 ? "hora" : "horas"}`;
}
/** classifica as tarefas do período nos quatro grupos do gráfico */
function grupos(ts: Tarefa[], ini: string, fim: string, t0: string) {
  const dentro = (x?: string | null) => !!x && x >= ini && x <= fim;
  const conc = ts.filter((t) => t.status === "feito" && dentro(diaLocal(t.feito_em)));
  const emDia = conc.filter((t) => !t.vencimento || diaLocal(t.feito_em) <= t.vencimento);
  const emAtraso = conc.filter((t) => t.vencimento && diaLocal(t.feito_em) > t.vencimento);
  const abertas = ts.filter((t) => t.status !== "feito" && dentro(t.vencimento));
  const pend = abertas.filter((t) => t.vencimento! >= t0); const atrasadas = abertas.filter((t) => t.vencimento! < t0);
  const venceram = ts.filter((t) => dentro(t.vencimento) && t.vencimento! < t0);
  const ok = venceram.filter((t) => t.status === "feito" && diaLocal(t.feito_em) <= t.vencimento!);
  return { conc, emDia, emAtraso, pend, atrasadas, taxa: venceram.length ? Math.round((ok.length / venceram.length) * 100) : null };
}

function Rosca({ fatias, centro, sub }: { fatias: { v: number; cor: string; nome: string }[]; centro: string; sub: string }) {
  const tot = fatias.reduce((s, f) => s + f.v, 0); const R = 70, C = 2 * Math.PI * R; let acc = 0;
  return (
    <svg viewBox="0 0 200 200" width="190" height="190" role="img" aria-label={fatias.map((f) => `${f.nome}: ${f.v}`).join(", ")}>
      <circle cx="100" cy="100" r={R} fill="none" stroke="var(--line)" strokeWidth="26" />
      {tot > 0 && fatias.filter((f) => f.v > 0).map((f) => { const len = (f.v / tot) * C; const el = <circle key={f.nome} cx="100" cy="100" r={R} fill="none" stroke={f.cor} strokeWidth="26" strokeDasharray={`${Math.max(0, len - 2)} ${C}`} strokeDashoffset={-acc} transform="rotate(-90 100 100)"><title>{f.nome}: {f.v}</title></circle>; acc += len; return el; })}
      <text x="100" y="98" textAnchor="middle" fontSize="34" fontWeight="700" fill="var(--fg)">{centro}</text>
      <text x="100" y="118" textAnchor="middle" fontSize="10" fill="var(--muted)">{sub}</text>
    </svg>
  );
}

export default function Gestao() {
  const { tarefas, equipe, titular, nome, processos, v, sb, online, eu, aviso } = useDados(); const [gerandoPdf, setGerandoPdf] = useState(false); const partes = usePartes(); const j = useJanelas();
  const [per, setPer] = useState<[string, string]>(PRESETS[2][1]()); const [rascunho, setRascunho] = useState<[string, string]>(per);
  const [pessoa, setPessoa] = useState(""); const [visao, setVisao] = useState<Visao>("prod"); const [q, setQ] = useState("");
  const [ord, setOrd] = useState<"conclusao" | "prazo" | "cliente">("conclusao"); const [filtro, setFiltro] = useState(false); const [busca, setBusca] = useState(false);
  const t0 = hojeBR();
  const [acessos, setAcessos] = useState<Acesso[] | null>(null);
  useEffect(() => {
    if (visao !== "acessos") return; let vivo = true; setAcessos(null);
    let qy = sb.from("acessos").select("*").gte("dia", per[0]).lte("dia", per[1]).order("dia", { ascending: false }).limit(5000);
    if (pessoa) qy = qy.eq("usuario", pessoa);
    qy.then(({ data }: { data: Acesso[] | null }) => { if (vivo) setAcessos(data || []); }, () => vivo && setAcessos([]));
    return () => { vivo = false; };
  }, [visao, per, pessoa, sb]);
  const listaAc = useMemo(() => {
    const qq = semAcento(q.trim()); let l = acessos || [];
    if (qq) l = l.filter((a) => semAcento(nome(a.usuario)).includes(qq));
    return [...l].sort(ord === "cliente" ? (a, b) => nome(a.usuario).localeCompare(nome(b.usuario)) || b.dia.localeCompare(a.dia) : ord === "prazo" ? (a, b) => a.primeiro.localeCompare(b.primeiro) : (a, b) => b.dia.localeCompare(a.dia) || a.primeiro.slice(11).localeCompare(b.primeiro.slice(11)));
  }, [acessos, q, ord]); // eslint-disable-line react-hooks/exhaustive-deps
  const agoraNoSistema = (a: Acesso) => a.dia === t0 && online.has(a.usuario);
  const todas = useMemo(() => [...tarefas.values()], [tarefas, v]); // eslint-disable-line react-hooks/exhaustive-deps
  const ts = pessoa ? todas.filter((t) => t.responsavel === pessoa) : todas;
  const G = grupos(ts, per[0], per[1], t0);
  const atrasoPorPessoa = useMemo(() => equipe.map((p) => ({ id: p.id, n: todas.filter((t) => t.responsavel === p.id && t.status !== "feito" && t.vencimento && t.vencimento < t0).length }))
    .filter((x) => x.n).sort((a, b) => b.n - a.n), [equipe, todas, t0]);
  const mediaCumpr = G.conc.length ? G.conc.reduce((s, t) => s + (new Date(t.feito_em!).getTime() - new Date(t.criado_em).getTime()), 0) / G.conc.length : NaN;
  const mediaAtraso = G.emAtraso.length ? G.emAtraso.reduce((s, t) => s + (new Date(t.feito_em!).getTime() - new Date(t.vencimento + "T23:59:59-03:00").getTime()), 0) / G.emAtraso.length : NaN;
  const base = { prod: G.conc, atraso: G.emAtraso, pend: G.pend, atrasadas: G.atrasadas }[visao as Exclude<Visao, "acessos">] ?? [];
  const lista = useMemo(() => {
    const qq = semAcento(q.trim()); let l = base;
    if (qq) l = l.filter((t) => { const pt = partes(t); return semAcento(t.descricao + " " + pt.cli + " " + pt.reus.join(" ")).includes(qq) || (t.processo_numero || "").includes(qq.replace(/\D/g, "") || "#"); });
    const by = { conclusao: (a: Tarefa, b: Tarefa) => (b.feito_em || b.vencimento || "").localeCompare(a.feito_em || a.vencimento || ""), prazo: (a: Tarefa, b: Tarefa) => (a.vencimento || "9").localeCompare(b.vencimento || "9"), cliente: (a: Tarefa, b: Tarefa) => partes(a).cli.localeCompare(partes(b).cli) };
    return [...l].sort(visao === "pend" || visao === "atrasadas" ? (ord === "conclusao" ? by.prazo : by[ord]) : by[ord]);
  }, [base, q, ord, visao]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!titular) return <div className="empty">A tela de Gestão é do titular do escritório.</div>;
  const linhas = equipe.map((p) => ({ p, n: grupos(todas.filter((t) => t.responsavel === p.id), per[0], per[1], t0) })).filter(({ n }) => n.conc.length || n.pend.length || n.atrasadas.length);
  const exportar = () => {
    const esc = (s: unknown) => '"' + String(s ?? "").replace(/"/g, '""') + '"';
    if (visao === "acessos") {
      const out = [["Colaborador", "Dia", "Primeiro acesso", "Último uso (provável saída)", "Tempo ativo no sistema"].map(esc).join(";")];
      for (const a of listaAc) out.push([nome(a.usuario), dataBR(a.dia), hora(a.primeiro), agoraNoSistema(a) ? "no sistema agora" : hora(a.ultimo), tempo(a.segundos)].map(esc).join(";"));
      baixar(`acessos-${per[0]}-a-${per[1]}.csv`, "\ufeff" + out.join("\r\n"), "text/csv;charset=utf-8"); return;
    }
    const out = [["Responsável", "Cliente", "Réus", "Processo", "Tarefa", "Prazo", "Conclusão", "Situação"].map(esc).join(";")];
    for (const t of lista) { const pt = partes(t); const p = t.processo_numero ? processos.get(t.processo_numero) : undefined;
      out.push([nome(t.responsavel), pt.cli, pt.reus.join(" / "), p?.mascara || "", t.descricao, dataBR(t.vencimento), t.feito_em ? dataHoraBR(t.feito_em) : "", situacao(t).txt].map(esc).join(";")); }
    baixar(`gestao-${per[0]}-a-${per[1]}.csv`, "\ufeff" + out.join("\r\n"), "text/csv;charset=utf-8");
  };
  const relatorioPdf = async () => {
    setGerandoPdf(true);
    try {
      const { pdfRelatorio } = await import("@/lib/relatorioPdf");
      const pp = pessoa ? equipe.find((x) => x.id === pessoa) : null;
      const hoje = t0; const m0 = hoje.slice(0, 7) + "-01"; const d0 = paraData(hoje);
      const m1 = isoData(new Date(Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth() + 1, 0)));
      const concEm = (a: string, b: string) => ts.filter((t) => t.status === "feito" && ((x) => x >= a && x <= b)(diaLocal(t.feito_em))).length;
      // acessos ao sistema no período (só quando o relatório é de uma pessoa)
      let ac: { dias: number; tempo: string; entradaMedia: string; saidaMedia: string } | null = null;
      if (pessoa) {
        const { data } = await sb.from("acessos").select("*").eq("usuario", pessoa).gte("dia", per[0]).lte("dia", per[1]).limit(2000);
        const l = (data || []) as Acesso[];
        if (l.length) {
          const min = (iso: string) => { const [h, m] = hora(iso).split(":").map(Number); return h * 60 + m; };
          const hm = (x: number) => String(Math.floor(x / 60)).padStart(2, "0") + ":" + String(Math.round(x % 60)).padStart(2, "0");
          ac = { dias: l.length, tempo: tempo(l.reduce((s2, a) => s2 + (a.segundos || 0), 0)), entradaMedia: hm(l.reduce((s2, a) => s2 + min(a.primeiro), 0) / l.length), saidaMedia: hm(l.reduce((s2, a) => s2 + min(a.ultimo), 0) / l.length) };
        }
      }
      // série para o gráfico: dia a dia (até 2 meses) ou mês a mês
      const dias = diferencaDias(per[1], per[0]); const porDia = dias <= 62;
      const chaves: string[] = [];
      if (dias <= 400) { if (porDia) { let d = paraData(per[0]); while (isoData(d) <= per[1]) { chaves.push(isoData(d)); d = somaDias(d, 1); } } else { let d = paraData(per[0].slice(0, 7) + "-01"); while (isoData(d) <= per[1]) { chaves.push(isoData(d).slice(0, 7)); d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); } } }
      const k = (x: string) => (porDia ? x : x.slice(0, 7));
      const cont: Record<string, { n: number; venc: number }> = Object.fromEntries(chaves.map((c) => [c, { n: 0, venc: 0 }]));
      for (const t of ts) { if (t.status === "feito") { const c = k(diaLocal(t.feito_em)); if (cont[c]) cont[c].n++; } else if (t.vencimento && t.vencimento < t0) { const c = k(t.vencimento); if (cont[c]) cont[c].venc++; } }
      const tipos = new Map<string, { conc: number; atraso: number }>();
      for (const t of G.conc) { const tp = t.tipo || "Outras"; const x = tipos.get(tp) || { conc: 0, atraso: 0 }; x.conc++; if (t.vencimento && diaLocal(t.feito_em) > t.vencimento) x.atraso++; tipos.set(tp, x); }
      const linha = (t: Tarefa) => { const pt = partes(t); const st = situacao(t); return { cliente: pt.cli || "—", tarefa: t.descricao, prazo: dataBR(t.vencimento), conclusao: t.feito_em ? dataHoraBR(t.feito_em).slice(0, 16) : "", situacao: st.txt, atraso: st.cls === "late", responsavel: nome(t.responsavel).split(" ")[0] }; };
      const bytes = await pdfRelatorio({
        periodo: rotPer, emitidoPor: nome(eu.id),
        pessoa: pp ? { nome: pp.nome, funcao: pp.funcao, foto: pp.foto } : null,
        hoje: { rot: dataBR(hoje).slice(0, 5), n: concEm(hoje, hoje) }, mes: { rot: MESES[d0.getUTCMonth()] + "/" + d0.getUTCFullYear(), n: concEm(m0, m1) },
        conc: G.conc.length, emDia: G.emDia.length, emAtraso: G.emAtraso.length, pend: G.pend.length, atrasadas: G.atrasadas.length, taxa: G.taxa,
        mediaCumpr: duracao(mediaCumpr), mediaAtraso: duracao(mediaAtraso), acessos: ac,
        serie: chaves.map((c) => ({ rot: porDia ? c.slice(8, 10) : MESES[+c.slice(5, 7) - 1].slice(0, 3), n: cont[c].n, venc: cont[c].venc })), serieTitulo: porDia ? "Concluídas dia a dia" : "Concluídas mês a mês",
        porTipo: [...tipos.entries()].map(([tipo, x]) => ({ tipo, ...x })).sort((a, b) => b.conc - a.conc).slice(0, 20),
        porPessoa: pessoa ? [] : linhas.map(({ p: pe, n }) => ({ nome: pe.nome, emDia: n.emDia.length, emAtraso: n.emAtraso.length, pend: n.pend.length, atrasadas: n.atrasadas.length, taxa: n.taxa })),
        concluidas: [...G.conc].sort((a, b) => (b.feito_em || "").localeCompare(a.feito_em || "")).map(linha),
        atrasadasLista: [...G.atrasadas].sort((a, b) => (a.vencimento || "").localeCompare(b.vencimento || "")).map(linha),
      });
      const quem = (pp?.nome || "equipe").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
      baixar(`Relatorio_${quem}_${per[0]}_a_${per[1]}.pdf`, new Blob([bytes as BlobPart], { type: "application/pdf" }));
    } catch (e) { aviso("Não consegui gerar o relatório: " + (e as Error).message); }
    finally { setGerandoPdf(false); }
  };
  function situacao(t: Tarefa): { cls: string; txt: string } {
    if (t.status === "feito") { const fd = diaLocal(t.feito_em); return t.vencimento && fd > t.vencimento ? { cls: "late", txt: `${diferencaDias(fd, t.vencimento)} dia(s) de atraso` } : { cls: "ok", txt: "no prazo" }; }
    const s = situacaoPrazo(t.vencimento); return { cls: s.cor, txt: s.texto };
  }
  const rotPer = per[0] === per[1] ? dataBR(per[0]) : `${dataBR(per[0])} a ${dataBR(per[1])}`;
  const fatias = [{ v: G.emDia.length, cor: "var(--ok)", nome: "Concluídas em dia" }, { v: G.emAtraso.length, cor: "var(--soon)", nome: "Concluídas em atraso" }, { v: G.pend.length, cor: "var(--accent)", nome: "Pendentes" }, { v: G.atrasadas.length, cor: "var(--late)", nome: "Atrasadas" }];
  const visaoDe: Record<string, Visao> = { "Concluídas em dia": "prod", "Concluídas em atraso": "atraso", Pendentes: "pend", Atrasadas: "atrasadas" };
  return (
    <>
      <div className="pg-title"><h2>Gestão</h2><span className="muted">{rotPer}{pessoa ? " · " + nome(pessoa) : " · toda a equipe"}</span></div>
      <div className="gs-top">
        <section className="panel gs-rosca">
          <Rosca fatias={fatias} centro={G.taxa == null ? "—" : G.taxa + "%"} sub="cumpridas no prazo" />
          <div className="gs-leg">{fatias.map((f) => <button key={f.nome} className={"gs-li" + (visao === visaoDe[f.nome] ? " on" : "")} onClick={() => setVisao(visaoDe[f.nome])}>
            <span className="gs-dot" style={{ background: f.cor }} /><span className="gs-ln">{f.nome}</span><strong>{f.v}</strong></button>)}</div>
        </section>
        <section className="panel gs-lado">
          <div className="gs-rot">Colaboradores com mais tarefas atrasadas</div>
          <div className="gs-avs">{atrasoPorPessoa.length ? atrasoPorPessoa.map((x) => <button key={x.id} className="gs-av" title={`${nome(x.id)}: ${x.n} atrasada(s) — ver`} onClick={() => { setPessoa(x.id); setVisao("atrasadas"); setPer(["2000-01-01", t0]); setRascunho(["2000-01-01", t0]); }}>
            <Avatar id={x.id} /><span className="gs-badge">{x.n}</span></button>) : <span className="muted">Ninguém com tarefa atrasada. 🎉</span>}</div>
          <div className="gs-rot" style={{ marginTop: 14 }}>Agilidade{pessoa ? " de " + nome(pessoa).split(" ")[0] : " geral"} no período</div>
          <div className="gs-ag">
            <div className="gs-relogio" aria-hidden="true">⏱</div>
            <div><div className="gs-num">{duracao(mediaCumpr)}</div><div className="muted s">média de cumprimento (da criação à conclusão)</div></div>
            <div className="gs-sep" />
            <div><div className="gs-num late">{duracao(mediaAtraso)}</div><div className="muted s">média de atraso nas concluídas fora do prazo</div></div>
          </div>
        </section>
      </div>
      {linhas.length > 1 && !pessoa && <section className="panel tscroll"><table className="grid gtab"><thead><tr>{["Colaborador", "Concluídas em dia", "Em atraso", "Pendentes", "Atrasadas", "No prazo"].map((t) => <th key={t}>{t}</th>)}</tr></thead>
        <tbody>{linhas.map(({ p, n }) => <tr key={p.id} className="click" onClick={() => setPessoa(p.id)}><td><ChipResp id={p.id} /></td><td className="num">{n.emDia.length}</td><td className="num">{n.emAtraso.length || "—"}</td><td className="num">{n.pend.length}</td>
          <td className={"num" + (n.atrasadas.length ? " fatal" : "")}>{n.atrasadas.length || "—"}</td><td>{n.taxa == null ? <span className="muted">—</span> : <span className={"pill " + (n.taxa >= 90 ? "ok" : n.taxa >= 70 ? "soon" : "late")}>{n.taxa}%</span>}</td></tr>)}</tbody></table></section>}
      <div className="gs-bar">
        <label className="gs-sel"><select value={visao} onChange={(e) => setVisao(e.target.value as Visao)}>{(Object.keys(VISOES) as Visao[]).map((k) => <option key={k} value={k}>{VISOES[k]}</option>)}</select></label>
        <label className="gs-sel"><select value={pessoa} onChange={(e) => setPessoa(e.target.value)}><option value="">Toda a equipe</option>{equipe.map((p) => <option key={p.id} value={p.id}>{p.nome.toUpperCase()}</option>)}</select></label>
        {busca || q ? <input className="gs-busca" autoFocus value={q} placeholder={visao === "acessos" ? "Nome do colaborador" : "Cliente, tarefa ou nº do processo"} onChange={(e) => setQ(e.target.value)} onBlur={() => !q && setBusca(false)} />
          : <button className="gs-b" onClick={() => setBusca(true)}>{Ic.busca} Buscar</button>}
        <div className="gs-pop-w">
          <button className={"gs-b" + (filtro ? " on" : "")} onClick={() => { setRascunho(per); setFiltro(!filtro); }}>{Ic.filtro} Filtrar <span className="muted">· {rotPer}</span></button>
          {filtro && <div className="gs-pop" role="dialog" aria-label="Filtrar dados">
            <div className="gs-pop-h"><strong>Filtrar dados</strong><button className="icb" aria-label="Fechar" onClick={() => setFiltro(false)}>✕</button></div>
            <div className="gs-presets">{PRESETS.map(([n, f]) => <button key={n} className="pill" onClick={() => setRascunho(f())}>{n}</button>)}</div>
            <div className="gs-datas"><label className="f">De<input type="date" value={rascunho[0]} onChange={(e) => setRascunho([e.target.value, rascunho[1]])} /></label>
              <label className="f">Até<input type="date" value={rascunho[1]} onChange={(e) => setRascunho([rascunho[0], e.target.value])} /></label></div>
            <div className="tools" style={{ justifyContent: "flex-end" }}><button className="reflink" onClick={() => { const x = PRESETS[2][1](); setRascunho(x); setPer(x); setFiltro(false); }}>Limpar filtros</button>
              <button className="btn primary" onClick={() => { if (dataValida(rascunho[0]) && dataValida(rascunho[1]) && rascunho[0] <= rascunho[1]) { setPer(rascunho); setFiltro(false); } }}>Aplicar filtros</button></div>
          </div>}
        </div>
        <label className="gs-b gs-ord">Ordenar<select value={ord} onChange={(e) => setOrd(e.target.value as typeof ord)}>{visao === "acessos" ? <><option value="conclusao">por dia</option><option value="prazo">por horário de entrada</option><option value="cliente">por colaborador</option></>
          : <><option value="conclusao">{visao === "pend" || visao === "atrasadas" ? "por prazo" : "por conclusão"}</option><option value="prazo">por prazo</option><option value="cliente">por cliente</option></>}</select></label>
        <button className="gs-b" onClick={exportar}>{Ic.exportar} Exportar planilha</button>
        <button className="btn primary" disabled={gerandoPdf} onClick={relatorioPdf}>{gerandoPdf ? "Gerando…" : "📄 Relatório em PDF"}</button>
      </div>
      {visao === "acessos" ? <section className="panel tscroll">
        {acessos == null ? <div className="empty">Carregando acessos…</div> : listaAc.length ? <table className="grid gs-tab"><thead><tr><th style={{ width: 52 }} /><th>Colaborador</th><th>Dia</th><th>Primeiro acesso</th><th>Último uso <span className="muted">(provável saída)</span></th><th>Tempo ativo</th></tr></thead>
          <tbody>{listaAc.map((a) => <tr key={a.usuario + a.dia}>
            <td><Avatar id={a.usuario} /></td><td className="gs-cli">{nome(a.usuario)}</td>
            <td className="mono">{dataBR(a.dia)} <span className="muted s">{paraData(a.dia).toLocaleDateString("pt-BR", { timeZone: "UTC", weekday: "short" })}</span></td>
            <td className="mono">{hora(a.primeiro)}</td>
            <td className="mono">{agoraNoSistema(a) ? <span className="pill ok">no sistema agora</span> : hora(a.ultimo)}</td>
            <td className="mono">{tempo(a.segundos)}</td></tr>)}</tbody></table>
          : <div className="empty">Nenhum acesso registrado em {rotPer}. O registro começou a valer a partir da atualização de 21/10/2026.</div>}
        <div className="muted s" style={{ padding: "8px 14px 12px" }}>O sistema anota o horário enquanto a aba está aberta e na frente; o “último uso” é o último minuto em que a pessoa estava com o sistema aberto. O tempo ativo soma só os minutos com a aba visível.</div>
      </section> : <section className="panel tscroll">
        {lista.length ? <table className="grid gs-tab"><thead><tr><th style={{ width: 52 }} /><th>Cliente</th><th>Tarefa</th><th>Situação</th><th>Data compromisso</th><th>Conclusão</th></tr></thead>
          <tbody>{lista.slice(0, 500).map((t) => { const pt = partes(t); const s = situacao(t); return (
            <tr key={t.id} className="click" tabIndex={0} onClick={() => j.abrirTarefa(t.id)} onKeyDown={(e) => { if (e.key === "Enter") j.abrirTarefa(t.id); }}>
              <td><Avatar id={t.responsavel} /></td>
              <td><div className="gs-cli">{(pt.cli || "—").toUpperCase()}</div>{pt.reus.map((r, i) => <div key={i} className="gs-reu">{r.toUpperCase()}</div>)}</td>
              <td className="gs-tar">{t.descricao}</td>
              <td><span className={"pill " + s.cls}>{s.txt}</span></td>
              <td className="mono">{dataBR(t.vencimento)}</td>
              <td className="mono">{t.feito_em ? dataHoraBR(t.feito_em) : <span className="muted">—</span>}</td>
            </tr>); })}</tbody></table>
          : <div className="empty">Nenhuma tarefa {VISOES[visao].toLowerCase()} em {rotPer}.</div>}
        {lista.length > 500 && <div className="muted" style={{ padding: 12 }}>Mostrando 500 de {lista.length}. Use o filtro ou exporte.</div>}
      </section>}
      {per[0] !== per[1] && diferencaDias(per[1], per[0]) <= 400 && <Grafico ts={ts} ini={per[0]} fim={per[1]} modo={diferencaDias(per[1], per[0]) <= 62 ? "mes" : "ano"} />}
    </>
  );
}
