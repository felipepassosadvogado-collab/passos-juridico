import { FormLogin } from "./form";

export const metadata = { title: "Entrar" };

export default async function Login({ searchParams }: { searchParams: Promise<{ de?: string; erro?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="login">
      <div className="caixa">
        <div className="logo" style={{ justifyContent: "center", marginBottom: 6 }}>
          <img src="/marca/fp.png" alt="" width={46} height={40} />
          <span><span className="t1">FELIPE PASSOS</span><span className="t2">ADVOGADO</span></span>
        </div>
        <h1 style={{ fontSize: 28, textAlign: "center" }}>Entrar no sistema</h1>
        {sp.erro === "link" && <div className="banner erro">O link do e-mail já foi usado ou expirou. Use “Esqueci a senha” para receber outro.</div>}
        {sp.erro === "inativo" && <div className="banner erro">Seu acesso está desativado. Fale com o titular do escritório.</div>}
        <FormLogin de={sp.de || "/"} />
      </div>
    </div>
  );
}
