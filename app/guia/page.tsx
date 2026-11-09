import Link from "next/link";
import { HS_CATALOG, NC8_CATALOG } from "@/lib/config/hs-catalog";

export const metadata = { title: "Guía de uso · SmarTrade" };

export default function Guide() {
  const h = "mt-5 text-base font-semibold";
  const a = "underline text-indigo-700";
  return (
    <article className="max-w-3xl space-y-2 rounded-lg bg-white p-6 text-sm shadow-sm">
      <h1 className="text-xl font-bold">Guía de uso</h1>
      <p>SmarTrade describe, con estadísticas oficiales de comercio exterior, <b>cuánto importa cada país un producto, cómo ha evolucionado, qué parte llega desde España y qué otros países lo abastecen</b>. No puntúa mercados, no predice ventas ni indica rentabilidad.</p>

      <h2 className={h}>Dos formas de empezar</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Tengo un producto:</b> escribe su nombre o código y verás sus mercados de destino ordenados por una métrica que tú eliges.</li>
        <li><b>Quiero explorar un sector:</b> elige un sector (alimentación, bebidas, automoción…). Verás sus productos y, para cada uno, sus mercados. Los productos no se ordenan entre sí: sus importes no son comparables.</li>
      </ul>

      <h2 className={h}>Mercados fuera de la UE</h2>
      <p>Si el administrador activa UN Comtrade, aparece un selector «Fuera de la UE». Esa vista usa otra fuente y otra moneda (dólares), así que <b>nunca se mezcla</b> con la de la UE (Eurostat, euros). Cada país publica con distinto retraso: si le falta el año final, sale como incompleto. Fuera de la UE sí hay aranceles y reglas de origen: compruébalos en la ficha antes de decidir.</p>

      <h2 className={h}>1. Cómo buscar</h2>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Escribe en <b>Producto</b> el nombre de un producto o un código HS. Puedes combinar varios separados por comas: <Link className={a} href="/mercados?q=vino,aceite de oliva">vino, aceite de oliva</Link>.</li>
        <li>Opcional: elige un <b>mercado</b>, el año final, el tamaño mínimo (en millones de €) o el crecimiento mínimo.</li>
        <li>Pulsa <b>Ver mercados</b>. Verás los mercados del producto ordenados por la métrica elegida: valor importado, crecimiento anual pasado, volumen (peso neto) o importaciones con socio España.</li>
        <li>Pulsa el nombre de un <b>mercado</b> para abrir su diagnóstico: lectura del mercado, tamaño, evolución, presencia española, países proveedores, contexto, acceso al mercado y comprobaciones pendientes.</li>
        <li><b>Comparar:</b> marca de 2 a 5 resultados de la página y pulsa «Comparar seleccionados» para verlos lado a lado (también se puede imprimir). La selección vale solo para la página actual y no se guarda.</li>
        <li><b>Exportar CSV</b> descarga los resultados filtrados.</li>
      </ol>

      <h2 className={h}>2. Formas de indicar el producto</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>Por nombre:</b> <code>cerámica</code>, <code>coches eléctricos</code>, <code>jamón</code>. Se busca en el catálogo de esta página (selección orientativa, no la nomenclatura completa).</li>
        <li><b>Por código HS6:</b> <code>220421</code>. Es la forma exacta y admite cualquier código vigente, aunque no esté en el catálogo.</li>
        <li><b>Por capítulo o partida (2-5 dígitos):</b> <code>2204</code> devuelve los códigos del catálogo que empiezan así.</li>
        <li>Hasta 20 productos por búsqueda (por nombre o sector) y 80 caracteres en el buscador, unos 11 códigos escritos. Cada producto se analiza por separado.</li>
      </ul>

      <h2 className={h}>3. Dónde encontrar el código HS de un producto</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><a className={a} href="https://trade.ec.europa.eu/access-to-markets/es/home" target="_blank" rel="noreferrer">Access2Markets</a> (Comisión Europea): buscador de productos por nombre y consulta de aranceles y requisitos.</li>
        <li><a className={a} href="https://www.icex.es/es/estadisticas" target="_blank" rel="noreferrer">ICEX · Estadísticas</a>: estadísticas de comercio exterior español.</li>
        <li>Tu <b>factura, albarán o declaración aduanera</b>: el código arancelario aparece en ellos; los 6 primeros dígitos son el HS.</li>
        <li>Tu agente de aduanas o transitario puede confirmarte el código exacto.</li>
      </ul>
      <p>Los 6 primeros dígitos del código son comunes a todos los países; a partir de ahí cada territorio añade su propio detalle.</p>

      <h2 className={h}>Qué significan los avisos</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li><b>España = país de expedición (mercados de la UE):</b> Eurostat atribuye cada importación dentro de la UE al país desde el que se expide, no necesariamente al de origen. La participación de España mide expediciones, no producto español.</li>
        <li><b>Crecimiento excepcional:</b> crecimiento anual de al menos el 30 %; suele deberse a efectos puntuales. Revisa la serie año a año.</li>
        <li><b>Posible efecto precio:</b> el valor crece al menos 15 puntos al año más que el peso.</li>
        <li><b>Puerto de entrada a la UE (Países Bajos, Bélgica):</b> parte de lo que importan se reexpide a otros países.</li>
        <li><b>Serie incompleta:</b> faltan años o la clasificación cambió; la ficha explica qué falta.</li>
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
        <li>Un mercado grande o que ha crecido es un <b>dato del pasado</b>, no una garantía de ventas ni una previsión.</li>
        <li>«Sin datos para…» suele indicar que el código no existe en la nomenclatura vigente en esos años o que la fuente no publica ese periodo. Prueba con el código actualizado.</li>
        <li>Ausencia de datos no implica ausencia de comercio.</li>
        <li>Antes de decidir, verifica requisitos de importación, aranceles, transporte, canales de venta y competencia. Más detalle en <Link className={a} href="/metodologia">Metodología y fuentes</Link>.</li>
      </ul>

      <h2 className={h}>Catálogo de nombres ({HS_CATALOG.length} productos)</h2>
      <p>Descripciones simplificadas, no el texto oficial. Cada código se comprueba con los datos reales al buscar.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr className="border-b"><th className="py-1 pr-3">Código HS6</th><th className="py-1">Producto</th></tr></thead>
          <tbody>
            {HS_CATALOG.map((e) => (
              <tr key={e.code} className="border-b border-slate-100">
                <td className="py-1 pr-3 font-mono"><Link className={a} href={`/mercados?q=${e.code}`}>{e.code}</Link></td>
                <td className="py-1">{e.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className={h} id="subcategorias">Subcategorías más precisas, solo UE ({NC8_CATALOG.length})</h2>
      <p>Códigos de 8 dígitos de la Nomenclatura Combinada europea (NC8). Solo Eurostat los publica, así que sirven para los mercados de la UE; fuera de la UE se usa la partida general de 6 dígitos y se avisa. Puedes buscarlas por nombre (p. ej. «Rioja», «naranjas navel», «coches eléctricos usados») o por código.</p>
      <ul className="list-disc space-y-1 pl-5">
        <li>No existen en ninguna estadística oficial y por eso no se ofrecen: denominaciones como Ribera del Duero, Rueda o Priorat por separado (van juntas en «otras DOP») ni los coches por carrocería (SUV): la nomenclatura los clasifica por motor.</li>
        <li>En las denominaciones que solo produce España (Rioja, Navarra, Penedés, Valdepeñas, Valencia, Cava), la participación española es casi el 100 % por definición: no mide competencia.</li>
      </ul>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead><tr className="border-b"><th className="py-1 pr-3">Código NC8</th><th className="py-1">Producto</th></tr></thead>
          <tbody>
            {NC8_CATALOG.map((e) => (
              <tr key={e.code} className="border-b border-slate-100">
                <td className="py-1 pr-3 font-mono"><Link className={a} href={`/mercados?q=${e.code}`}>{e.code}</Link></td>
                <td className="py-1">{e.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </article>
  );
}
