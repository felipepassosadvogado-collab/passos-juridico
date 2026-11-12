// WhatsApp conectado mas sem receber: a tela de conexão diz por quê e o botão regrava o endereço de entrega.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { bancoContado } from "./teste/bancoContado";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.doUnmock("@/lib/rota"); vi.restoreAllMocks(); });
beforeEach(() => { vi.resetModules(); vi.stubEnv("EVOLUTION_URL", "http://evo.x"); vi.stubEnv("EVOLUTION_API_KEY", "k"); vi.stubEnv("WHATSAPP_WEBHOOK_SECRET", "seg"); vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://passos-juridico.vercel.app"); });

async function situacao(webhook: unknown) {
  const b = bancoContado({ wa_mensagens: [{ id: "m1", de_mim: false, em: "2026-11-11T14:00:00Z" }] });
  vi.doMock("@/lib/rota", async (o) => ({ ...(await o() as object), membroDaRota: async () => ({ sb: b.sb, user: { id: "u" }, perfil: { papel: "titular" } }) }));
  const chamadas: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (u: string, init?: { method?: string }) => { chamadas.push((init?.method || "GET") + " " + String(u).replace("http://evo.x", ""));
    if (String(u).includes("connectionState")) return new Response(JSON.stringify({ instance: { state: "open" } }));
    if (String(u).includes("/webhook/find")) return new Response(JSON.stringify(webhook));
    return new Response("{}"); }));
  const rota = await import("@/app/api/whatsapp/conectar/route");
  return { rota, chamadas, j: await (await rota.GET()).json() };
}
const certo = "https://passos-juridico.vercel.app/api/whatsapp/webhook?s=seg";

describe("recebimento do WhatsApp", () => {
  it("tudo certo", async () => { const { j } = await situacao({ url: certo, enabled: true, events: ["MESSAGES_UPSERT"] }); expect(j.recebimento).toMatchObject({ ok: true, ultimaRecebida: "2026-11-11T14:00:00Z" }); });
  it("sem endereço, outro endereço, senha errada ou desligado: diz o motivo", async () => {
    expect((await situacao({})).j.recebimento.problema).toMatch(/sem endereço/);
    vi.resetModules(); expect((await situacao({ url: "https://antigo.up.railway.app/api/whatsapp/webhook?s=seg", enabled: true })).j.recebimento.problema).toMatch(/outro endereço \(antigo\.up\.railway\.app\)/);
    vi.resetModules(); expect((await situacao({ url: certo.replace("seg", "velha"), enabled: true })).j.recebimento.problema).toMatch(/senha/);
    vi.resetModules(); expect((await situacao({ webhook: { url: certo, enabled: false } })).j.recebimento.problema).toMatch(/desligada/);
  });
  it("religar grava o endereço certo sem desconectar", async () => {
    const { rota, chamadas } = await situacao({ url: certo, enabled: true });
    const r = await rota.POST(new Request("http://x", { method: "POST", body: JSON.stringify({ acao: "webhook" }) }));
    expect(r.status).toBe(200); expect(chamadas.some((c) => c.startsWith("POST /webhook/set/"))).toBe(true); expect(chamadas.some((c) => /logout|connect\//.test(c))).toBe(false);
  });
});
