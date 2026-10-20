import Link from "next/link";
import { exigirMembro } from "@/lib/sessao";
import { Menu, BotaoTema } from "@/components/Menu";
import { iniciais } from "@/lib/formato";

export default async function Casca({ children }: { children: React.ReactNode }) {
  const { perfil } = await exigirMembro();
  return (
    <>
      <Menu titular={perfil.papel === "titular"} />
      <div className="col">
        <header className="topbar">
          <Link href="/" className="logo">
            <img src="/marca/fp.png" alt="" width={40} height={35} />
            <span><span className="t1">FELIPE PASSOS</span><span className="t2">ADVOGADO</span></span>
          </Link>
          <div className="tright">
            <BotaoTema />
            <span className="ola"><span className="av" style={{ display: "inline-grid", verticalAlign: "middle", marginRight: 8 }}>{iniciais(perfil.nome)}</span>
              <span className="nome">Olá, <b>{perfil.nome.split(" ")[0]}</b></span></span>
            <form action="/auth/sair" method="post"><button className="btn ghost">Sair</button></form>
          </div>
        </header>
        <main><div className="wrap">{children}</div></main>
      </div>
    </>
  );
}
