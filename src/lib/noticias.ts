// Notícias jurídicas e do Congresso para a tela de entrada (feeds RSS públicos, guardados por 1 hora).
export type Noticia = { titulo: string; link: string; fonte: string; data: string | null; resumo: string; imagem: string | null };

const FEEDS: { fonte: string; url: string }[] = [
  { fonte: "STJ", url: "https://res.stj.jus.br/hrestp-c-portalp/RSS.xml" },
  { fonte: "Conjur", url: "https://www.conjur.com.br/rss.xml" },
  { fonte: "Migalhas", url: "https://www.migalhas.com.br/rss/quentes" },
  { fonte: "Câmara dos Deputados", url: "https://www.camara.leg.br/noticias/rss/ultimas-noticias" },
  { fonte: "Agência Senado", url: "https://www12.senado.leg.br/noticias/feed/todasnoticias/RSS" },
];

const ent = (s: string) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
const tag = (bloco: string, nome: string) => { const m = bloco.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)</${nome}>`, "i")); return m ? ent(m[1]).trim() : ""; };
const semHtml = (s: string) => s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

export function ler(xml: string, fonte: string): Noticia[] {
  const itens = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return itens.slice(0, 12).map((b) => {
    const desc = tag(b, "description") || tag(b, "content:encoded") || tag(b, "summary");
    const link = tag(b, "link") || (b.match(/<link[^>]*href="([^"]+)"/i)?.[1] ?? "");
    const img = b.match(/<media:(?:content|thumbnail)[^>]*url="([^"]+)"/i)?.[1] || b.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i)?.[1] || desc.match(/<img[^>]*src="([^"]+)"/i)?.[1] || null;
    const d = tag(b, "pubDate") || tag(b, "dc:date") || tag(b, "published") || tag(b, "updated");
    const t = d ? Date.parse(d) : NaN;
    return { titulo: semHtml(tag(b, "title")), link: link.trim(), fonte, data: isNaN(t) ? null : new Date(t).toISOString(), resumo: semHtml(desc).slice(0, 220), imagem: img && /^https:\/\//.test(img) ? img : null };
  }).filter((n) => n.titulo && /^https?:\/\//.test(n.link));
}

/** junta as notícias mais recentes de todas as fontes, alternando as fontes no topo */
export async function buscarNoticias(): Promise<Noticia[]> {
  if (process.env.NOTICIAS_EXEMPLO === "1") return EXEMPLO; // só para testar a tela sem internet
  const res = await Promise.all(FEEDS.map(async (f) => {
    try {
      const r = await fetch(f.url, { next: { revalidate: 3600 }, headers: { "user-agent": "Mozilla/5.0 (Passos Advocacia)", accept: "application/rss+xml, application/xml, text/xml" }, signal: AbortSignal.timeout(6000) });
      if (!r.ok) return [];
      return ler(await r.text(), f.fonte);
    } catch { return []; }
  }));
  const limite = Date.now() - 10 * 864e5;
  const listas = res.map((l) => l.filter((n) => !n.data || Date.parse(n.data) > limite).sort((a, b) => (b.data || "").localeCompare(a.data || "")));
  const out: Noticia[] = [];
  for (let i = 0; out.length < 14 && listas.some((l) => l[i]); i++) for (const l of listas) if (l[i] && out.length < 14) out.push(l[i]);
  return out;
}

/** quando nenhuma fonte responde: frases de domínio público sobre o Direito */
export const FRASES: { texto: string; autor: string }[] = [
  { texto: "A justiça atrasada não é justiça, senão injustiça qualificada e manifesta.", autor: "Rui Barbosa, Oração aos Moços (1920)" },
  { texto: "Todos são iguais perante a lei, sem distinção de qualquer natureza.", autor: "Constituição Federal, art. 5º, caput" },
  { texto: "A lei não excluirá da apreciação do Poder Judiciário lesão ou ameaça a direito.", autor: "Constituição Federal, art. 5º, XXXV" },
  { texto: "O advogado é indispensável à administração da justiça.", autor: "Constituição Federal, art. 133" },
];

const EXEMPLO: Noticia[] = [
  { titulo: "STJ define que desconto indevido em benefício previdenciário gera dano moral presumido", link: "https://exemplo.com/1", fonte: "STJ", data: new Date().toISOString(), resumo: "A Segunda Seção fixou tese sobre empréstimos consignados não contratados por aposentados.", imagem: "http://localhost:3100/marca/fp.png" },
  { titulo: "Câmara aprova projeto que amplia proteção a aposentados contra fraudes em consignados", link: "https://exemplo.com/2", fonte: "Câmara dos Deputados", data: new Date(Date.now() - 3 * 36e5).toISOString(), resumo: "", imagem: null },
  { titulo: "Senado debate reforma do Código Civil em sessão temática", link: "https://exemplo.com/3", fonte: "Agência Senado", data: new Date(Date.now() - 26 * 36e5).toISOString(), resumo: "", imagem: null },
  { titulo: "Juizados Especiais Federais batem recorde de processos previdenciários", link: "https://exemplo.com/4", fonte: "Conjur", data: new Date(Date.now() - 5 * 36e5).toISOString(), resumo: "", imagem: null },
  { titulo: "OAB lança campanha contra o golpe do falso advogado", link: "https://exemplo.com/5", fonte: "Migalhas", data: new Date(Date.now() - 8 * 36e5).toISOString(), resumo: "", imagem: null },
];
