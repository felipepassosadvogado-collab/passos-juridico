import { exigirMembro, mapaEquipe } from "@/lib/sessao";
import { ProvedorDados } from "@/lib/dados";
import { ProvedorJanelas } from "@/components/janelas";
import { Casca } from "@/components/Casca";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { sb, perfil } = await exigirMembro();
  const { lista } = await mapaEquipe(sb);
  return (
    <ProvedorDados eu={perfil} equipeInicial={lista}>
      <ProvedorJanelas><Casca>{children}</Casca></ProvedorJanelas>
    </ProvedorDados>
  );
}
