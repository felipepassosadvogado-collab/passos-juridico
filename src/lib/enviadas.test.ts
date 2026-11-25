import { describe, expect, it } from "vitest";
import { diasUteis, resumirEnviadas } from "./enviadas";

const m = (id: string, conv: string, em: string, tipo = "texto") => ({ id, conversa_id: conv, texto: "oi", tipo, anexo_nome: null, em, agente: false });
describe("relatório de enviadas", () => {
  it("dias úteis até hoje", () => { expect(diasUteis("2026-11-23", "2026-11-29", "2026-11-25")).toBe(3); expect(diasUteis("2026-11-01", "2026-11-30", "2026-12-10")).toBe(21); });
  it("agrupa por dia de Brasília, conta clientes e horários", () => {
    const r = resumirEnviadas([m("1", "a", "2026-11-25T13:56:00Z"), m("2", "a", "2026-11-25T12:10:00Z"), m("3", "b", "2026-11-25T02:30:00Z", "documento"), m("4", "b", "2026-11-24T18:00:00Z")], "2026-11-23", "2026-11-25", "2026-11-25");
    expect(r.total).toBe(4); expect(r.conversas).toBe(2); expect(r.anexos).toBe(1);
    expect(r.dias.map((d) => [d.dia, d.n, d.conversas, d.primeira, d.ultima])).toEqual([["2026-11-25", 2, 1, "09:10", "10:56"], ["2026-11-24", 2, 1, "15:00", "23:30"]]);
    expect(r.mediaDiaUtil).toBe(1.3);
  });
});
