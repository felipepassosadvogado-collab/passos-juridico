import { describe, expect, it, vi } from "vitest";
import { buscarDolar, dolarEfetivo, reais } from "./cotacao";

describe("dólar para o painel de consumo", () => {
  it("lê a última cotação do Banco Central (SGS 1)", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify([{ data: "10/11/2026", valor: "5.4321" }])));
    expect(await buscarDolar(f as unknown as typeof fetch)).toMatchObject({ valor: 5.4321, data: "10/11/2026" });
    expect(String((f.mock.calls[0] as unknown[])[0])).toContain("bcdata.sgs.1/dados/ultimos/1");
  });
  it("resposta estranha vira erro (a tela cai para dólar)", async () => {
    await expect(buscarDolar((async () => new Response("[]")) as unknown as typeof fetch)).rejects.toThrow();
  });
  it("acréscimo do IOF e conversão", () => {
    expect(dolarEfetivo(5.5, 3.5)).toBeCloseTo(5.6925);
    expect(reais(12.15 * dolarEfetivo(5.5, 3.5)).replace(/\s/g, " ")).toBe("R$ 69,16");
  });
});
