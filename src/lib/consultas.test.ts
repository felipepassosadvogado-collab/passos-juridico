// Contagem de consultas ao banco (anti N+1): cada fluxo roda com dados representativos num banco em memória
// que conta toda ida ao banco por tabela e operação. Os limites abaixo impedem que uma consulta por registro volte.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pedacos } from "./emLote";
import { bancoContado } from "./teste/bancoContado";

/* eslint-disable @typescript-eslint/no-explicit-any */

const RTT_MS = 45; // ida e volta típica de uma consulta do servidor (gru1) ao Supabase; serve só para estimar a latência
const relatorio: string[] = [];
const anota = (nome: string, b: ReturnType<typeof bancoContado>) => {
  const r = b.resumo(); relatorio.push(`${nome}: ${b.total()} consultas (≈ ${b.total() * RTT_MS} ms só de rede) · ${Object.entries(r).map(([k, v]) => `${k}: ${v}`).join(" · ")}`);
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
beforeEach(() => { vi.resetModules(); });
import { afterAll } from "vitest";
afterAll(() => { console.log("\n=== CONTAGEM DE CONSULTAS ===\n" + relatorio.join("\n") + "\n"); });

// ───── 1) sincronização do DJEN: 60 processos com publicações novas (40 já cadastrados, 20 novos), 3 publicações cada ─────
describe("DJEN: sincronização", () => {
  it("não faz uma consulta por processo", async () => {
    const OAB = { nome: "FELIPE DOS PASSOS SILVA", numero_oab: "58547", uf_oab: "SC" };
    const numero = (i: number) => String(5010000 + i).padStart(7, "0") + "00" + "2026" + "4047201";
    const processos = Array.from({ length: 40 }, (_, i) => ({ numero: numero(i), reus: ["BANCO C6 CONSIGNADO S.A."], cliente_nome: "Cliente " + i, cliente_id: "c" + i, ultima_data: "2026-09-01" }));
    const clientes = Array.from({ length: 60 }, (_, i) => ({ id: "c" + i, nome: `Cliente Numero ${["Um", "Dois", "Tres", "Quatro", "Cinco"][i % 5]} ${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + Math.floor(i / 26))}`, cpf: null }));
    const b = bancoContado({ config: [], publicacoes: [], processos, clientes, eventos: [], djen_execucoes: [], notificacoes: [], profiles: [{ id: "t1", papel: "titular", ativo: true }, { id: "t2", papel: "titular", ativo: true }] });
    const itens: any[] = []; let id = 1;
    for (let p = 0; p < 60; p++) for (let k = 0; k < 3; k++) itens.push({ id: id++, ativo: true, data_disponibilizacao: "2026-10-2" + k, numero_processo: numero(p), texto: "Intimação " + id, tipoComunicacao: "Intimação", tipoDocumento: "Despacho", nomeOrgao: "2ª Vara Federal de Joinville", siglaTribunal: "TRF4",
      destinatarioadvogados: [{ advogado: OAB }], destinatarios: [{ nome: clientes[p].nome.toUpperCase(), polo: "A" }, { nome: "BANCO C6 CONSIGNADO S.A.", polo: "P" }] });
    vi.stubGlobal("fetch", vi.fn(async (u: URL) => {
      const p = u.searchParams; const pag = +p.get("pagina")!; const daOab = !!p.get("numeroOab");
      const items = daOab ? itens.slice((pag - 1) * 100, pag * 100) : [];
      return new Response(JSON.stringify({ count: daOab ? itens.length : 0, items }), { headers: { "content-type": "application/json" } });
    }));
    const { sincronizarDjen } = await import("./djen");
    const r = await sincronizarDjen(b.sb, "automatica", false);
    anota("DJEN · sincronizar 60 processos / 180 publicações", b);
    expect(r.erro).toBeUndefined(); expect(r.novas).toBe(180); expect(r.processosNovos).toBe(20);
    expect(b.db.publicacoes.length).toBe(180);
    const s = b.resumo();
    expect(s["select processos"] || 0).toBeLessThanOrEqual(2); // antes: 1 por processo
    expect(s["upsert publicacoes"] || 0).toBeLessThanOrEqual(2); // antes: 1 por processo
    expect(s["insert notificacoes"] || 0).toBeLessThanOrEqual(1); // antes: 1 por titular
  }, 60000);
});

// ───── 2) análise automática das publicações novas (30, metade com ato para avisar o cliente) ─────
describe("DJEN: análise automática", () => {
  it("não busca o aviso de uma publicação por vez", async () => {
    vi.doMock("./claude", async (orig) => ({ ...(await orig() as object), analisarPublicacoes: vi.fn(async (l: { id: number }[]) => Object.fromEntries(l.map((p) => [String(p.id), { ato: "Perícia", resumo: "x", intimarCliente: p.id % 2 === 0, evento: { tipo: "Perícia", data: "2026-12-01" } }]))) }));
    const pubs = Array.from({ length: 30 }, (_, i) => ({ id: 100 + i, processo_numero: "50100000020264047201", data: "2026-10-20", tipo_doc: "Despacho", tipo_com: "Intimação", orgao: "x", texto: "t", analise: null }));
    const b = bancoContado({ publicacoes: pubs, avisos_cliente: [{ id: "a0", publicacao_id: 100 }] });
    const { analisarPendentes } = await import("./djen");
    const n = await analisarPendentes(b.sb, pubs.map((p) => p.id));
    anota("DJEN · análise automática de 30 publicações", b);
    expect(n).toBe(30); expect(b.db.avisos_cliente.length).toBe(15); // 15 com ato; a 100 já tinha aviso
    const s = b.resumo();
    expect(s["select avisos_cliente"] || 0).toBeLessThanOrEqual(3); // antes: 1 por publicação com ato
    expect(s["insert avisos_cliente"] || 0).toBeLessThanOrEqual(3); // antes: 1 por aviso
  });
});

// ───── 3) botão "Analisar com o Claude" (rota /api/claude/analisar), 30 publicações ─────
describe("rota /api/claude/analisar", () => {
  it("avisos e eventos em lote", async () => {
    const pubs = Array.from({ length: 30 }, (_, i) => ({ id: 200 + i, processo_numero: "5010000" + String(i % 5) + "0020264047201".slice(1), data: "2026-10-20", tipo_doc: "Despacho", tipo_com: "Intimação", orgao: "x", texto: "t", triagem: "pendente" }));
    const b = bancoContado({ publicacoes: pubs, processos: [...new Set(pubs.map((p) => p.processo_numero))].map((n) => ({ numero: n, mascara: n })), avisos_cliente: [], eventos: [] });
    vi.doMock("@/lib/rota", async (orig) => ({ ...(await orig() as object), membroDaRota: async () => ({ sb: b.sb, user: { id: "u1" }, perfil: { id: "u1" } }) }));
    vi.doMock("@/lib/claude", async (orig) => ({ ...(await orig() as object), analisarPublicacoes: vi.fn(async (l: { id: number }[]) => Object.fromEntries(l.map((p) => [String(p.id), { ato: "Audiência", resumo: "x", intimarCliente: p.id % 3 === 0, evento: { tipo: "Audiência", data: "2026-12-01" } }]))) }));
    const { POST } = await import("@/app/api/claude/analisar/route");
    const r = await POST(new Request("http://x/api/claude/analisar", { method: "POST", body: JSON.stringify({ ids: pubs.map((p) => p.id) }) }));
    const j = await r.json();
    anota("Analisar com o Claude · 30 publicações", b);
    expect(j.publicacoes.length).toBe(30); expect(j.avisos.length).toBe(10);
    expect(b.db.eventos.length).toBe(10);
    const s = b.resumo();
    expect((s["select avisos_cliente"] || 0) + (s["insert avisos_cliente"] || 0) + (s["insert eventos"] || 0)).toBeLessThanOrEqual(9); // antes: até 3 por publicação
  });
});

// ───── 4) CRM "Sugerir fases automaticamente" e Clientes "Ligar processos sem cliente" (rodam no navegador) ─────
describe("telas: gravações em lote", () => {
  it("sugerir fases de 240 processos: uma gravação por fase, não por processo", async () => {
    const { classificarFases } = await import("./acoesLote");
    const fases = ["Réplica", "Sentença", "Recurso", "Cumprimento de sentença", "Perícia / instrução", "Protocolo / citação"];
    const procs = Array.from({ length: 240 }, (_, i) => ({ numero: "n" + i, fase: null }));
    const b = bancoContado({ processos: procs.map((p) => ({ ...p })), eventos: [] });
    const r = await classificarFases(b.sb, procs.map((p, i) => ({ numero: p.numero, fase: fases[i % fases.length] })), "u1");
    anota("CRM · sugerir fases de 240 processos", b);
    expect(r.linhas.length).toBe(240); expect(b.db.eventos.length).toBe(240);
    expect(b.db.processos.every((p, i) => p.fase === fases[i % fases.length])).toBe(true);
    expect(b.total()).toBeLessThanOrEqual(fases.length * 2 + 1); // antes: 2 por processo (480)
  });
  it("ligar 120 processos sem ficha: fichas novas num lote, processos agrupados por ficha", async () => {
    const { vincularProcessos } = await import("./acoesLote");
    const clientes = Array.from({ length: 50 }, (_, i) => ({ id: "c" + i, nome: "Cliente " + i }));
    // 120 processos: 80 de clientes que já têm ficha (alguns com 2 processos), 40 de 30 pessoas sem ficha
    const procs = [...Array.from({ length: 80 }, (_, i) => ({ numero: "p" + i, cliente_id: null, cliente_nome: "CLIENTE " + (i % 50) })), ...Array.from({ length: 40 }, (_, i) => ({ numero: "q" + i, cliente_id: null, cliente_nome: "PESSOA NOVA " + (i % 30) }))];
    const b = bancoContado({ processos: procs.map((p) => ({ ...p })), clientes: clientes.map((c) => ({ ...c })) });
    const r = await vincularProcessos(b.sb, procs, clientes);
    anota("Clientes · ligar 120 processos sem ficha", b);
    expect(r.ligados).toBe(120); expect(b.db.clientes.length).toBe(80); // 30 fichas novas, sem duplicar
    expect(b.db.processos.every((p) => p.cliente_id)).toBe(true);
    const s = b.resumo();
    expect(s["insert clientes"] || 0).toBe(1); // antes: 1 por ficha nova (30)
    expect(s["update processos"] || 0).toBeLessThanOrEqual(80); // 1 por ficha (antes: 1 por processo, 120)
  });
});

describe("utilitário", () => { it("pedaços", () => expect(pedacos([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])); });
