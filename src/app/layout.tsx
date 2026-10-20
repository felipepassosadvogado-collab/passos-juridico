import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Passos Jurídico", template: "%s · Passos Jurídico" },
  description: "Gestão do escritório Felipe Passos Advogado",
  icons: { icon: "/marca/fp-64.png" },
  robots: { index: false, follow: false },
};

export default function Raiz({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600&family=Cormorant+Garamond:wght@500;600;700&family=Source+Sans+3:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" />
        <script dangerouslySetInnerHTML={{ __html: `try{if(localStorage.getItem("tema")==="claro")document.documentElement.classList.add("claro")}catch(e){}` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
