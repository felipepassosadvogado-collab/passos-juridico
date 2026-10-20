"use client";
import { useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useDados, msgErro } from "@/lib/dados";
import { Avatar } from "./ui";
import { convidar, alterarMembro } from "@/app/(app)/equipe/acoes";
import type { Perfil } from "@/lib/tipos";

export function FormConvite() {
  const [st, acao, enviando] = useActionState(convidar, null);
  return (
    <form action={acao} className="form2">
      <label className="f">Nome<input name="nome" required /></label>
      <label className="f">E-mail<input name="email" type="email" required /></label>
      <label className="f">Função<input name="funcao" placeholder="Ex.: Assistente jurídica" /></label>
      <div className="tools" style={{ alignSelf: "end" }}><button className="btn primary" disabled={enviando}>{enviando ? "Enviando…" : "Enviar convite"}</button></div>
      {st?.erro && <div className="banner erro full">{st.erro}</div>}
      {st && "ok" in st && st.ok && <div className="banner ok full">{st.ok}</div>}
    </form>
  );
}

/** recorta a foto no centro, em quadrado, e reduz para 512 px */
async function quadrada(f: File, lado = 512): Promise<Blob> {
  const bmp = await createImageBitmap(f); const s = Math.min(bmp.width, bmp.height);
  const cv = document.createElement("canvas"); cv.width = cv.height = Math.min(lado, s);
  cv.getContext("2d")!.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, cv.width, cv.height);
  return new Promise<Blob>((ok, nao) => cv.toBlob((b) => (b ? ok(b) : nao(new Error("imagem"))), "image/jpeg", 0.88));
}

/** foto do membro: clique no círculo para trocar */
export function FotoMembro({ m, pode }: { m: Perfil; pode: boolean }) {
  const { sb, aviso, recarregar } = useDados(); const router = useRouter(); const ref = useRef<HTMLInputElement>(null); const [ocupado, setOcupado] = useState(false);
  const trocar = async (f?: File) => {
    if (!f) return; if (!/^image\//.test(f.type)) { aviso("Escolha uma imagem (JPG, PNG ou WEBP)."); return; }
    setOcupado(true);
    try {
      const blob = await quadrada(f); const caminho = `${m.id}/${Date.now().toString(36)}.jpg`;
      const up = await sb.storage.from("fotos").upload(caminho, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (up.error) { aviso(/bucket|not found/i.test(up.error.message) ? "Falta instalar a etapa 9 (0008_fotos.sql) no Supabase." : "Não consegui enviar a foto: " + up.error.message); return; }
      const url = sb.storage.from("fotos").getPublicUrl(caminho).data.publicUrl;
      const { error } = await sb.from("profiles").update({ foto: url }).eq("id", m.id);
      if (error) { aviso(msgErro(error)); return; }
      const antiga = m.foto?.split("/fotos/")[1]; if (antiga) sb.storage.from("fotos").remove([antiga]).catch(() => {});
      aviso("Foto atualizada."); await recarregar(); router.refresh();
    } catch { aviso("Não consegui ler essa imagem."); }
    finally { setOcupado(false); }
  };
  const tirar = async () => {
    const { error } = await sb.from("profiles").update({ foto: null }).eq("id", m.id); if (error) { aviso(msgErro(error)); return; }
    const antiga = m.foto?.split("/fotos/")[1]; if (antiga) sb.storage.from("fotos").remove([antiga]).catch(() => {});
    aviso("Foto removida."); await recarregar(); router.refresh();
  };
  return (
    <div className="foto-membro">
      <button type="button" className="foto-btn" disabled={!pode || ocupado} title={pode ? "Trocar a foto" : m.nome} onClick={() => ref.current?.click()}>
        {m.foto ? <span className="avr lg foto"><img src={m.foto} alt={"Foto de " + m.nome} /></span> : <Avatar id={m.id} grande />}
        {pode && <span className="foto-cam" aria-hidden="true">{ocupado ? "…" : "📷"}</span>}</button>
      {pode && m.foto && <button type="button" className="reflink" style={{ fontSize: 11.5 }} onClick={tirar}>tirar</button>}
      <input ref={ref} type="file" hidden accept="image/jpeg,image/png,image/webp,image/heic" onChange={(e) => { trocar(e.target.files?.[0]); e.target.value = ""; }} />
    </div>
  );
}

export function LinhaMembro({ m, eu, titular }: { m: Perfil; eu: string; titular: boolean }) {
  const [st, acao, salvando] = useActionState(alterarMembro, null);
  const podeEditar = titular || m.id === eu;
  return (
    <form action={acao} className="tools" style={{ padding: "12px 16px", borderTop: "1px solid var(--line)", alignItems: "flex-end" }}>
      <input type="hidden" name="id" value={m.id} />
      <FotoMembro m={m} pode={podeEditar} />
      <label className="f" style={{ flex: "1 1 200px" }}>Nome<input name="nome" defaultValue={m.nome} disabled={!podeEditar} /></label>
      <label className="f" style={{ flex: "1 1 160px" }}>Função<input name="funcao" defaultValue={m.funcao} disabled={!podeEditar} /></label>
      {titular && m.id !== eu ? <>
        <label className="f">Papel<select name="papel" defaultValue={m.papel}><option value="titular">Titular</option><option value="advogado">Advogado(a)</option><option value="colaborador">Colaborador(a)</option></select></label>
        <label className="f" style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingBottom: 9 }}><input type="checkbox" name="ativo" defaultChecked={m.ativo} /> Acesso ativo</label>
      </> : <span className="pill acc" style={{ marginBottom: 9 }}>{m.papel === "titular" ? "Titular" : m.papel === "advogado" ? "Advogado(a)" : "Colaborador(a)"}{m.id === eu ? " · você" : ""}</span>}
      {podeEditar && <button className="btn" disabled={salvando}>{salvando ? "Salvando…" : "Salvar"}</button>}
      {st?.erro && <span className="pill late">{st.erro}</span>}{st && "ok" in st && st.ok && <span className="pill ok">{st.ok}</span>}
    </form>
  );
}
