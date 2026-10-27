import { expect, it } from "vitest";
import { ler } from "./noticias";
it("lê RSS com CDATA, imagem e data", () => {
  const xml = `<rss><channel><item><title><![CDATA[STJ julga &amp; decide]]></title><link>https://stj.jus.br/n/1</link><pubDate>Tue, 27 Oct 2026 10:00:00 -0300</pubDate><description><![CDATA[<p><img src="https://img.x/a.jpg"/>Texto <b>da</b> notícia</p>]]></description></item>
  <item><title>Sem link</title></item></channel></rss>`;
  const l = ler(xml, "STJ");
  expect(l).toHaveLength(1);
  expect(l[0]).toMatchObject({ titulo: "STJ julga & decide", link: "https://stj.jus.br/n/1", imagem: "https://img.x/a.jpg", resumo: "Texto da notícia", fonte: "STJ" });
  expect(l[0].data).toBe("2026-10-27T13:00:00.000Z");
});
