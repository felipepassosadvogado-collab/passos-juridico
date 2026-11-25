import { describe, expect, it } from "vitest";
import { FUNCOES_PADRAO, deveAbrirHoje, lerFuncoes } from "./funcoes";
describe("roteiro de funções", () => {
  it("lê seções, itens e destaque", () => {
    const b = lerFuncoes("> atenção\n# Um\n- a\n- b\ntexto\n# Dois\n- c");
    expect(b.map((x) => x.texto)).toEqual(["", "Um", "Dois"]); expect(b[0].itens[0].tipo).toBe("destaque"); expect(b[1].itens.map((i) => i.tipo)).toEqual(["item", "item", "par"]);
    expect(lerFuncoes(FUNCOES_PADRAO.texto).filter((x) => x.texto).length).toBe(7);
  });
  it("abre no primeiro acesso do dia, não para o titular", () => {
    expect(deveAbrirHoje(null, "2026-11-25", false)).toBe(true); expect(deveAbrirHoje("2026-11-25", "2026-11-25", false)).toBe(false);
    expect(deveAbrirHoje("2026-11-24", "2026-11-25", false)).toBe(true); expect(deveAbrirHoje(null, "2026-11-25", true)).toBe(false);
  });
});
