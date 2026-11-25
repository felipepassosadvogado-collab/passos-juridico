import { describe, expect, it } from "vitest";
import { horarioComercial, rodadaVigia, silencioSuspeito } from "./whatsappVigia";

const base = () => {
  const feito: string[] = [];
  return { feito, dp: {
    estado: async () => "open", webhook: async () => ({ ok: true, problema: "" }), religarWebhook: async () => { feito.push("religar"); },
    sondar: async () => true, reiniciar: async () => { feito.push("reiniciar"); }, recentes: async () => [] as Record<string, unknown>[],
    gravar: async (_d: Record<string, unknown>) => false, ultimaNoSistema: async () => new Date().toISOString(), avisar: async (t: string) => { feito.push("avisar:" + t.slice(0, 30)); },
  } };
};
const qua15h = new Date("2026-11-25T18:00:00Z"); // quarta, 15h em Brasília

describe("vigia do WhatsApp", () => {
  it("horário comercial", () => { expect(horarioComercial(qua15h)).toBe(true); expect(horarioComercial(new Date("2026-11-29T15:00:00Z"))).toBe(false); expect(horarioComercial(new Date("2026-11-25T23:30:00Z"))).toBe(false); });
  it("silêncio: só conta a partir das 8h e respeita o último reinício", () => {
    expect(silencioSuspeito({ agora: new Date("2026-11-25T11:40:00Z"), ultimaRecebida: "2026-11-24T22:00:00Z", ultimoReinicio: null })).toBe(false); // 8h40: só 40 min desde as 8h
    expect(silencioSuspeito({ agora: qua15h, ultimaRecebida: "2026-11-25T14:00:00Z", ultimoReinicio: null })).toBe(true);
    expect(silencioSuspeito({ agora: qua15h, ultimaRecebida: "2026-11-25T14:00:00Z", ultimoReinicio: "2026-11-25T17:30:00Z" })).toBe(false);
  });
  it("tudo certo: não mexe em nada", async () => {
    const { dp, feito } = base(); const r = await rodadaVigia(dp, null, qua15h);
    expect(r.ok).toBe(true); expect(feito).toEqual([]); expect(r.sonda).toBe("ok");
  });
  it("conectada mas não responde: reinicia; se continuar logo depois, avisa sem reiniciar de novo", async () => {
    const { dp, feito } = base(); dp.sondar = async () => false;
    const r1 = await rodadaVigia(dp, null, qua15h); expect(feito).toEqual(["reiniciar"]); expect(r1.ultimoReinicio).toBe(qua15h.toISOString());
    const r2 = await rodadaVigia(dp, r1, new Date(qua15h.getTime() + 10 * 60e3));
    expect(feito.filter((x) => x === "reiniciar").length).toBe(1); expect(r2.ok).toBe(false); expect(feito.some((x) => x.startsWith("avisar"))).toBe(true);
  });
  it("entrega errada: religa; mensagens perdidas: recupera", async () => {
    const { dp, feito } = base(); let n = 0; dp.webhook = async () => (n++ ? { ok: true, problema: "" } : { ok: false, problema: "entregava para outro endereço" });
    dp.recentes = async () => [{ key: { id: "a", fromMe: false }, messageTimestamp: 1795000000 }, { key: { id: "b", fromMe: false }, messageTimestamp: 1795000100 }];
    dp.gravar = async (d) => (d as { key: { id: string } }).key.id === "b";
    const r = await rodadaVigia(dp, null, qua15h);
    expect(feito).toContain("religar"); expect(r.recuperadas).toBe(1); expect(r.ok).toBe(true);
    expect(r.historico.map((h) => h.tipo)).toEqual(["conserto", "conserto"]);
  });
  it("silêncio de horas no horário comercial: reinicia por precaução", async () => {
    const { dp, feito } = base(); dp.ultimaNoSistema = async () => "2026-11-25T13:00:00Z";
    await rodadaVigia(dp, null, qua15h); expect(feito).toEqual(["reiniciar"]);
  });
  it("desconectado (precisa de QR): avisa o titular uma vez a cada 2 h", async () => {
    const { dp, feito } = base(); dp.estado = async () => "close";
    const r1 = await rodadaVigia(dp, null, qua15h); const r2 = await rodadaVigia(dp, r1, new Date(qua15h.getTime() + 20 * 60e3));
    expect(feito.filter((x) => x.startsWith("avisar")).length).toBe(1); expect(r2.ok).toBe(false); expect(feito).not.toContain("reiniciar");
  });
});

describe("verificar agora (titular)", () => {
  it("sem mensagem há 20 min: reinicia mesmo com tudo parecendo certo", async () => {
    const { dp, feito } = base(); dp.ultimaNoSistema = async () => new Date(qua15h.getTime() - 25 * 60e3).toISOString();
    await rodadaVigia(dp, null, qua15h, { manual: true }); expect(feito).toEqual(["reiniciar"]);
  });
  it("mensagem recebida há pouco: não reinicia", async () => {
    const { dp, feito } = base(); dp.ultimaNoSistema = async () => new Date(qua15h.getTime() - 5 * 60e3).toISOString();
    await rodadaVigia(dp, null, qua15h, { manual: true }); expect(feito).toEqual([]);
  });
});
