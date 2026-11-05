import { afterEach, describe, expect, it, vi } from "vitest";
import { PRECOS_PADRAO, custo, nomeFuncao, resumirConsumo } from "./consumoResumo";

describe("painel de consumo", () => {
  it("custo pelos preços por milhão de tokens", () => {
    expect(custo({ modelo: "claude-opus-5-5", entrada: 100000, saida: 10000, cache_leitura: 0, cache_escrita: 0 }, PRECOS_PADRAO)).toBeCloseTo(0.6); // 0,4 + 0,2
    expect(custo({ modelo: "claude-sonnet-5-5", entrada: 3000, saida: 500, cache_leitura: 0, cache_escrita: 0 }, PRECOS_PADRAO)).toBeCloseTo(0.011);
  });
  it("agrupa por função, modelo e dia (horário de Brasília)", () => {
    const L = (em: string, operacao: string, modelo: string, entrada: number, saida: number) => ({ em, operacao, modelo, entrada, saida, cache_leitura: 0, cache_escrita: 0 });
    const r = resumirConsumo([L("2026-11-05T12:00:00Z", "peticao.peca", "claude-opus-5-5", 100000, 10000), L("2026-11-05T02:00:00Z", "whatsapp.agente", "claude-sonnet-5-5", 3000, 500), L("2026-11-04T15:00:00Z", "djen.analise.fundo", "claude-sonnet-5-5", 20000, 4000)], PRECOS_PADRAO);
    expect(r.porFuncao.map((g) => g.nome)).toEqual(["Petições intermediárias", "Análise das publicações", "Assistente do WhatsApp"]);
    expect(r.porModelo.map((g) => [g.nome, g.chamadas])).toEqual([["Opus 5.5", 1], ["Sonnet 5.5", 2]]);
    expect(r.porDia.map((d) => [d.dia, d.chamadas])).toEqual([["2026-11-04", 2], ["2026-11-05", 1]]); // 02:00 UTC do dia 5 ainda é dia 4 em Brasília
    expect(r.total.custo).toBeCloseTo(0.6 + 0.011 + 0.08);
    expect(nomeFuncao("qualquer.coisa")).toBe("Outros");
  });
});

describe("registro de cada chamada", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.resetModules(); vi.doUnmock("./consumo"); });
  it("a chamada ao Claude registra os tokens com o nome da operação em andamento", async () => {
    const reg = vi.fn(async () => {});
    vi.doMock("./consumo", () => ({ registrarUso: reg }));
    vi.stubEnv("ANTHROPIC_API_KEY", "k"); vi.spyOn(console, "info").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: "oi" }], stop_reason: "end_turn", usage: { input_tokens: 120, output_tokens: 30 } }), { headers: { "content-type": "application/json" } })));
    const { pedirTexto } = await import("./claude"); const { medir, operacaoAtual } = await import("./operacao");
    let dentro = "";
    await medir("claude.mensagem", async () => { dentro = operacaoAtual(); return pedirTexto([{ type: "text", text: "x" }]); });
    expect(dentro).toBe("claude.mensagem");
    expect(reg).toHaveBeenCalledWith("claude-sonnet-5-5", { input_tokens: 120, output_tokens: 30 }, expect.any(Number));
  });
});
