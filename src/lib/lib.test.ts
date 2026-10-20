import { describe, expect, it } from "vitest";
import { calcularVencimento, situacaoPrazo } from "./prazos";
import { cnjValido, mascaraCnj, infoCnj, cidadeDoJuizo } from "./cnj";
import { cpfValido, nomeBonito, porExtenso, foneWhatsapp, idade, numeroBR } from "./formato";

describe("prazos em dias úteis", () => {
  it("intimação pelo eproc: ciência tácita em 10 dias corridos", () => {
    // 19/10 + 10 = 29/10; prazo corre de 30/10, pula 02/11 e 20/11
    expect(calcularVencimento("2026-10-19", 15, true)).toBe("2026-11-23");
  });
  it("publicação no DJEN: 1º dia útil seguinte", () => {
    expect(calcularVencimento("2026-10-19", 5, false)).toBe("2026-10-27");
  });
  it("respeita o recesso de 20/12 a 20/01", () => {
    expect(calcularVencimento("2026-12-18", 5, false)).toBe("2027-01-28");
  });
  it("descreve a situação do prazo", () => {
    expect(situacaoPrazo("2026-10-20", "2026-10-20").texto).toBe("vence hoje");
    expect(situacaoPrazo("2026-10-18", "2026-10-20").texto).toBe("vencido há 2 dias");
  });
});

describe("número CNJ", () => {
  it("valida e formata", () => {
    expect(cnjValido("50157251220264047201")).toBe(true);
    expect(cnjValido("50157251320264047201")).toBe(false);
    expect(mascaraCnj("50157251220264047201")).toBe("5015725-12.2026.4.04.7201");
    expect(infoCnj("50157251220264047201")?.tribunal).toBe("TRF4");
  });
  it("tira a cidade do nome do juízo", () => {
    expect(cidadeDoJuizo("6ª Vara Federal de Joinville")).toBe("Joinville");
    expect(cidadeDoJuizo("2ª Vara da Fazenda Pública da Comarca de Joinville")).toBe("Joinville");
    expect(cidadeDoJuizo("1ª Vara Federal de Jaraguá do Sul")).toBe("Jaraguá do Sul");
    expect(cidadeDoJuizo("Vara Estadual de Direito Bancário")).toBe("");
  });
});

describe("formatação", () => {
  it("CPF", () => { expect(cpfValido("529.982.247-25")).toBe(true); expect(cpfValido("111.111.111-11")).toBe(false); });
  it("nomes", () => {
    expect(nomeBonito("BANCO C6 CONSIGNADO S.A.")).toBe("Banco C6 Consignado S.A.");
    expect(nomeBonito("INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS")).toBe("Instituto Nacional do Seguro Social - INSS");
    expect(nomeBonito("MARIA DAS GRAÇAS DE SOUZA")).toBe("Maria das Graças de Souza");
  });
  it("valor por extenso", () => {
    expect(porExtenso(20892.56)).toBe("vinte mil oitocentos e noventa e dois reais e cinquenta e seis centavos");
    expect(porExtenso(1100)).toBe("mil e cem reais");
    expect(porExtenso(10000)).toBe("dez mil reais");
  });
  it("WhatsApp, idade e números", () => {
    expect(foneWhatsapp("(47) 9 9642-4673")).toBe("5547996424673");
    expect(idade("1960-10-21", "2026-10-20")).toBe(65);
    expect(numeroBR("5.446,28")).toBe(5446.28);
  });
});
