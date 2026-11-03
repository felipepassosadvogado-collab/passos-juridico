import { describe, expect, it } from "vitest";
import { numerosPagina, padraoDigitos, recorte } from "./lista";
import { chaveFone } from "./whatsapp";

// mesma semântica do ILIKE do Postgres (% = qualquer coisa, _ = um caractere, sem maiúsculas)
const ilike = (valor: string, pad: string) => new RegExp("^" + pad.split("").map((c) => (c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("") + "$", "is").test(valor);

describe("recorte da página", () => {
  it("primeira, meio e última página", () => {
    expect(recorte(517, 1, 50)).toMatchObject({ pagina: 1, paginas: 11, ini: 0, fim: 50 });
    expect(recorte(517, 4, 50)).toMatchObject({ ini: 150, fim: 200 });
    expect(recorte(517, 11, 50)).toMatchObject({ ini: 500, fim: 517 });
  });
  it("página além do fim volta para a última (lista encolheu por um filtro)", () => expect(recorte(30, 9, 25)).toMatchObject({ pagina: 2, ini: 25, fim: 30 }));
  it("lista vazia não quebra", () => expect(recorte(0, 3, 50)).toMatchObject({ pagina: 1, paginas: 1, ini: 0, fim: 0 }));
  it("números com reticências", () => {
    expect(numerosPagina(1, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(numerosPagina(6, 22)).toEqual([1, "…", 5, 6, 7, "…", 22]);
    expect(numerosPagina(1, 22)).toEqual([1, 2, "…", 22]);
  });
});

describe("filtro de dígitos no banco (telefone e CPF)", () => {
  const formatos = ["(47) 99999-1111", "47 9 9999-1111", "47999991111", "+55 47 99999-1111", "4799991111", "(47) 99999-1111 / (47) 3333-2222", "99999-1111 (filha)"];
  it("o padrão casa com o telefone em qualquer formatação", () => {
    const pad = padraoDigitos("5547999991111".slice(-8))!;
    for (const f of formatos) expect(ilike(f, pad), f).toBe(true);
  });
  it("CPF com e sem pontuação", () => {
    const pad = padraoDigitos("12345678901", 11)!;
    for (const f of ["123.456.789-01", "12345678901", "123 456 789 01"]) expect(ilike(f, pad)).toBe(true);
    expect(ilike("123.456.789-02", pad)).toBe(false);
  });
  it("nunca perde uma ficha que a comparação exata acharia (superconjunto) e corta as demais", () => {
    // 3.000 fichas de teste com telefones variados e formatações diferentes
    const fichas: string[] = []; let x = 7;
    const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 3000; i++) {
      const ddd = ["47", "48", "11"][Math.floor(rnd() * 3)]; const n = String(Math.floor(rnd() * 1e8)).padStart(8, "0"); const nove = rnd() < 0.7 ? "9" : "";
      const fmt = Math.floor(rnd() * 3); fichas.push(fmt === 0 ? `(${ddd}) ${nove}${n.slice(0, 4)}-${n.slice(4)}` : fmt === 1 ? ddd + nove + n : `${nove}${n.slice(0, 4)} ${n.slice(4)}`);
    }
    fichas.push("(47) 99999-1111", "47 99991111", "(47) 9999-1111");
    const conversa = "5547999991111";
    const exato = (t: string) => String(t).split(/[\/,;]| e /).some((y) => chaveFone(y) === chaveFone(conversa));
    const pad = padraoDigitos(conversa.slice(-8))!;
    const candidatos = fichas.filter((f) => ilike(f, pad));
    const antes = fichas.filter(exato), depois = candidatos.filter(exato);
    expect(depois).toEqual(antes); // mesmo resultado
    expect(antes.length).toBeGreaterThanOrEqual(2);
    expect(candidatos.length).toBeLessThan(fichas.length / 10); // e o banco devolve bem menos linhas
  });
  it("sem dígitos suficientes, não filtra (busca como antes)", () => expect(padraoDigitos("123")).toBeNull());
});
