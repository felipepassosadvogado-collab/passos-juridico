import { describe, expect, it } from "vitest";
import { intervalo, protocoladoEm, resumirProtocolos } from "./protocolos";
import type { Protocolo } from "./relatorioCrm";

describe("períodos do protocolo", () => {
  const hoje = "2026-11-05"; // quinta-feira
  it("semana de segunda a domingo, mês e ano", () => {
    expect(intervalo("semana", hoje)).toEqual({ de: "2026-11-02", ate: "2026-11-08" });
    expect(intervalo("semana_passada", hoje)).toEqual({ de: "2026-10-26", ate: "2026-11-01" });
    expect(intervalo("mes", hoje)).toEqual({ de: "2026-11-01", ate: "2026-11-30" });
    expect(intervalo("mes_passado", hoje)).toEqual({ de: "2026-10-01", ate: "2026-10-31" });
    expect(intervalo("ano", hoje)).toEqual({ de: "2026-01-01", ate: "2026-12-31" });
    expect(intervalo("ano_passado", hoje)).toEqual({ de: "2025-01-01", ate: "2025-12-31" });
    expect(intervalo("mes", "2026-01-15").de).toBe("2026-01-01"); expect(intervalo("mes_passado", "2026-01-15")).toEqual({ de: "2025-12-01", ate: "2025-12-31" });
    expect(intervalo("periodo", hoje, "2026-10-29", "")).toEqual({ de: "2026-10-29", ate: "" });
  });
  it("data só com o ano (nº CNJ) entra no ano, não no mês", () => {
    const soAno: Protocolo = { data: "2026-01-01", precisao: "ano", fonte: "ano do nº CNJ" };
    expect(protocoladoEm(soAno, "2026-01-01", "2026-12-31")).toBe(true);
    expect(protocoladoEm(soAno, "2026-11-01", "2026-11-30")).toBe(false);
    expect(protocoladoEm({ data: "2026-11-03", precisao: "dia", fonte: "x" }, "2026-11-02", "2026-11-08")).toBe(true);
  });
});

describe("resumo por cidade e vara", () => {
  it("agrupa cidade → varas, vara, mês e justiça", () => {
    const P = (numero: string, orgao: string) => ({ numero, mascara: numero, cliente_nome: "FULANO", orgao, banco: "Banco C6 Consignado S.A.", cidade: null, tribunal: null });
    const procs = [P("50000010220264047201", "6ª Vara Federal de Joinville"), P("50000020220264047201", "6ª Vara Federal de Joinville"), P("50000030220264047201", "2ª Vara Federal de Joinville"), P("50000040220268240038", "Vara Cível de Blumenau")];
    const prot = new Map<string, Protocolo>([["50000010220264047201", { data: "2026-10-05", precisao: "dia", fonte: "t" }], ["50000020220264047201", { data: "2026-11-03", precisao: "aprox", fonte: "t" }], ["50000030220264047201", { data: "2026-11-04", precisao: "dia", fonte: "t" }]]);
    const r = resumirProtocolos(procs, prot, () => "C6", (s) => s);
    expect(r.total).toBe(4);
    expect(r.porCidade[0]).toEqual({ nome: "Joinville", n: 3, detalhe: [{ nome: "6ª Vara Federal de Joinville", n: 2 }, { nome: "2ª Vara Federal de Joinville", n: 1 }] });
    expect(r.porCidade[1].nome).toBe("Blumenau");
    expect(r.porMes).toEqual([{ nome: "outubro/2026", n: 1 }, { nome: "novembro/2026", n: 2 }]);
    expect(r.porJustica).toEqual([{ nome: "Federal", n: 3 }, { nome: "Estadual", n: 1 }]);
    expect(r.aprox).toBe(1); expect(r.semData).toBe(1);
  });
});

describe("cidade de origem", () => {
  it("processo na Turma Recursal conta na cidade da vara de origem (código do nº CNJ)", () => {
    const P = (numero: string, orgao: string) => ({ numero, mascara: numero, cliente_nome: "X", orgao, banco: null, cidade: null, tribunal: null });
    const todos = [P("50000010220264047201", "6ª Vara Federal de Joinville"), P("50000050220254047201", "3ª Turma Recursal de SC"), P("50000060220254047205", "Turma Recursal de SC")];
    const r = resumirProtocolos(todos, new Map(), () => "", (s) => s);
    expect(r.porCidade.find((c) => c.nome === "Joinville")!.n).toBe(2);
    expect(r.linhas[2].cidade).toBe("SC"); // origem desconhecida: fica o que dá para saber
  });
});
