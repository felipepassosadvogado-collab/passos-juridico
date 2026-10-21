"use client";
// Depois de trocar a base de processos: busca no DJEN, processo por processo, os andamentos dos que ainda não têm
// nenhuma publicação gravada. As publicações de 15/10/2026 em diante vão para a caixa; as anteriores ficam só na
// linha do tempo do processo (já concluídas, sem tratamento). Também completa o juízo e os réus que vierem do DJEN.
import { useRef, useState } from "react";
import { useDados, msgErro } from "@/lib/dados";
import { bancoDosReus } from "@/lib/formato";

const CORTE = "2026-10-15";
type Pub = { id: number; data: string; tipo_com: string | null; tipo_doc: string | null; orgao: string | null; texto: string; link: string | null };
type Dados = { orgao: string; tribunal: string; classe: string; autores: string[]; reus: string[]; pubs: Pub[] } | null;

export function CompletarDjen() {
  const { sb, aviso } = useDados();
  const [estado, setEstado] = useState<{ feitos: number; total: number; pubs: number; caixa: number; semNada: number; erros: number; atual: string } | null>(null);
  const [rodando, setRodando] = useState(false); const parar = useRef(false);

  const todos = async <T,>(q: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: unknown }>) => {
    const out: T[] = [];
    for (let i = 0; ; i += 1000) { const { data, error } = await q(i, i + 999); if (error) throw error; out.push(...(data || [])); if (!data || data.length < 1000) break; }
    return out;
  };

  const rodar = async () => {
    setRodando(true); parar.current = false;
    try {
      const procs = await todos<{ numero: string; orgao: string | null; reus: string[]; banco: string | null; tribunal: string | null; classe: string | null }>((a, b) => sb.from("processos").select("numero,orgao,reus,banco,tribunal,classe").order("numero").range(a, b));
      const comPub = new Set((await todos<{ processo_numero: string }>((a, b) => sb.from("publicacoes").select("processo_numero").range(a, b))).map((x) => x.processo_numero));
      const fila = procs.filter((p) => !comPub.has(p.numero));
      const st = { feitos: 0, total: fila.length, pubs: 0, caixa: 0, semNada: 0, erros: 0, atual: "" }; setEstado({ ...st });
      for (const p of fila) {
        if (parar.current) break;
        st.atual = p.numero; setEstado({ ...st });
        try {
          const r = await fetch("/api/djen/processo?numero=" + p.numero); const j = await r.json().catch(() => ({}));
          if (!r.ok) { st.erros++; continue; }
          const d = j.dados as Dados;
          if (!d || !d.pubs.length) { st.semNada++; continue; }
          const linhas = d.pubs.map((x) => {
            const caixa = x.data >= CORTE && x.tipo_com !== "Lista de distribuição";
            return { id: x.id, processo_numero: p.numero, data: x.data, tipo_com: x.tipo_com, tipo_doc: x.tipo_doc, orgao: x.orgao, texto: (x.texto || "").slice(0, 60000), link: x.link,
              triagem: caixa ? "pendente" : "concluida", concluida_em: caixa ? null : new Date().toISOString() };
          });
          const { error } = await sb.from("publicacoes").upsert(linhas, { onConflict: "id", ignoreDuplicates: true });
          if (error) { st.erros++; continue; }
          st.pubs += linhas.length; st.caixa += linhas.filter((l) => l.triagem === "pendente").length;
          // completa o juízo, a classe e os réus (o banco) com o que veio do DJEN
          const reus = [...p.reus]; for (const x of d.reus) if (!reus.some((y) => y.toUpperCase() === x.toUpperCase())) reus.push(x);
          const upd: Record<string, unknown> = { reus, orgao: d.orgao || p.orgao, tribunal: p.tribunal || d.tribunal || null, classe: p.classe || d.classe || null };
          if (!p.banco || /instituto nacional|^inss/i.test(p.banco)) upd.banco = bancoDosReus(reus) || null;
          await sb.from("processos").update(upd).eq("numero", p.numero);
        } catch { st.erros++; }
        finally { st.feitos++; setEstado({ ...st }); }
        await new Promise((ok) => setTimeout(ok, 350));
      }
      st.atual = ""; setEstado({ ...st });
      aviso(parar.current ? "Busca interrompida. Clique de novo para continuar de onde parou." : "Andamentos do DJEN completados.");
    } catch (e) { aviso(msgErro(e)); }
    finally { setRodando(false); }
  };

  return (
    <section className="panel" style={{ marginTop: 20 }}>
      <div className="ph"><h3>Completar andamentos do DJEN</h3><span className="muted" style={{ fontSize: 12.5 }}>para os processos que ainda não têm nenhuma publicação gravada</span></div>
      <div className="pb" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="muted" style={{ fontSize: 13.5, maxWidth: "75ch" }}>Busca no DJEN, um processo por vez, as comunicações de cada processo sem andamentos. As de <b>15/10/2026 em diante</b> vão para a caixa de publicações; as anteriores entram só na linha do tempo do processo, já concluídas. O juízo e os réus (banco) que vierem do DJEN também são completados. Pode parar e continuar depois: o que já foi gravado não se repete.</div>
        {estado && <div className="banner">{estado.total === 0 ? "Todos os processos já têm andamentos gravados." :
          <>{estado.feitos} de {estado.total} processos · {estado.pubs} publicações gravadas ({estado.caixa} na caixa){estado.semNada ? ` · ${estado.semNada} sem nada no DJEN` : ""}{estado.erros ? ` · ${estado.erros} com erro (rode de novo depois)` : ""}{estado.atual ? ` · consultando ${estado.atual}…` : ""}</>}</div>}
        <div className="tools">
          {!rodando ? <button className="btn primary" onClick={rodar}>Buscar andamentos no DJEN</button> : <button className="btn" onClick={() => { parar.current = true; }}>Parar</button>}
        </div>
      </div>
    </section>
  );
}
