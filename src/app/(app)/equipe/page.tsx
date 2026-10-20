import { exigirMembro, mapaEquipe } from "@/lib/sessao";
import { FormConvite, LinhaMembro } from "@/components/Equipe";

export const metadata = { title: "Equipe" };

export default async function Equipe() {
  const { sb, perfil } = await exigirMembro();
  const { lista } = await mapaEquipe(sb);
  const titular = perfil.papel === "titular";
  return (
    <>
      <div className="pg"><div><h1>Equipe</h1><div className="sub">Quem tem acesso ao sistema</div></div></div>
      {titular && <section className="panel"><div className="ph"><h3>Convidar pessoa</h3></div><div className="pb"><FormConvite /></div></section>}
      <section className="panel"><div className="ph"><h3>Membros</h3><span className="muted" style={{ fontSize: 12 }}>{lista.filter((m) => m.ativo).length} com acesso</span></div>
        {lista.map((m) => <LinhaMembro key={m.id} m={m} eu={perfil.id} titular={titular} />)}
      </section>
    </>
  );
}
