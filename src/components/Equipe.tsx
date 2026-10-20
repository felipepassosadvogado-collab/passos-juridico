"use client";
import { useActionState, useEffect, useRef, useState } from "react";
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

const VIS = 280; // tamanho do quadro de enquadramento na tela

/** janela para enquadrar a foto no círculo: arrastar para mover, zoom no controle ou na rodinha do mouse */
function Enquadrar({ arquivo, onPronto, onCancelar }: { arquivo: File; onPronto: (b: Blob) => void; onCancelar: () => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null); const [erro, setErro] = useState("");
  const [z, setZ] = useState(1); const [p, setP] = useState({ x: 0, y: 0 }); const arr = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  useEffect(() => {
    let vivo = true; const u = URL.createObjectURL(arquivo); const im = new Image();
    im.onload = () => vivo && setImg(im); im.onerror = () => vivo && setErro("Não consegui abrir essa imagem. Tente JPG ou PNG (fotos HEIC do iPhone: exporte como JPG).");
    im.src = u;
    return () => { vivo = false; setTimeout(() => URL.revokeObjectURL(u), 1000); };
  }, [arquivo]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === "Escape") onCancelar(); }; document.addEventListener("keydown", k); return () => document.removeEventListener("keydown", k); }, [onCancelar]);
  // escala base: a imagem cobre o quadro inteiro
  const base = img ? VIS / Math.min(img.naturalWidth, img.naturalHeight) : 1; const esc = base * z;
  const w = img ? img.naturalWidth * esc : 0, h = img ? img.naturalHeight * esc : 0;
  const limita = (x: number, y: number, ww = w, hh = h) => ({ x: Math.min(0, Math.max(VIS - ww, x)), y: Math.min(0, Math.max(VIS - hh, y)) });
  useEffect(() => { if (img) setP(limita((VIS - w) / 2, (VIS - h) / 2)); }, [img]); // eslint-disable-line react-hooks/exhaustive-deps
  const zoom = (nz: number) => { if (!img) return; nz = Math.min(4, Math.max(1, nz)); const e2 = base * nz; const nw = img.naturalWidth * e2, nh = img.naturalHeight * e2;
    const cx = (VIS / 2 - p.x) / esc, cy = (VIS / 2 - p.y) / esc; setZ(nz); setP(limita(VIS / 2 - cx * e2, VIS / 2 - cy * e2, nw, nh)); };
  const pronto = () => {
    if (!img) return; const L = 512; const cv = document.createElement("canvas"); cv.width = cv.height = L; const k = L / VIS;
    const ctx = cv.getContext("2d")!; ctx.imageSmoothingQuality = "high"; ctx.drawImage(img, p.x * k, p.y * k, w * k, h * k);
    cv.toBlob((b) => b && onPronto(b), "image/jpeg", 0.9);
  };
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancelar(); }}>
      <div className="modal compacto enq" role="dialog" aria-modal="true" aria-label="Enquadrar a foto">
        <div className="cx-topo"><h2>Enquadrar a foto</h2><button type="button" className="icb" style={{ marginLeft: "auto" }} aria-label="Fechar" onClick={onCancelar}>✕</button></div>
        <div className="cx-corpo" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
          {erro ? <div className="banner erro">{erro}</div> : <>
            <div className="enq-quadro" style={{ width: VIS, height: VIS }}
              onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture(e.pointerId); arr.current = { x: e.clientX, y: e.clientY, px: p.x, py: p.y }; }}
              onPointerMove={(e) => { const a = arr.current; if (a) setP(limita(a.px + e.clientX - a.x, a.py + e.clientY - a.y)); }}
              onPointerUp={() => (arr.current = null)} onPointerCancel={() => (arr.current = null)}
              onWheel={(e) => zoom(z * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}>
              {img && <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(${p.x}px, ${p.y}px)` }} />}
              <div className="enq-mascara" aria-hidden="true" />
            </div>
            <label className="enq-zoom"><span aria-hidden="true">−</span><input type="range" min={1} max={4} step={0.01} value={z} aria-label="Zoom" onChange={(e) => zoom(+e.target.value)} /><span aria-hidden="true">+</span></label>
            <div className="muted" style={{ fontSize: 12.5, textAlign: "center" }}>Arraste a foto para posicionar o rosto dentro do círculo e use o controle (ou a rodinha do mouse) para aproximar.</div>
          </>}
        </div>
        <div className="cx-rodape"><button type="button" className="btn ghost" onClick={onCancelar}>Cancelar</button><button type="button" className="btn primary cx-princ" disabled={!img} onClick={pronto}>Usar esta foto</button></div>
      </div>
    </div>
  );
}

/** foto do membro: clique no círculo para escolher e enquadrar */
export function FotoMembro({ m, pode }: { m: Perfil; pode: boolean }) {
  const { sb, aviso, recarregar } = useDados(); const router = useRouter(); const ref = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false); const [arquivo, setArquivo] = useState<File | null>(null);
  const enviar = async (blob: Blob) => {
    setArquivo(null); setOcupado(true);
    try {
      const caminho = `${m.id}/${Date.now().toString(36)}.jpg`;
      const up = await sb.storage.from("fotos").upload(caminho, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
      if (up.error) { aviso(/bucket|not found/i.test(up.error.message) ? "Falta instalar a etapa 9 (0008_fotos.sql) no Supabase." : "Não consegui enviar a foto: " + up.error.message); return; }
      const url = sb.storage.from("fotos").getPublicUrl(caminho).data.publicUrl;
      const { error } = await sb.from("profiles").update({ foto: url }).eq("id", m.id);
      if (error) { aviso(msgErro(error)); return; }
      const antiga = m.foto?.split("/fotos/")[1]; if (antiga) sb.storage.from("fotos").remove([antiga]).catch(() => {});
      aviso("Foto atualizada."); await recarregar(); router.refresh();
    } finally { setOcupado(false); }
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
      <input ref={ref} type="file" hidden accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; if (!/^image\//.test(f.type)) { aviso("Escolha uma imagem (JPG, PNG ou WEBP)."); return; } setArquivo(f); }} />
      {arquivo && <Enquadrar arquivo={arquivo} onPronto={enviar} onCancelar={() => setArquivo(null)} />}
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
