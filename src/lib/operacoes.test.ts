// Operações demoradas: o pedido responde sem esperar a parte pesada, a parte pesada pode ser repetida sem duplicar,
// integrações externas têm tempo-limite e tudo deixa registro no log.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoContado } from "./teste/bancoContado";

/* eslint-disable @typescript-eslint/no-explicit-any */
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.doUnmock("next/server"); vi.doUnmock("@/lib/rota"); vi.doUnmock("@/lib/supabase/server"); vi.doUnmock("@/lib/djen"); vi.doUnmock("./claude"); });
beforeEach(() => { vi.resetModules(); });

describe("Buscar no DJEN (manual)", () => {
  it("responde assim que as publicações estão na caixa; a análise pelo Claude segue depois, em segundo plano", async () => {
    const fila: (() => unknown)[] = [];
    vi.doMock("next/server", async (orig) => ({ ...(await orig() as object), after: (f: () => unknown) => { fila.push(f); } }));
    vi.doMock("@/lib/rota", async (orig) => ({ ...(await orig() as object), membroDaRota: async () => ({ user: { id: "u1" } }) }));
    vi.doMock("@/lib/supabase/server", () => ({ supabaseAdmin: async () => ({}) }));
    const analisar = vi.fn(async (_adm: unknown, ids: number[]) => { await new Promise((ok) => setTimeout(ok, 400)); return ids.length; });
    vi.doMock("@/lib/djen", () => ({ sincronizarDjen: vi.fn(async () => ({ novas: 3, caixa: 3, processosNovos: 0, analisadas: 0, paginas: 1, completa: true, novasIds: [11, 12, 13] })), analiseLigada: async () => true, analisarPendentes: analisar }));
    const log = vi.spyOn(console, "info").mockImplementation(() => {});
    const { POST } = await import("@/app/api/djen/sincronizar/route");
    const t0 = Date.now(); const r = await POST(new Request("http://x/api/djen/sincronizar", { method: "POST", body: "{}" })); const ms = Date.now() - t0;
    const j = await r.json();
    expect(r.status).toBe(200); expect(j).toMatchObject({ caixa: 3, analisando: 3 }); expect(j.novasIds).toBeUndefined();
    expect(ms).toBeLessThan(200); expect(analisar).not.toHaveBeenCalled(); // a resposta não esperou o Claude
    expect(fila).toHaveLength(1);
    await fila[0](); // o que a Vercel roda depois da resposta
    expect(analisar).toHaveBeenCalledWith(expect.anything(), [11, 12, 13]);
    const linhas = log.mock.calls.map((c) => String(c[0]));
    expect(linhas.some((l) => l.includes('"op":"djen.busca.manual"') && l.includes('"caixa":3'))).toBe(true);
    expect(linhas.some((l) => l.includes('"op":"djen.analise.fundo"') && l.includes('"analisadas":3'))).toBe(true);
  });
});

describe("análise em segundo plano", () => {
  it("pode ser repetida (nova tentativa) sem analisar de novo nem duplicar avisos", async () => {
    const chamar = vi.fn(async (l: { id: number }[]) => Object.fromEntries(l.map((p) => [String(p.id), { ato: "Perícia", resumo: "x", intimarCliente: true, evento: { tipo: "Perícia", data: "2026-12-01" } }])));
    vi.doMock("./claude", async (orig) => ({ ...(await orig() as object), analisarPublicacoes: chamar }));
    const pubs = Array.from({ length: 5 }, (_, i) => ({ id: 1 + i, processo_numero: "50100000020264047201", data: "2026-10-20", texto: "t", analise: null }));
    const b = bancoContado({ publicacoes: pubs, avisos_cliente: [] });
    const { analisarPendentes } = await import("./djen");
    expect(await analisarPendentes(b.sb, [1, 2, 3, 4, 5])).toBe(5);
    expect(await analisarPendentes(b.sb, [1, 2, 3, 4, 5])).toBe(0); // repetir: nada a fazer
    expect(b.db.avisos_cliente).toHaveLength(5); expect(chamar).toHaveBeenCalledTimes(1);
  });
});

describe("tempo-limite das integrações", () => {
  const travar = () => vi.fn((_u: unknown, init?: { signal?: AbortSignal }) => new Promise((_ok, no) => init?.signal?.addEventListener("abort", () => no(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })))));
  it("servidor do WhatsApp travado: erro claro em vez de prender o pedido", async () => {
    vi.stubEnv("EVOLUTION_URL", "http://evo.invalid"); vi.stubEnv("EVOLUTION_API_KEY", "k"); vi.stubEnv("EVOLUTION_TIMEOUT_MS", "150");
    vi.stubGlobal("fetch", travar()); vi.spyOn(console, "warn").mockImplementation(() => {});
    const { evo } = await import("./whatsapp");
    const t0 = Date.now();
    await expect(evo("/instance/connectionState/x")).rejects.toMatchObject({ status: 504, message: expect.stringMatching(/não respondeu a tempo/) });
    expect(Date.now() - t0).toBeLessThan(2000);
  });
  it("Claude sem resposta: para no tempo-limite, sem repetir, com mensagem para a pessoa", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "k"); vi.stubEnv("CLAUDE_TIMEOUT_MS", "150");
    const f = travar(); vi.stubGlobal("fetch", f);
    const { analisarPublicacoes } = await import("./claude");
    await expect(analisarPublicacoes([{ id: 1, processo_numero: "1", data: "2026-10-20", texto: "t" } as any])).rejects.toMatchObject({ status: 504 });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe("registro no log", () => {
  it("linha JSON com operação, duração, resultado e erro", async () => {
    const { medir } = await import("./operacao");
    const info = vi.spyOn(console, "info").mockImplementation(() => {}); const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await medir("teste.ok", async () => 7, { lote: 2 }, (n) => ({ n }));
    await expect(medir("teste.falha", async () => { throw new Error("quebrou"); })).rejects.toThrow("quebrou");
    const ok = JSON.parse(String(info.mock.calls[0][0]).replace("[operacao] ", "")); const ruim = JSON.parse(String(warn.mock.calls[0][0]).replace("[operacao] ", ""));
    expect(ok).toMatchObject({ op: "teste.ok", ok: true, lote: 2, n: 7 }); expect(typeof ok.ms).toBe("number");
    expect(ruim).toMatchObject({ op: "teste.falha", ok: false, erro: "quebrou" });
  });
});
