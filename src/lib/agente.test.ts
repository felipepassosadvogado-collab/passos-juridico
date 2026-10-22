// Teste do assistente do WhatsApp com um banco em memória e um Claude roteirizado (sem rede).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { rodarAgente } from "./agente";

type Linha = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let db: Record<string, Linha[]>;
let seq = 0;
function q(tab: string) {
  const f: ((r: Linha) => boolean)[] = []; let acao: "select" | "update" | "insert" | "upsert" = "select"; let dados: Linha | Linha[] = {}; let lim = 0; let ord: [string, boolean] | null = null;
  const val = (v: string) => (v === "null" ? null : v);
  const api: any = { // eslint-disable-line @typescript-eslint/no-explicit-any
    select: () => api, eq: (c: string, v: unknown) => (f.push((r) => r[c] === v), api), neq: (c: string, v: unknown) => (f.push((r) => r[c] !== v), api),
    is: (c: string, v: unknown) => (f.push((r) => (r[c] ?? null) === v), api), not: (c: string) => (f.push((r) => r[c] != null), api),
    gte: (c: string, v: string) => (f.push((r) => String(r[c]) >= v), api), limit: (n: number) => ((lim = n), api), order: (c: string, o?: { ascending?: boolean }) => ((ord = [c, o?.ascending !== false]), api),
    or: (s: string) => { const cs = s.split(",").map((x) => x.split(".")); f.push((r) => cs.some(([c, op, ...v]) => (op === "is" ? (r[c] ?? null) === val(v.join(".")) : op === "lt" ? String(r[c]) < v.join(".") : false))); return api; },
    update: (d: Linha) => ((acao = "update"), (dados = d), api), insert: (d: Linha) => ((acao = "insert"), (dados = d), api), upsert: (d: Linha) => ((acao = "upsert"), (dados = d), api),
    run() {
      db[tab] ||= [];
      if (acao === "insert" || acao === "upsert") { const l = [dados].flat().map((d) => ({ id: "x" + ++seq, ...d })); db[tab].push(...l); return l; }
      let l = db[tab].filter((r) => f.every((g) => g(r)));
      if (acao === "update") { for (const r of l) Object.assign(r, dados); return l; }
      if (ord) { const [c, asc] = ord; l = [...l].sort((a, b) => (asc ? 1 : -1) * String(a[c]).localeCompare(String(b[c]))); }
      return lim ? l.slice(0, lim) : l;
    },
    maybeSingle: () => Promise.resolve({ data: structuredClone(api.run()[0] ?? null) }), single: () => Promise.resolve({ data: structuredClone(api.run()[0] ?? null) }),
    then: (ok: (x: unknown) => void) => ok({ data: structuredClone(api.run()) }),
  };
  return api;
}
const adm = { from: q } as any; // eslint-disable-line @typescript-eslint/no-explicit-any

const P = "50157251220264047201";
let roteiro: ((corpo: any) => any)[]; let pedidos: any[]; let enviadas: string[]; // eslint-disable-line @typescript-eslint/no-explicit-any
const texto = (t: string) => ({ stop_reason: "end_turn", content: [{ type: "text", text: t }] });
const usar = (name: string, input: unknown) => ({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "tu" + ++seq, name, input }] });
const resultado = (corpo: any) => JSON.parse(corpo.messages.at(-1).content[0].content); // eslint-disable-line @typescript-eslint/no-explicit-any

beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = "k"; process.env.AGENTE_ESPERA_MS = "0"; process.env.EVOLUTION_URL = "http://evo"; process.env.EVOLUTION_API_KEY = "k";
  db = {
    config: [{ chave: "agente", valor: { modo: "automatico", nome: "Ana" } }],
    profiles: [{ id: "u1", ativo: true }, { id: "u2", ativo: true }],
    clientes: [{ id: "c1", nome: "MARIA DAS GRACAS DE SOUZA", cpf: "529.982.247-25", telefone: "(47) 99999-1111", nascimento: "1955-03-02" }],
    processos: [{ numero: P, mascara: "5015725-12.2026.4.04.7201", cliente_id: "c1", reus: ["BANCO C6 CONSIGNADO S.A."], fase: "Perícia", orgao: "6ª Vara Federal de Joinville", ultima_data: "2026-10-14", ultimo_ato: "Despacho" }],
    publicacoes: [{ processo_numero: P, data: "2026-10-14", tipo_doc: "Despacho", texto: "Designo perícia grafotécnica para 05/11/2026, às 14h.", analise: { ato: "Designação de perícia" } },
      { processo_numero: P, data: "2026-09-01", tipo_doc: "Citação", texto: "Cite-se.", analise: null }],
    avisos_cliente: [{ processo_numero: P, tipo_evento: "Perícia", data_evento: "2099-11-05", hora: "14:00:00", local: "Sede do juízo" }],
    tarefas: [], casos: [], notificacoes: [],
    wa_conversas: [{ id: "w1", jid: "5547999991111@s.whatsapp.net", telefone: "5547999991111", nome: "Maria", cliente_id: null, atendimento: "agente", equipe_ate: null, aguardando_equipe: false, agente_estado: {}, saudado_em: null, agente_lock: null }],
    wa_mensagens: [],
  };
  roteiro = []; pedidos = []; enviadas = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => {
    const corpo = JSON.parse(init.body);
    if (url.includes("anthropic")) { pedidos.push(corpo); return new Response(JSON.stringify(roteiro.shift()!(corpo))); }
    enviadas.push(corpo.text); return new Response(JSON.stringify({ key: { id: "wa" + ++seq } }));
  }));
});
const chega = (t: string, conv = "w1") => { const m = { id: "m" + ++seq, conversa_id: conv, de_mim: false, texto: t, tipo: "texto", em: new Date(Date.now() + seq).toISOString(), agente: false }; db.wa_mensagens.push(m); return m.id; };

describe("assistente do WhatsApp", () => {
  it("primeira mensagem: boas-vindas e aviso do golpe, em mensagens separadas", async () => {
    roteiro.push(() => texto("Olá, Maria! Seja bem-vinda à Passos Advocacia.\n---\nAtenção ao golpe do falso advogado..."));
    await rodarAgente(adm, "w1", chega("Oi"));
    expect(pedidos[0].system).toContain("PRIMEIRA MENSAGEM"); expect(pedidos[0].system).toContain("golpe do falso advogado");
    expect(enviadas).toHaveLength(2); expect(db.wa_conversas[0].saudado_em).toBeTruthy(); expect(db.wa_conversas[0].agente_lock).toBeNull();
    expect(db.wa_mensagens.filter((m) => m.de_mim && m.agente)).toHaveLength(2);
    roteiro.push(() => texto("Claro!")); await rodarAgente(adm, "w1", chega("tudo bem?"));
    expect(pedidos[1].system).not.toContain("PRIMEIRA MENSAGEM"); expect(pedidos[1].messages.at(-2).role).toBe("assistant");
  });

  it("identifica pelo CPF + telefone da ficha e lê os andamentos em ordem", async () => {
    db.wa_conversas[0].saudado_em = "2026-10-01";
    roteiro.push(() => usar("consultar_processo", { numero: P }));
    roteiro.push((c) => { expect(resultado(c).erro).toMatch(/Identifique/); return usar("identificar_cliente", { cpf: "52998224725" }); });
    roteiro.push((c) => { const r = resultado(c); expect(r.confirmado).toBe(true); expect(r.processos[0].contra).toContain("C6"); return usar("consultar_processo", { numero: "5015725-12.2026.4.04.7201" }); });
    roteiro.push((c) => { const r = resultado(c); expect(r.andamentos.map((a: { data: string }) => a.data)).toEqual(["01/09/2026", "14/10/2026"]); expect(r.proximos_compromissos[0].hora).toBe("14:00"); return texto("Sua perícia está marcada."); });
    await rodarAgente(adm, "w1", chega("quero saber do meu processo, cpf 529.982.247-25"));
    expect(enviadas).toEqual(["Sua perícia está marcada."]); expect(db.wa_conversas[0].cliente_id).toBe("c1");
  });

  it("telefone diferente: exige a data de nascimento", async () => {
    Object.assign(db.wa_conversas[0], { telefone: "5547988887777", jid: "5547988887777@s.whatsapp.net", saudado_em: "x" });
    roteiro.push(() => usar("identificar_cliente", { cpf: "52998224725" }));
    roteiro.push((c) => { expect(resultado(c).precisa).toBe("data_nascimento"); return usar("identificar_cliente", { cpf: "52998224725", data_nascimento: "01/01/1950" }); });
    roteiro.push((c) => { expect(resultado(c).confirmado).toBe(false); return usar("identificar_cliente", { cpf: "52998224725", data_nascimento: "2/3/1955" }); });
    roteiro.push((c) => { expect(resultado(c).confirmado).toBe(true); return texto("ok"); });
    await rodarAgente(adm, "w1", chega("cpf 52998224725"));
    expect(db.wa_conversas[0].agente_estado.identificado).toBe("c1");
  });

  it("caso novo vai para o CRM e avisa a equipe; depois fica quieto", async () => {
    Object.assign(db.wa_conversas[0], { telefone: "5547911112222", saudado_em: "x" });
    roteiro.push(() => usar("registrar_novo_atendimento", { nome: "João Silva", banco: "Banco Pan", resumo_do_caso: "Desconto de empréstimo que não fez desde 03/2026." }));
    roteiro.push(() => texto("Registrei seu caso."));
    await rodarAgente(adm, "w1", chega("tem um desconto no meu benefício que eu não fiz"));
    expect(db.casos[0]).toMatchObject({ nome: "JOÃO SILVA", etapa: "Primeiro atendimento", banco: "Banco Pan" });
    expect(db.notificacoes).toHaveLength(2); expect(db.notificacoes[0].tipo).toBe("whatsapp"); expect(db.wa_conversas[0].aguardando_equipe).toBe(true);
    await rodarAgente(adm, "w1", chega("obrigado")); expect(pedidos).toHaveLength(2);
  });

  it("não responde com a equipe atendendo, nem quando chegou mensagem mais nova, e no modo rascunho só sugere", async () => {
    db.wa_conversas[0].atendimento = "equipe"; db.wa_conversas[0].equipe_ate = new Date(Date.now() + 3600e3).toISOString();
    await rodarAgente(adm, "w1", chega("oi")); expect(pedidos).toHaveLength(0);
    db.wa_conversas[0].equipe_ate = new Date(Date.now() - 1000).toISOString();
    const velha = chega("oi"); chega("tudo bem?"); await rodarAgente(adm, "w1", velha); expect(pedidos).toHaveLength(0);
    db.config[0].valor.modo = "rascunho"; roteiro.push(() => texto("Olá!\n---\nAviso do golpe"));
    await rodarAgente(adm, "w1", db.wa_mensagens.at(-1)!.id);
    expect(enviadas).toHaveLength(0); expect(db.wa_conversas[0].rascunho).toBe("Olá!\n---\nAviso do golpe"); expect(db.wa_conversas[0].atendimento).toBe("agente");
  });
});
