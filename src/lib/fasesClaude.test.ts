// CRM "Sugerir fases com o Claude": só processos sem fase vão para o Claude, e só fases da lista voltam.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoContado } from "./teste/bancoContado";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.doUnmock("@/lib/rota"); vi.restoreAllMocks(); });
beforeEach(() => { vi.resetModules(); });

describe("rota /api/claude/fases", () => {
  it("ignora processo já classificado, manda o contexto e devolve só fases válidas", async () => {
    const A = "50155115520254047201", B = "50174948920254047201", C = "50127591320254047201";
    const b = bancoContado({
      processos: [{ numero: A, mascara: "5015511-55", orgao: "3ª Turma Recursal de SC", classe: "RECURSO CÍVEL", fase: null, cliente_nome: "JOSE" },
        { numero: B, mascara: "5017494-89", orgao: "6ª Vara Federal de Joinville", classe: "PROCEDIMENTO", fase: "", cliente_nome: "MARIA" },
        { numero: C, mascara: "5012759-13", orgao: "x", classe: "x", fase: "Sentença", cliente_nome: "LUIZ" }],
      publicacoes: [{ id: 1, processo_numero: A, data: "2026-10-29", tipo_doc: "Acórdão", texto: "ACÓRDÃO. Negar provimento ao recurso do banco.", analise: null }],
      eventos: [], tarefas: [],
    });
    vi.doMock("@/lib/rota", async (orig) => ({ ...(await orig() as object), membroDaRota: async () => ({ sb: b.sb, user: { id: "u1" } }) }));
    vi.stubEnv("ANTHROPIC_API_KEY", "k"); vi.spyOn(console, "info").mockImplementation(() => {});
    let pedido = "";
    vi.stubGlobal("fetch", vi.fn(async (_u: unknown, init?: { body?: string }) => {
      pedido = init?.body || "";
      const resp = [{ numero: A, fase: "Recurso", motivo: "Acórdão de 29/10/2026 negou provimento.", confianca: "alta" }, { numero: B, fase: "Fase inventada", motivo: "x", confianca: "alta" }];
      return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(resp) }], stop_reason: "end_turn" }), { headers: { "content-type": "application/json" } });
    }));
    const { POST } = await import("@/app/api/claude/fases/route");
    const r = await POST(new Request("http://x/api/claude/fases", { method: "POST", body: JSON.stringify({ numeros: [A, B, C] }) }));
    const j = JSON.parse((await r.text()).trim());
    expect(j.sugestoes).toEqual({ [A]: { fase: "Recurso", motivo: "Acórdão de 29/10/2026 negou provimento.", confianca: "alta" } });
    expect(pedido).toContain(A); expect(pedido).toContain(B); expect(pedido).not.toContain(C); // classificado não vai
    expect(pedido).toContain("Negar provimento"); // a publicação vai como contexto
  });
});
