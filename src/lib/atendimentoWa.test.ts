import { describe, expect, it } from "vitest";
import { contatoDoCaso, foneDaObs, lerResposta, primeiroFone, promptRespostaAtendimento } from "./atendimentoWa";
import { bancoContado } from "./teste/bancoContado";

describe("responder o cliente pela ficha do atendimento", () => {
  it("lê o telefone anotado pela assistente e o da ficha", () => {
    expect(foneDaObs("Pelo WhatsApp (5547996424673) · Joinville\nresumo")).toBe("5547996424673");
    expect(foneDaObs("Pelo WhatsApp () \nx")).toBeNull();
    expect(foneDaObs(null)).toBeNull();
    expect(primeiroFone("47 9999-000 / (47) 98888-1111")).toBe("5547988881111");
  });
  it("acha a conversa pela ficha do cliente ou pelo telefone da anotação", async () => {
    const b = bancoContado({
      clientes: [{ id: "c1", nome: "MARIA", telefone: "(47) 98888-1111" }],
      wa_conversas: [{ id: "w1", nome: "Maria", telefone: "5547988881111", cliente_id: "c1", ultima_em: "2026-11-03" }, { id: "w2", nome: "João", telefone: "554799990000", cliente_id: null, ultima_em: "2026-11-02" }],
      wa_mensagens: [{ conversa_id: "w2", de_mim: false, texto: "oi", tipo: "texto", em: "2026-11-02T10:00:00Z" }, { conversa_id: "w2", de_mim: true, texto: "olá", tipo: "texto", em: "2026-11-02T10:01:00Z" }],
    });
    expect((await contatoDoCaso(b.sb, { cliente_id: "c1", obs: null })).conversaId).toBe("w1");
    const pelaObs = await contatoDoCaso(b.sb, { cliente_id: null, obs: "Pelo WhatsApp (5547999990000)\nx" }); // com o 9 a mais: é o mesmo número
    expect(pelaObs.conversaId).toBe("w2");
    expect(pelaObs.mensagens.map((m) => m.texto)).toEqual(["oi", "olá"]);
    const semConversa = await contatoDoCaso(b.sb, { cliente_id: null, obs: "Pelo WhatsApp (5511912345678)" });
    expect(semConversa).toMatchObject({ conversaId: null, telefone: "5511912345678", avulso: true });
  });
  it("o pedido ao Claude leva as instruções, o atendimento e a conversa", () => {
    const p = promptRespostaAtendimento({ nome: "SAMUEL GUILHERME MENDES", banco: null, contratos: null, etapa: "Primeiro atendimento", obs: "quer saber do auxílio-acidente",
      instrucoes: "dizer que ela não tem direito porque não era segurada", mensagens: [{ de_mim: false, texto: "Ela tem direito?", tipo: "texto", em: "x" }] });
    expect(p).toContain("dizer que ela não tem direito porque não era segurada");
    expect(p).toContain("Olá, Samuel!");
    expect(p).toContain("Cliente: Ela tem direito?");
    expect(p).toContain("quer saber do auxílio-acidente");
  });
  it("separa a mensagem do que conferir", () => {
    expect(lerResposta("Olá!\n\n===CONFERIR===\n- data do acidente")).toEqual({ mensagem: "Olá!", alertas: ["data do acidente"] });
  });
});
