import { afterEach, describe, expect, it, vi } from "vitest";
import { acharCliente, ehNossa, sincronizarDjen, type ItemDjen } from "./djen";
import { calcularVencimento, definirSuspensoes, feriadosDoAno, foroDe, pascoa } from "./prazos";

describe("calendário dos prazos", () => {
  it("Páscoa e feriados móveis", () => {
    expect(pascoa(2026).toISOString().slice(0, 10)).toBe("2026-04-05");
    expect(pascoa(2027).toISOString().slice(0, 10)).toBe("2027-03-28");
    expect(feriadosDoAno(2027, "jf").get("2027-02-09")).toBe("Carnaval");
    expect(feriadosDoAno(2026, "jf").get("2026-06-04")).toBe("Corpus Christi");
  });
  it("Justiça Federal x TJSC", () => {
    expect(feriadosDoAno(2026, "jf").has("2026-08-11")).toBe(true);
    expect(feriadosDoAno(2026, "tjsc").has("2026-08-11")).toBe(false);
    expect(feriadosDoAno(2026, "tjsc").has("2026-10-28")).toBe(true);
    expect(foroDe("50157251220264047201")).toBe("jf"); expect(foroDe("50952582920238240930")).toBe("tjsc");
    // DJEN 23/10/2026, 5 dias: JF conta 28/10; TJSC pula 28/10 (Dia do Servidor)
    expect(calcularVencimento("2026-10-23", 5, false, "jf")).toBe("2026-11-03");
    expect(calcularVencimento("2026-10-23", 5, false, "tjsc")).toBe("2026-11-04");
  });
  it("suspensão cadastrada (feriado municipal) empurra o prazo só na cidade dela", () => {
    definirSuspensoes([{ ini: "2027-03-09", foro: "todos", cidade: "Joinville", descricao: "Aniversário de Joinville" }]);
    expect(calcularVencimento("2027-03-04", 3, false, "jf", "Joinville")).toBe("2027-03-11");
    expect(calcularVencimento("2027-03-04", 3, false, "jf", "Blumenau")).toBe("2027-03-10");
    definirSuspensoes([]);
  });
});

const item = (id: number, adv: { nome: string; numero_oab: string }[], texto = "", destinatarios: { nome: string; polo: string }[] = []): ItemDjen =>
  ({ id, data_disponibilizacao: "2026-10-22", numero_processo: "50157251220264047201", texto, destinatarioadvogados: adv.map((a) => ({ advogado: { ...a, uf_oab: "SC" } })), destinatarios } as ItemDjen);

describe("variações da busca", () => {
  it("nome com outra OAB é homônimo; nome abreviado no texto vale", () => {
    expect(ehNossa(item(1, [{ nome: "FELIPE DOS PASSOS SILVA", numero_oab: "58547" }]), { tipo: "advogado", nome: "FELIPE DOS PASSOS SILVA" })).toBe(true);
    expect(ehNossa(item(2, [{ nome: "FELIPE DOS PASSOS SILVA", numero_oab: "11111" }]), { tipo: "advogado", nome: "FELIPE DOS PASSOS SILVA" })).toBe(false);
    expect(ehNossa(item(3, [], "Advogado: FELIPE D. PASSOS SILVA"), { tipo: "advogado", nome: "FELIPE D. PASSOS SILVA" })).toBe(true);
    expect(ehNossa(item(4, [], "", [{ nome: "PASSOS SOCIEDADE INDIVIDUAL DE ADVOCACIA", polo: "A" }]), { tipo: "parte", nome: "PASSOS SOCIEDADE INDIVIDUAL DE ADVOCACIA" })).toBe(true);
    expect(ehNossa(item(5, [{ nome: "OUTRO", numero_oab: "999" }]), { tipo: "oab", numero: "58547", uf: null })).toBe(false);
  });
  it("liga o processo à ficha certa: igual, parecido (uma letra) ou ambíguo", () => {
    const cs = [{ id: "a", nome: "Maria de Lourdes Freitas Godoy Bertoti", cpf: "1" }, { id: "b", nome: "Valdelir Cardoso de Lima", cpf: "2" }, { id: "c", nome: "Joao dos Santos", cpf: "3" }, { id: "d", nome: "Joao Carlos dos Santos", cpf: null }];
    expect(acharCliente("MARIA DE LOURDES FREITAS DE GODOY BERTOTI", cs)).toEqual({ id: "a", como: "igual" });
    expect(acharCliente("VALDELIR CARDOZO DE LIMA", cs)).toEqual({ id: "b", como: "parecido" });
    expect(acharCliente("JOAO PEDRO DOS SANTOS", cs).id).toBeNull();
    expect(acharCliente("FULANO NOVO", cs)).toEqual({ id: null, como: "nenhum" });
  });
});

// banco em memória mínimo para a sincronização
function bancoFalso() {
  const db: Record<string, any[]> = { config: [], publicacoes: [], processos: [], clientes: [], eventos: [], djen_execucoes: [], profiles: [{ id: "t", papel: "titular", ativo: true }], notificacoes: [] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const q = (t: string) => { const f: ((r: any) => boolean)[] = []; let acao = "select"; let dados: any = null; // eslint-disable-line @typescript-eslint/no-explicit-any
    const api: any = { select: () => api, eq: (c: string, v: unknown) => (f.push((r) => r[c] === v), api), in: (c: string, v: unknown[]) => (f.push((r) => v.includes(r[c])), api), order: () => api, limit: () => api, range: () => api, ilike: () => api, // eslint-disable-line @typescript-eslint/no-explicit-any
      insert: (d: any) => ((acao = "insert"), (dados = d), api), upsert: (d: any) => ((acao = "upsert"), (dados = d), api), update: (d: any) => ((acao = "update"), (dados = d), api), // eslint-disable-line @typescript-eslint/no-explicit-any
      run() { if (acao === "insert" || acao === "upsert") { const l = [dados].flat().map((x) => ({ id: x.id ?? "id" + Math.random(), ...x })); if (t === "config") db[t] = db[t].filter((r) => !l.some((y) => y.chave === r.chave)); db[t].push(...l); return l; }
        const l = db[t].filter((r) => f.every((g) => g(r))); if (acao === "update") for (const r of l) Object.assign(r, dados); return l; },
      maybeSingle: () => Promise.resolve({ data: api.run()[0] ?? null }), single: () => Promise.resolve({ data: api.run()[0] ?? null }), then: (ok: (x: unknown) => void) => ok({ data: api.run(), error: null }) };
    return api; };
  return { db, adm: { from: q } as any }; // eslint-disable-line @typescript-eslint/no-explicit-any
}
afterEach(() => vi.unstubAllGlobals());

describe("sincronização: falha nunca parece dia sem publicação", () => {
  it("paginação incompleta da OAB = busca falhou, cobertura não avança e fica registrada", async () => {
    const { db, adm } = bancoFalso();
    vi.stubGlobal("fetch", vi.fn(async (u: URL) => {
      const p = u.searchParams; const pag = +p.get("pagina")!;
      if (p.get("ufOab") === "SC") return new Response(JSON.stringify({ count: 150, items: pag === 1 ? Array.from({ length: 100 }, (_, i) => ({ ...item(1000 + i, [{ nome: "FELIPE DOS PASSOS SILVA", numero_oab: "58547" }]), ativo: true })) : [] }), { headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ count: 0, items: [] }), { headers: { "content-type": "application/json" } });
    }));
    const r = await sincronizarDjen(adm, "automatica", false);
    expect(r.erro).toMatch(/paginação incompleta/);
    expect(r.completa).toBe(false);
    expect(db.publicacoes.length).toBe(100); // o que veio não se perde
    expect(db.djen_execucoes[0]).toMatchObject({ ok: false, completa: false });
    expect(db.config.find((c) => c.chave === "djen").valor.coberturaAte).toBeUndefined();
  }, 60000);
  it("tudo certo: une as variações sem duplicar e marca a cobertura", async () => {
    const { db, adm } = bancoFalso();
    db.clientes.push({ id: "c1", nome: "Maria das Gracas de Souza", cpf: "x" });
    vi.stubGlobal("fetch", vi.fn(async (u: URL) => {
      const p = u.searchParams; const pag = +p.get("pagina")!;
      const it = { ...item(77, [{ nome: "FELIPE DOS PASSOS SILVA", numero_oab: "58547" }], "", [{ nome: "MARIA DAS GRAÇAS DE SOUZA", polo: "A" }, { nome: "BANCO C6 CONSIGNADO S.A.", polo: "P" }]), ativo: true };
      const items = pag === 1 && (p.get("numeroOab") || p.get("nomeAdvogado") === "FELIPE DOS PASSOS SILVA") ? [it] : [];
      return new Response(JSON.stringify({ count: items.length ? 1 : 0, items }), { headers: { "content-type": "application/json" } });
    }));
    const r = await sincronizarDjen(adm, "manual", false);
    expect(r.erro).toBeUndefined(); expect(r.completa).toBe(true);
    expect(db.publicacoes.length).toBe(1); expect(db.processos[0]).toMatchObject({ cliente_id: "c1" });
    expect(db.config.find((c) => c.chave === "djen").valor.coberturaAte).toBeTruthy();
    expect(db.djen_execucoes[0].consultas.length).toBeGreaterThan(5);
  }, 60000);
});
