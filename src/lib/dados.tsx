"use client";
// Dados de trabalho do escritório carregados uma vez no navegador e mantidos em dia
// pelo tempo real do Supabase: qualquer alteração de um colega aparece na hora.
// As permissões continuam no banco (RLS e gatilhos); aqui só se lê e se grava.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabaseNavegador } from "./supabase/client";
import type { Aviso, Caso, Cliente, Documento, Mensagem, Notificacao, Perfil, Processo, Publicacao, Tarefa } from "./tipos";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Linha = Record<string, any>;
export type Mapas = {
  processos: Map<string, Processo>; clientes: Map<string, Cliente>; tarefas: Map<string, Tarefa>; caixa: Map<number, Publicacao>;
  casos: Map<string, Caso>; avisos: Map<string, Aviso>; notificacoes: Map<string, Notificacao>; mensagens: Map<string, Mensagem>; anexos: Map<string, Documento>;
};
type Tab = keyof Mapas | "equipe" | "config" | "lidas";

const CHAVE: Record<keyof Mapas, string> = { processos: "numero", clientes: "id", tarefas: "id", caixa: "id", casos: "id", avisos: "id", notificacoes: "id", mensagens: "id", anexos: "id" };
const TABELA: Record<string, Tab> = {
  processos: "processos", clientes: "clientes", tarefas: "tarefas", publicacoes: "caixa", casos: "casos", avisos_cliente: "avisos",
  notificacoes: "notificacoes", mensagens: "mensagens", profiles: "equipe", config: "config", mensagens_lidas: "lidas", documentos: "anexos",
};
const PROC_COLS = "numero,mascara,tribunal,orgao,cidade,classe,cliente_id,cliente_nome,reus,banco,fase,notas,responsavel,ultima_data,ultimo_ato,cadastro_manual,criado_em";

type Ctx = Mapas & {
  v: number; pronto: boolean; erroCarga: string;
  eu: Perfil; titular: boolean; equipe: Perfil[]; config: Record<string, any>; lidas: Record<string, string>;
  sb: ReturnType<typeof supabaseNavegador>;
  nome: (id?: string | null) => string;
  aviso: (msg: string) => void;
  aplicar: (tabela: keyof Mapas, linha: Linha | null | undefined) => void;
  remover: (tabela: keyof Mapas, id: string | number) => void;
  registrar: (ev: { processo_numero?: string | null; caso_id?: string | null; tarefa_id?: string | null; publicacao_id?: number | null; tipo: string; dados?: Linha }) => Promise<any>;
  recarregar: () => Promise<void>;
  marcarLidaLocal: (conversa: string, ate: string) => void;
};
const C = createContext<Ctx | null>(null);
export function useDados() { const c = useContext(C); if (!c) throw new Error("useDados fora do provedor"); return c; }

async function todas(q: () => any): Promise<Linha[]> {
  const out: Linha[] = [];
  for (let de = 0; ; de += 1000) {
    const { data, error } = await q().range(de, de + 999);
    if (error) throw error;
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
  }
}

/** mensagem legível a partir de um erro do Supabase (as regras do banco já vêm em português) */
export function msgErro(e: unknown, padrao = "Não foi possível salvar. Tente de novo."): string {
  const m = (e as { message?: string })?.message || "";
  if (/row-level security|permission denied/i.test(m)) return "Você não tem permissão para fazer isso.";
  if (/duplicate key/i.test(m)) return "Esse registro já existe.";
  if (/^[A-ZÁÉÍÓÚ].*[.!]$/.test(m) && /[áéíóúãõç]|\b(tarefa|responsável|corrigir|titular)\b/i.test(m)) return m;
  const det = [(e as { details?: string })?.details, (e as { hint?: string })?.hint].filter(Boolean).join(" ");
  if (/foreign key/i.test(m)) return `Não foi possível salvar: um registro ligado a este não foi encontrado (${m.slice(0, 120)}${det ? " · " + det.slice(0, 160) : ""}).`;
  if (/JWT|token|not authenticated/i.test(m)) return "Sua sessão expirou. Recarregue a página (F5) e entre de novo.";
  console.warn("erro ao salvar", e);
  // mostra o motivo técnico resumido, para dar para corrigir
  return m ? `${padrao} (${m.slice(0, 160)}${det ? " · " + det.slice(0, 160) : ""})` : padrao;
}

export function ProvedorDados({ eu, equipeInicial, children }: { eu: Perfil; equipeInicial: Perfil[]; children: React.ReactNode }) {
  const sb = useMemo(() => supabaseNavegador(), []);
  const m = useRef<Mapas>({ processos: new Map(), clientes: new Map(), tarefas: new Map(), caixa: new Map(), casos: new Map(), avisos: new Map(), notificacoes: new Map(), mensagens: new Map(), anexos: new Map() });
  const [v, setV] = useState(0);
  const [pronto, setPronto] = useState(false);
  const [erroCarga, setErroCarga] = useState("");
  const [equipe, setEquipe] = useState<Perfil[]>(equipeInicial);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [lidas, setLidas] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ t: string; k: number } | null>(null);
  const ultimaCarga = useRef(0);
  const tique = useRef<ReturnType<typeof setTimeout> | null>(null);
  const redesenhar = useCallback(() => { if (tique.current) return; tique.current = setTimeout(() => { tique.current = null; setV((x) => x + 1); }, 60); }, []);

  const aplicar = useCallback((tabela: keyof Mapas, linha: Linha | null | undefined) => {
    if (!linha) return;
    const mapa = m.current[tabela] as Map<any, any>; const k = linha[CHAVE[tabela]];
    if (tabela === "caixa" && linha.triagem && linha.triagem !== "pendente") mapa.delete(k);
    else mapa.set(k, { ...(mapa.get(k) || {}), ...linha });
    redesenhar();
  }, [redesenhar]);
  const remover = useCallback((tabela: keyof Mapas, id: string | number) => { (m.current[tabela] as Map<any, any>).delete(id); redesenhar(); }, [redesenhar]);

  const carregar = useCallback(async () => {
    try {
      const [ps, cs, ts, pubs, ca, av, no, ms, eq, cf, li, an] = await Promise.all([
        todas(() => sb.from("processos").select(PROC_COLS).order("numero")),
        todas(() => sb.from("clientes").select("*").order("id")),
        todas(() => sb.from("tarefas").select("*").order("id")),
        todas(() => sb.from("publicacoes").select("*").eq("triagem", "pendente").order("id")),
        todas(() => sb.from("casos").select("*").order("id")),
        todas(() => sb.from("avisos_cliente").select("*").order("id")),
        sb.from("notificacoes").select("*").eq("para", eu.id).order("em", { ascending: false }).limit(300).then((r: any) => r.data || []),
        sb.from("mensagens").select("*").order("em", { ascending: false }).limit(800).then((r: any) => r.data || []),
        sb.from("profiles").select("*").order("nome").then((r: any) => r.data || []),
        sb.from("config").select("*").then((r: any) => r.data || []),
        sb.from("mensagens_lidas").select("*").eq("usuario", eu.id).then((r: any) => r.data || []),
        todas(() => sb.from("documentos").select("*").not("tarefa_id", "is", null).order("id")),
      ]);
      const encher = (t: keyof Mapas, l: Linha[]) => { const mp = m.current[t] as Map<any, any>; mp.clear(); for (const x of l) mp.set(x[CHAVE[t]], x); };
      encher("processos", ps); encher("clientes", cs); encher("tarefas", ts); encher("caixa", pubs); encher("casos", ca); encher("avisos", av);
      encher("notificacoes", no); encher("mensagens", ms.reverse()); encher("anexos", an);
      setEquipe(eq as Perfil[]);
      setConfig(Object.fromEntries((cf as Linha[]).map((x) => [x.chave, x.valor])));
      setLidas(Object.fromEntries((li as Linha[]).map((x) => [x.conversa, x.ate])));
      ultimaCarga.current = Date.now(); setErroCarga(""); setPronto(true); setV((x) => x + 1);
    } catch (e) {
      console.warn("carga", e); setErroCarga("Não consegui carregar os dados. Verifique a internet e recarregue a página."); setPronto(true);
    }
  }, [sb, eu.id]);

  useEffect(() => {
    carregar();
    const canal = sb.channel("dados-escritorio");
    for (const t of Object.keys(TABELA)) {
      canal.on("postgres_changes", { event: "*", schema: "public", table: t }, (p: RealtimePostgresChangesPayload<Linha>) => {
        const alvo = TABELA[t]; const novo = p.new as Linha, velho = p.old as Linha;
        if (alvo === "equipe") { setEquipe((l) => p.eventType === "DELETE" ? l.filter((x) => x.id !== velho.id) : [...l.filter((x) => x.id !== novo.id), novo as Perfil].sort((a, b) => a.nome.localeCompare(b.nome))); return; }
        if (alvo === "config") { if (p.eventType !== "DELETE") setConfig((c) => ({ ...c, [novo.chave]: novo.valor })); return; }
        if (alvo === "lidas") { if (p.eventType !== "DELETE" && novo.usuario === eu.id) setLidas((c) => ({ ...c, [novo.conversa]: novo.ate })); return; }
        if (alvo === "notificacoes" && p.eventType !== "DELETE" && novo.para !== eu.id) return;
        if (alvo === "anexos" && p.eventType !== "DELETE" && !novo.tarefa_id) return;
        if (p.eventType === "DELETE") { const k = velho[CHAVE[alvo as keyof Mapas]]; if (k != null) remover(alvo as keyof Mapas, k); return; }
        aplicar(alvo as keyof Mapas, novo);
      });
    }
    canal.subscribe();
    // de volta à aba depois de muito tempo: recarrega tudo, por segurança
    const vis = () => { if (document.visibilityState === "visible" && Date.now() - ultimaCarga.current > 15 * 60e3) carregar(); };
    document.addEventListener("visibilitychange", vis);
    return () => { document.removeEventListener("visibilitychange", vis); sb.removeChannel(canal); };
  }, [sb, carregar, aplicar, remover, eu.id]);

  const nome = useCallback((id?: string | null) => {
    if (!id) return "Sem responsável";
    const p = equipe.find((x) => x.id === id);
    return p ? p.nome : "Membro removido";
  }, [equipe]);
  const aviso = useCallback((t: string) => setToast({ t, k: Date.now() }), []);
  useEffect(() => { if (!toast) return; const x = setTimeout(() => setToast(null), toast.t.length > 90 ? 6500 : 3600); return () => clearTimeout(x); }, [toast]);

  const registrar = useCallback<Ctx["registrar"]>(async (ev) => {
    const { data, error } = await sb.from("eventos").insert({ dados: {}, ...ev, por: eu.id }).select().single();
    if (error) console.warn("evento", error);
    return data;
  }, [sb, eu.id]);

  // processo citado por uma tarefa, publicação ou aviso que ainda não está na tela (ex.: criado agora pela busca do DJEN): busca na hora
  const pedidos = useRef(new Set<string>());
  useEffect(() => {
    if (!pronto) return;
    const faltam = new Set<string>();
    const ver = (n?: string | null) => { if (n && !m.current.processos.has(n) && !pedidos.current.has(n)) faltam.add(n); };
    for (const t of m.current.tarefas.values()) ver(t.processo_numero);
    for (const x of m.current.caixa.values()) ver(x.processo_numero);
    for (const a of m.current.avisos.values()) ver(a.processo_numero);
    for (const c of m.current.casos.values()) ver(c.processo_numero);
    if (!faltam.size) return;
    const lista = [...faltam]; lista.forEach((n) => pedidos.current.add(n));
    (async () => {
      for (let i = 0; i < lista.length; i += 100) {
        const { data } = await sb.from("processos").select(PROC_COLS).in("numero", lista.slice(i, i + 100));
        for (const x of data || []) aplicar("processos", x);
      }
    })();
  }, [v, pronto, sb, aplicar]);

  const valor: Ctx = {
    ...m.current, v, pronto, erroCarga, eu, titular: eu.papel === "titular", equipe, config, lidas, sb, nome, aviso, aplicar, remover, registrar, recarregar: carregar,
    marcarLidaLocal: (c, ate) => setLidas((x) => ({ ...x, [c]: ate })),
  };
  return (
    <C.Provider value={valor}>
      {children}
      {toast && <div className="toast" role="status" key={toast.k} onClick={() => setToast(null)}>{toast.t}</div>}
    </C.Provider>
  );
}

/** ids da equipe ativa, ordenados pelo nome, para escolher responsável */
export function useOpcoesEquipe() {
  const { equipe, eu } = useDados();
  return equipe.filter((p) => p.ativo).map((p) => ({ id: p.id, nome: p.nome + (p.id === eu.id ? " (você)" : "") }));
}
