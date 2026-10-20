import { describe, expect, it } from "vitest";
import { calcular, taxaLegal, somaMes, type Indices } from "./calculo";

const ix: Indices = { ipca: {}, ipca15: {}, ipcae: {}, selic: {} };
for (let m = "2020-01"; m <= "2026-12"; m = somaMes(m, 1)) { ix.ipca[m] = 0.005; ix.ipca15[m] = 0.005; ix.ipcae[m] = 0.004; ix.selic[m] = 0.01; }

describe("cálculo", () => {
  it("taxa legal = Selic/IPCA-15 do mês anterior − 1, nunca negativa", () => {
    expect(taxaLegal(ix, "2025-01")).toBeCloseTo(1.01 / 1.005 - 1, 10);
    const neg: Indices = { ...ix, selic: { ...ix.selic, "2025-01": 0.001 }, ipca15: { ...ix.ipca15, "2025-01": 0.01 } };
    expect(taxaLegal(neg, "2025-02")).toBe(0);
  });
  it("lei 14.905 em todo o período: correção IPCA composta e juros simples", () => {
    const r = calcular([{ numero: "1", parcela: 100, inicio: "2025-01", qtd: 1 }], ix, { ate: "2025-04", regime: "lei", dobro: true, modulacao: false });
    const l = r.linhas[0]; const fator = 1.005 ** 3; const tl = 1.01 / 1.005 - 1;
    expect(l.base).toBe(200); expect(l.correcao).toBeCloseTo(200 * fator - 200, 2); expect(l.juros).toBeCloseTo(200 * fator * tl * 3, 2);
  });
  it("modulação do STJ: dobro só a partir de 04/2021", () => {
    const r = calcular([{ numero: "1", parcela: 50, inicio: "2021-02", qtd: 3 }], ix, { ate: "2021-06", regime: "lei", dobro: true, modulacao: true });
    expect(r.linhas.map((l) => l.base)).toEqual([50, 50, 100]);
  });
  it("justiça federal: Selic simples até 08/2024", () => {
    const r = calcular([{ numero: "1", parcela: 100, inicio: "2024-06", qtd: 1 }], ix, { ate: "2024-09", regime: "jf", dobro: false, modulacao: false });
    expect(r.linhas[0].juros).toBeCloseTo(3, 2); expect(r.linhas[0].correcao).toBeCloseTo(0, 2); expect(r.linhas[0].total).toBeCloseTo(103, 2);
  });
  it("parcelas que caem depois da data do cálculo ficam de fora", () => {
    const r = calcular([{ numero: "1", parcela: 10, inicio: "2026-08", qtd: 10 }], ix, { ate: "2026-10", regime: "lei", dobro: true, modulacao: false });
    expect(r.linhas.length).toBe(2);
  });
});
