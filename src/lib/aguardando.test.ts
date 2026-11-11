import { describe, expect, it } from "vitest";
import { esperaDaConversa, haQuanto } from "./aguardando";

describe("clientes aguardando a equipe", () => {
  it("a transferência conta como 1ª chamada, mesmo com a resposta da assistente por último", () => {
    expect(esperaDaConversa([{ de_mim: false, em: "2026-11-10T10:00" }, { de_mim: true, em: "2026-11-10T10:01" }]))
      .toEqual({ chamadas: 1, desde: "2026-11-10T10:01" });
  });
  it("cada mensagem do cliente depois da última do escritório é mais uma chamada", () => {
    const r = esperaDaConversa([
      { de_mim: false, em: "2026-11-10T10:00" }, { de_mim: true, em: "2026-11-10T10:01" },
      { de_mim: false, em: "2026-11-10T11:00" }, { de_mim: false, em: "2026-11-10T12:00" }, { de_mim: false, em: "2026-11-10T13:00" },
    ]);
    expect(r).toEqual({ chamadas: 3, desde: "2026-11-10T11:00" });
  });
  it("aceita as mensagens fora de ordem e sem nenhuma do escritório", () => {
    expect(esperaDaConversa([{ de_mim: false, em: "2026-11-10T12:00" }, { de_mim: false, em: "2026-11-10T09:00" }]))
      .toEqual({ chamadas: 2, desde: "2026-11-10T09:00" });
    expect(esperaDaConversa([])).toEqual({ chamadas: 1, desde: null });
  });
  it("escreve há quanto tempo", () => {
    const agora = new Date("2026-11-10T12:00:00Z").getTime();
    expect(haQuanto("2026-11-10T11:59:40Z", agora)).toBe("agora");
    expect(haQuanto("2026-11-10T11:15:00Z", agora)).toBe("há 45 min");
    expect(haQuanto("2026-11-10T07:00:00Z", agora)).toBe("há 5 h");
    expect(haQuanto("2026-11-08T12:00:00Z", agora)).toBe("há 2 dias");
    expect(haQuanto(null, agora)).toBe("");
  });
});
