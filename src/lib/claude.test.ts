import { afterEach, expect, it, vi } from "vitest";
import { pedirJson } from "./claude";

const sse = (partes: string[], parada = "end_turn") => {
  const evs = [...partes.map((t) => ({ type: "content_block_delta", delta: { type: "text_delta", text: t } })), { type: "message_delta", delta: { stop_reason: parada } }];
  const txt = evs.map((e) => "event: x\ndata: " + JSON.stringify(e) + "\n\n").join("");
  return new Response(new ReadableStream({ start(c) { const b = new TextEncoder().encode(txt); for (let i = 0; i < b.length; i += 7) c.enqueue(b.slice(i, i + 7)); c.close(); } }));
};
afterEach(() => vi.unstubAllGlobals());
process.env.ANTHROPIC_API_KEY = "k";

it("junta o streaming e conserta aspas sem escape", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => sse(['```json\n{"titulo": "RÉPLICA", "blocos": [{"t": "o réu diz "não contratou" ', 'nada"}]}\n```'])));
  const r = await pedirJson<{ titulo: string; blocos: { t: string }[] }>([{ type: "text", text: "x" }], 32000);
  expect(r.titulo).toBe("RÉPLICA"); expect(r.blocos[0].t).toContain("não contratou");
});
it("resposta cortada no limite: aproveita a peça se veio quase inteira", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => sse(['{"titulo": "R", "blocos": [{"t": "um"}, {"t": "do'], "max_tokens")));
  const r = await pedirJson<{ blocos: unknown[] }>([{ type: "text", text: "x" }], 32000);
  expect(r.blocos.length).toBe(2);
});
it("resposta curta sem streaming continua igual", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: '[{"id":"1"}]' }], stop_reason: "end_turn" }))));
  expect(await pedirJson([{ type: "text", text: "x" }], 6000)).toEqual([{ id: "1" }]);
});
