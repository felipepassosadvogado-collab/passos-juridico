import { FormLogin } from "./form";
import { FRASES, buscarNoticias, type Noticia } from "@/lib/noticias";

export const metadata = { title: "Entrar" };

const quando = (iso: string | null) => {
  if (!iso) return "";
  const h = (Date.now() - Date.parse(iso)) / 36e5;
  if (h < 1) return "agora há pouco"; if (h < 24) return `há ${Math.floor(h)} h`;
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" });
};

export default async function Login({ searchParams }: { searchParams: Promise<{ de?: string; erro?: string }> }) {
  const sp = await searchParams;
  const noticias: Noticia[] = await buscarNoticias().catch(() => []);
  const destaque = noticias.find((n) => n.imagem) || noticias[0];
  const outras = noticias.filter((n) => n !== destaque).slice(0, 8);
  const frase = FRASES[new Date().getDate() % FRASES.length];
  const hoje0 = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const hoje = hoje0.charAt(0).toUpperCase() + hoje0.slice(1);
  return (
    <div className="login2">
      <section className="lg-form">
        <div className="lg-topo">
          <div className="logo" style={{ marginBottom: 4 }}>
            <img src="/marca/fp.png" alt="" width={46} height={40} />
            <span><span className="t1">PASSOS</span><span className="t2">ADVOCACIA</span></span>
          </div>
        </div>
        <div className="lg-meio">
          <h1>Entrar no sistema</h1>
          <p className="muted" style={{ margin: "-4px 0 6px" }}>Bem-vindo de volta. Use o seu e-mail e senha do escritório.</p>
          {sp.erro === "link" && <div className="banner erro">O link do e-mail já foi usado ou expirou. Use “Esqueci a senha” para receber outro.</div>}
          {sp.erro === "inatividade" && <div className="banner">Você saiu automaticamente depois de 30 minutos sem uso. Entre de novo para continuar.</div>}
          {sp.erro === "inativo" && <div className="banner erro">Seu acesso está desativado. Fale com o titular do escritório.</div>}
          <FormLogin de={sp.de || "/"} />
        </div>
        <div className="lg-rodape muted">Felipe dos Passos Silva · OAB/SC 58.547 · Joinville/SC</div>
      </section>

      <section className="lg-news" aria-label="Notícias jurídicas e do Congresso">
        <div className="lg-news-cab">
          <div><div className="lg-sobre">Hoje no Direito e na política</div><div className="lg-dia">{hoje}</div></div>
          <div className="lg-fontes">STJ · Conjur · Migalhas · Câmara · Senado</div>
        </div>
        {destaque ? <>
          <a className="lg-dest" href={destaque.link} target="_blank" rel="noopener noreferrer">
            {destaque.imagem && <img src={destaque.imagem} alt="" referrerPolicy="no-referrer" loading="lazy" />}
            <div className="lg-dest-txt">
              <span className="lg-fonte">{destaque.fonte}{destaque.data ? " · " + quando(destaque.data) : ""}</span>
              <h2>{destaque.titulo}</h2>
              {destaque.resumo && <p>{destaque.resumo}</p>}
            </div>
          </a>
          <div className="lg-lista">{outras.map((n) => (
            <a key={n.link} className="lg-item" href={n.link} target="_blank" rel="noopener noreferrer">
              <span className="lg-fonte">{n.fonte}{n.data ? " · " + quando(n.data) : ""}</span>
              <span className="lg-tit">{n.titulo}</span>
            </a>))}</div>
        </> : <blockquote className="lg-frase"><p>“{frase.texto}”</p><cite>{frase.autor}</cite></blockquote>}
      </section>
    </div>
  );
}
