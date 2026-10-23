import { expect, it } from "vitest";
import { calcularProdutividade, refTarefa } from "./produtividade";

it("usa o menor entre a referência e o tempo real; baixa em lote não infla", () => {
  expect(refTarefa("Manifestação ao laudo pericial")).toBe(60); expect(refTarefa("Contato com o cliente")).toBe(10); expect(refTarefa(null, "qualquer")).toBe(15);
  const d = "2026-10-23T";
  const ativ = [
    { em: d + "09:40:00-03:00", tipo: "tarefa" as const, ref: 60 },  // 40 min desde a entrada (09:00) → 40
    { em: d + "11:00:00-03:00", tipo: "tarefa" as const, ref: 60 },  // 80 min depois → 60 (referência)
    ...Array.from({ length: 10 }, (_, i) => ({ em: d + `15:00:${String(i * 5).padStart(2, "0")}-03:00`, tipo: "tarefa" as const, ref: 15 })), // lote: 5 s entre elas
  ];
  const p = calcularProdutividade(ativ, [{ dia: "2026-10-23", primeiro: d + "09:00:00-03:00", segundos: 6 * 3600 }], 480);
  expect(p.diasTrabalhados).toBe(1);
  expect(Math.round(p.mediaMin)).toBe(40 + 60 + 15 + 9); // a 1ª do lote conta 15 (bem depois das 11h), as outras 9 ≈ 1 min cada
  expect(p.emLote).toBe(9); expect(p.nota).toBe("Abaixo do esperado"); expect(p.mediaSistemaMin).toBe(360);
});
