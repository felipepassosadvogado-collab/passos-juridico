import { describe, expect, it } from "vitest";
import { liquidar } from "./cumprimento";

// IPCA-E (SGS 10764) e SELIC mensal (SGS 4390) de 2021 a 2026, como publicados pelo Banco Central
const ipcae = {"2021-01": 0.0078, "2021-02": 0.0048, "2021-03": 0.0093, "2021-04": 0.006, "2021-05": 0.0044, "2021-06": 0.0083, "2021-07": 0.0072, "2021-08": 0.0089, "2021-09": 0.0114, "2021-10": 0.012, "2021-11": 0.0117, "2021-12": 0.0078, "2022-01": 0.0058, "2022-02": 0.0099, "2022-03": 0.0095, "2022-04": 0.0173, "2022-05": 0.0059, "2022-06": 0.0069, "2022-07": 0.0013, "2022-08": -0.0073, "2022-09": -0.0037, "2022-10": 0.0016, "2022-11": 0.0053, "2022-12": 0.0052, "2023-01": 0.0055, "2023-02": 0.0076, "2023-03": 0.0069, "2023-04": 0.0057, "2023-05": 0.0051, "2023-06": 0.0004, "2023-07": -0.0007, "2023-08": 0.0028, "2023-09": 0.0035, "2023-10": 0.0021, "2023-11": 0.0033, "2023-12": 0.004, "2024-01": 0.0031, "2024-02": 0.0078, "2024-03": 0.0036, "2024-04": 0.0021, "2024-05": 0.0044, "2024-06": 0.0039, "2024-07": 0.003, "2024-08": 0.0019, "2024-09": 0.0013, "2024-10": 0.0054, "2024-11": 0.0062, "2024-12": 0.0034, "2025-01": 0.0011, "2025-02": 0.0123, "2025-03": 0.0064, "2025-04": 0.0043, "2025-05": 0.0036, "2025-06": 0.0026, "2025-07": 0.0033, "2025-08": -0.0014, "2025-09": 0.0048, "2025-10": 0.0018, "2025-11": 0.002, "2025-12": 0.0025, "2026-01": 0.002, "2026-02": 0.0084, "2026-03": 0.0044, "2026-04": 0.0089, "2026-05": 0.0062, "2026-06": 0.0041, "2026-07": 0.0006, "2026-08": -0.004, "2026-09": 0.007};
const selic = {"2021-01": 0.0015, "2021-02": 0.0013, "2021-03": 0.002, "2021-04": 0.0021, "2021-05": 0.0027, "2021-06": 0.0031, "2021-07": 0.0036, "2021-08": 0.0043, "2021-09": 0.0044, "2021-10": 0.0049, "2021-11": 0.0059, "2021-12": 0.0077, "2022-01": 0.0073, "2022-02": 0.0076, "2022-03": 0.0093, "2022-04": 0.0083, "2022-05": 0.0103, "2022-06": 0.0102, "2022-07": 0.0103, "2022-08": 0.0117, "2022-09": 0.0107, "2022-10": 0.0102, "2022-11": 0.0102, "2022-12": 0.0112, "2023-01": 0.0112, "2023-02": 0.0092, "2023-03": 0.0117, "2023-04": 0.0092, "2023-05": 0.0112, "2023-06": 0.0107, "2023-07": 0.0107, "2023-08": 0.0114, "2023-09": 0.0097, "2023-10": 0.01, "2023-11": 0.0092, "2023-12": 0.0089, "2024-01": 0.0097, "2024-02": 0.008, "2024-03": 0.0083, "2024-04": 0.0089, "2024-05": 0.0083, "2024-06": 0.0079, "2024-07": 0.0091, "2024-08": 0.0087, "2024-09": 0.0084, "2024-10": 0.0093, "2024-11": 0.0079, "2024-12": 0.0093, "2025-01": 0.0101, "2025-02": 0.0099, "2025-03": 0.0096, "2025-04": 0.0106, "2025-05": 0.0114, "2025-06": 0.011, "2025-07": 0.0128, "2025-08": 0.0116, "2025-09": 0.0122, "2025-10": 0.0128, "2025-11": 0.0105, "2025-12": 0.0122, "2026-01": 0.0116, "2026-02": 0.01, "2026-03": 0.0121, "2026-04": 0.0109, "2026-05": 0.0107, "2026-06": 0.0112, "2026-07": 0.0122, "2026-08": 0.0109, "2026-09": 0.0108, "2026-10": 0.0066};
const ix = { ipca: {}, ipca15: {}, ipcae, selic };

describe("liquidação do cumprimento (caso Nabor, memória aceita no JEF de Joinville)", () => {
  const r = liquidar({
    base: "2026-08", regime: "ipcae_selic", restituicao: "simples", jurosMateriais: "desconto",
    contratos: [{ numero: "010015753239", parcela: 28.79, inicio: "2021-02", fim: "2026-04" }],
    moral: { valor: 5000, jurosDesde: "2021-02", correcaoDesde: "2026-04" }, compensacao: null,
    honorarios: { tipo: "percentual", pct: 10, minimo: 1621, minimoDesde: "2026-08", valor: 0, valorDesde: "" },
  }, ix);
  it("63 parcelas de 02/2021 a 04/2026", () => { expect(r.linhas.length).toBe(63); });
  it("danos materiais = R$ 2.581,20", () => { expect(r.materiais).toBeCloseTo(2581.2, 2); });
  it("danos morais = R$ 6.839,29", () => { expect(r.moral?.total).toBeCloseTo(6839.29, 2); });
  it("condenação = R$ 9.420,49 e honorários pelo piso de 1 salário mínimo", () => {
    expect(r.condenacao).toBeCloseTo(9420.49, 2); expect(r.honorarios?.pctValor).toBeCloseTo(942.05, 2);
    expect(r.honorarios?.valor).toBe(1621); expect(r.total).toBeCloseTo(11041.49, 2);
  });
});

describe("compensação do valor creditado", () => {
  const caso = (atualizacao?: "completa" | "correcao" | "historico") => liquidar({
    base: "2026-08", regime: "ipcae_selic", restituicao: "simples", jurosMateriais: "desconto",
    contratos: [{ numero: "1", parcela: 54, inicio: "2021-02", fim: "2026-04" }], moral: null,
    compensacao: { valor: 2299.83, mes: "2021-01", atualizacao }, honorarios: { tipo: "nenhum", pct: 0, minimo: 0, minimoDesde: "", valor: 0, valorDesde: "" },
  }, ix);
  it("valor histórico: abate exatamente o valor creditado, sem correção nem juros", () => {
    const r = caso("historico"); expect(r.compensacao?.total).toBe(2299.83); expect(r.compensacao?.juros).toBe(0);
    expect(r.condenacao).toBeCloseTo(r.materiais - 2299.83, 2);
  });
  it("só correção: corrige, mas sem juros", () => { const r = caso("correcao"); expect(r.compensacao!.total).toBeGreaterThan(2299.83); expect(r.compensacao!.juros).toBe(0); });
  it("padrão continua atualizando com correção e juros", () => { const r = caso(); expect(r.compensacao!.juros).toBeGreaterThan(0); });
});
