import Link from "next/link";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { TAG_LEGEND } from "@/lib/scoring/labels";

export const metadata = { title: "Guía de uso · SmarTrade" };

export default function Guide() {
  const h = "mt-5 text-base font-semibold";
  const a = "underline text-indigo-700";
  return (
    <article className="max-w-3xl space-y-2 rounded-lg bg-white p-6 text-sm shadow-sm">
      <h1 className="text-xl font-bold">Guía de uso</h1>
      <p>SmarTrade te ayuda a decidir <b>qué investigar</b>: ordena combinaciones producto-mercado según señales estadísticas del comercio exterior. No indica rentabilidad ni garantiza ventas.</p>

      <h2 className={h}>Dos formas de empezar</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Tengo un producto:</b> escribe su nombre o código y verás a qué países de la UE interesa más.</li>
        <li><b>Quiero descubrir sectores:</b> elige un sector (alimentación, bebidas, automoción…) y compara sus productos y mercados. La puntuación solo compara entre los productos del sector. Puedes combinar sectores escribiendo, por ejemplo, <code>sector:bebidas, sector:automocion</code>.</li>
      </ul>

      <h2 className={h}>1. Cómo buscar</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Escribe en <b>Producto</b> el nombre de un producto o un código HS. Puedes combinar varios separados por comas: <Link className={a} href="/?q=vino,aceite de oliva">vino, aceite de oliva</Link>.</li>
        <li>Opcional: elige un <b>mercado</b>, el año final, el tamaño mínimo (en millones de €) o el crecimiento mínimo.</li>
        <li>Pulsa <b>Buscar oportunidades</b>. Verás el ranking, la interpretación de tu búsqueda y los avisos de calidad.</li>
        <li>Abre <b>Detalle</b> para ver la serie histórica, los proveedores, el desglose de la puntuación y los enlaces oficiales.</li>
        <li><b>Exportar CSV</b> descarga los resultados filtrados.</li>
      </ol>

      <h2 className={h}>2. Formas de indicar el producto</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Por nombre:</b> <code>cerámica</code>, <code>coches eléctricos</code>, <code>jamón</code>. Se busca en el catálogo de esta página (selección orientativa, no la nomenclatura completa).</li>
        <li><b>Por código HS6:</b> <code>220421</code>. Es la forma exacta y admite cualquier código vigente, aunque no esté en el catálogo.</li>
        <li><b>Por capítulo o partida (2-5 dígitos):</b> <code>2204</code> devuelve los códigos del catálogo que empiezan así.</li>
        <li>Máximo 20 códigos por búsqueda. Cuantos más productos compares (idealmente 10 o más), más informativa es la puntuación.</li>
      </ul>

      <h2 className={h}>3. Dónde encontrar el código HS de un producto</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><a className={a} href="https://trade.ec.europa.eu/access-to-markets/es/home" target="_blank" rel="noreferrer">Access2Markets</a> (Comisión Europea): buscador de productos por nombre y consulta de aranceles y requisitos.</li>
        <li><a className={a} href="https://www.icex.es/es/estadisticas" target="_blank" rel="noreferrer">ICEX · Estadísticas</a>: estadísticas de comercio exterior español.</li>
        <li>Tu <b>factura, albarán o declaración aduanera</b>: el código arancelario aparece en ellos; los 6 primeros dígitos son el HS.</li>
        <li>Tu agente de aduanas o transitario puede confirmarte el código exacto.</li>
      </ul>
      <p>Los 6 primeros dígitos del código son comunes a todos los países; a partir de ahí cada territorio añade su propio detalle.</p>

      <h2 className={h}>Qué significan las etiquetas</h2>
      <p>Cada fila resume sus indicadores con etiquetas y una frase. Son reglas fijas, no una recomendación. Las que dicen «de esta búsqueda» comparan con los demás resultados cargados.</p>
      <ul className="list-disc space-y-1 pl-5">
        {TAG_LEGEND.map((t) => <li key={t.key}><b>{t.label}:</b> {t.hint}</li>)}
      </ul>

      <h2 className={h}>4. Datos reales y datos de demostración</h2>
      <p>La etiqueta de la cabecera indica el modo. <b>DEMO</b> son datos sintéticos de ejemplo. <b>Eurostat Comext</b> son estadísticas oficiales de comercio de la UE. Los datos reales cubren como mercados de destino los países de la UE.</p>

      <h2 className={h}>5. Cómo incorporar datos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>No hay que subir ficheros: SmarTrade consulta Eurostat bajo demanda cuando buscas y guarda el resultado en caché temporal.</li>
        <li>Para <b>ampliar el análisis</b>, basta con añadir más productos a la búsqueda (nombres o códigos).</li>
        <li>Para activar los datos oficiales, el administrador de la web define <code>SMARTRADE_DATA_MODE=comext</code> en Vercel y vuelve a desplegar.</li>
        <li>Para añadir un producto al catálogo de nombres, se edita <code>lib/config/hs-catalog.ts</code> (código, nombre y palabras clave).</li>
      </ul>

      <h2 className={h}>6. Cómo interpretar los resultados</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Una puntuación alta significa <b>prioridad estadística para investigar</b>, no rentabilidad.</li>
        <li>«Sin datos para…» suele indicar que el código no existe en la nomenclatura vigente en esos años o que la fuente no publica ese periodo. Prueba con el código actualizado.</li>
        <li>Ausencia de datos no implica ausencia de comercio.</li>
        <li>Antes de decidir, verifica requisitos de importación, aranceles, transporte, compradores y competencia. Más detalle en <Link className={a} href="/metodologia">Metodología y fuentes</Link>.</li>
      </ul>

      <h2 className={h}>Catálogo de nombres ({HS_CATALOG.length} productos)</h2>
      <p>Descripciones simplificadas, no el texto oficial. Cada código se comprueba con los datos reales al buscar.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr className="border-b"><th className="py-1 pr-3">Código HS6</th><th className="py-1">Producto</th></tr></thead>
          <tbody>
            {HS_CATALOG.map((e) => (
              <tr key={e.code} className="border-b border-slate-100">
                <td className="py-1 pr-3 font-mono"><Link className={a} href={`/?q=${e.code}`}>{e.code}</Link></td>
                <td className="py-1">{e.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
