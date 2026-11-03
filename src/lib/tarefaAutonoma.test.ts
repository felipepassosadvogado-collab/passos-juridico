import { describe, expect, it } from "vitest";
import { datasRepeticao } from "./repeticao";

describe("tarefa autônoma que se repete", () => {
  it("todo dia útil de 03/11 a 18/12/2026: sem fins de semana e sem o feriado de 20/11", () => {
    const l = datasRepeticao("2026-11-03", "2026-12-18", "util");
    expect(l).toHaveLength(33); expect(l[0]).toBe("2026-11-03"); expect(l[l.length - 1]).toBe("2026-12-18");
    expect(l).not.toContain("2026-11-20"); expect(l).not.toContain("2026-11-07");
  });
  it("todos os dias, toda semana e sem repetir", () => {
    expect(datasRepeticao("2026-11-03", "2026-11-09", "todo")).toHaveLength(7);
    expect(datasRepeticao("2026-11-03", "2026-12-01", "semana")).toEqual(["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24", "2026-12-01"]);
    expect(datasRepeticao("2026-11-03", "2026-12-18", "nao")).toEqual(["2026-11-03"]);
  });
});
