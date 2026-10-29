import { describe, expect, it } from "vitest";
import { extractSignals, htmlToText } from "@/lib/buyers/extract";

// HTML FICTICIO de pruebas.
const html = `<html><head><title>Ejemplo Ficticio Trading</title><style>.x{}</style></head><body>
<script>var wine="no cuenta";</script>
<p>We are an importer and distributor of premium wine in Japan.</p>
<a href="/contact/">Contact us</a> <a href="https://otro-sitio.test/contact">Otro</a>
<a href="mailto:info@ejemplo-ficticio.test">Email</a> <a href="mailto:juan.perez@ejemplo-ficticio.test">Juan</a>
<a href="tel:+81 3-0000-0000">llamar</a><p>TEL: 03-1111-2222</p></body></html>`;

describe("extracción de señales (sin red)", () => {
  const s = extractSignals(html, "https://ejemplo-ficticio.test/about", ["wine"]);
  it("detecta producto e importación/distribución", () => { expect(s.productTerm).toBe(true); expect(s.importTerm).toBe(true); expect(s.title).toBe("Ejemplo Ficticio Trading"); });
  it("solo conserva correos genéricos, nunca personales", () => { expect(s.genericEmails).toEqual(["info@ejemplo-ficticio.test"]); });
  it("recoge teléfonos de enlaces tel: y de texto etiquetado", () => { expect(s.phones).toEqual(expect.arrayContaining(["+81 3-0000-0000", "03-1111-2222"])); });
  it("solo enlaza páginas de contacto del mismo sitio", () => { expect(s.contactLinks).toEqual(["https://ejemplo-ficticio.test/contact/"]); });
  it("ignora scripts y estilos y no inventa señales", () => {
    expect(htmlToText(html)).not.toContain("no cuenta");
    const none = extractSignals("<p>Hola</p>", "https://x.test", ["wine"]);
    expect(none).toMatchObject({ productTerm: false, importTerm: false, genericEmails: [], phones: [], contactLinks: [] });
  });
  it("reconoce términos en japonés", () => {
    expect(extractSignals("<p>ワインの輸入・卸売</p>", "https://x.test", ["ワイン"])).toMatchObject({ productTerm: true, importTerm: true });
  });
});
