// Banco em memória para os testes: imita o cliente do Supabase e conta cada ida ao banco por tabela e operação.
/* eslint-disable @typescript-eslint/no-explicit-any */
type Linha = Record<string, any>;

export function bancoContado(inicial: Record<string, Linha[]> = {}) {
  const db: Record<string, Linha[]> = { ...inicial };
  const chamadas: { tabela: string; op: string; linhas: number }[] = [];
  let seq = 0;
  const q = (t: string) => {
    const f: ((r: Linha) => boolean)[] = []; let acao = "select"; let dados: any = null; let lim = 0; let ordem: [string, boolean] | null = null; let ini = 0; let fim = Infinity;
    const re = (pad: string) => new RegExp("^" + pad.split("").map((c) => (c === "%" ? ".*" : c === "_" ? "." : c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("") + "$", "is");
    const api: any = {
      select: () => api, eq: (c: string, v: unknown) => (f.push((r) => r[c] === v), api), neq: (c: string, v: unknown) => (f.push((r) => r[c] !== v), api),
      in: (c: string, v: unknown[]) => (f.push((r) => v.includes(r[c])), api), not: (c: string) => (f.push((r) => r[c] != null), api), is: (c: string, v: unknown) => (f.push((r) => (r[c] ?? null) === v), api),
      gte: (c: string, v: string) => (f.push((r) => String(r[c]) >= v), api), lte: (c: string, v: string) => (f.push((r) => String(r[c]) <= v), api), lt: (c: string, v: string) => (f.push((r) => String(r[c]) < v), api),
      ilike: (c: string, p: string) => (f.push((r) => r[c] != null && re(p).test(String(r[c]))), api),
      order: (c: string, o?: { ascending?: boolean }) => ((ordem = [c, o?.ascending !== false]), api), limit: (n: number) => ((lim = n), api), range: (a: number, b: number) => ((ini = a), (fim = b + 1), api),
      insert: (d: any) => ((acao = "insert"), (dados = d), api), upsert: (d: any) => ((acao = "upsert"), (dados = d), api), update: (d: any) => ((acao = "update"), (dados = d), api), delete: () => ((acao = "delete"), api),
      run() {
        db[t] ||= [];
        let l: Linha[];
        if (acao === "insert" || acao === "upsert") {
          l = [dados].flat().map((x: Linha) => ({ id: x.id ?? (t === "processos" ? undefined : "id" + ++seq), ...x }));
          if (acao === "upsert") l = l.filter((x) => !db[t].some((y) => y.id === x.id));
          if (t === "config") db[t] = db[t].filter((r) => !l.some((y) => y.chave === r.chave));
          db[t].push(...l);
        } else {
          l = db[t].filter((r) => f.every((g) => g(r)));
          if (acao === "update") for (const r of l) Object.assign(r, dados);
          if (acao === "delete") db[t] = db[t].filter((r) => !l.includes(r));
          if (ordem) { const [c, asc] = ordem; l = [...l].sort((a, b) => (String(a[c] ?? "") < String(b[c] ?? "") ? -1 : 1) * (asc ? 1 : -1)); }
          l = l.slice(ini, fim); if (lim) l = l.slice(0, lim);
        }
        chamadas.push({ tabela: t, op: acao, linhas: l.length });
        return l;
      },
      maybeSingle: () => Promise.resolve({ data: api.run()[0] ?? null, error: null }), single: () => Promise.resolve({ data: api.run()[0] ?? null, error: null }),
      then: (ok: (x: unknown) => void, no?: (e: unknown) => void) => { try { ok({ data: api.run(), error: null }); } catch (e) { no?.(e); } },
    };
    return api;
  };
  const resumo = () => { const m: Record<string, number> = {}; for (const c of chamadas) m[`${c.op} ${c.tabela}`] = (m[`${c.op} ${c.tabela}`] || 0) + 1; return m; };
  return { db, sb: { from: q } as any, chamadas, resumo, total: () => chamadas.length };
}

