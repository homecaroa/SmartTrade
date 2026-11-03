export const metadata = { title: "Metodología y fuentes · SmarTrade" };

export default function Methodology() {
  const h = "mt-4 font-semibold";
  return (
    <article className="max-w-3xl space-y-2 rounded-lg bg-white p-6 text-sm shadow-sm">
      <h1 className="text-xl font-bold">Metodología y fuentes</h1>
      <p>SmarTrade ordena combinaciones producto-mercado según señales estadísticas. No predice rentabilidad ni éxito comercial. Documentación completa en <code>docs/methodology.md</code> y <code>docs/data-sources.md</code>.</p>
      <h2 className={h}>Indicadores</h2>
      <ul className="list-disc pl-5">
        <li><b>Tamaño:</b> importaciones anuales del producto por el mercado (año final).</li>
        <li><b>Crecimiento:</b> CAGR = ((final / inicial)^(1/2) − 1) × 100 sobre 3 años. No se calcula con valores no positivos.</li>
        <li><b>Cuota española:</b> importaciones desde España / importaciones totales × 100.</li>
        <li><b>Posición exportadora:</b> exportaciones españolas del producto al mundo.</li>
        <li><b>Concentración:</b> proporción de las importaciones que aportan los 3 mayores proveedores (cuando hay datos bilaterales).</li>
        <li><b>Valor unitario:</b> valor / peso neto; valor estadístico, no precio de venta.</li>
      </ul>
      <h2 className={h}>Dos rankings (índices 0-100)</h2>
      <ul className="list-disc pl-5">
        <li><b>Mercados grandes:</b> percentil del tamaño del mercado.</li>
        <li><b>Potencial de cuota:</b> percentil de cuánto está la cuota española del mercado por debajo de la cuota media de España en ese producto en los mercados de la búsqueda, con independencia del tamaño. Se limita si España apenas exporta el producto.</li>
      </ul>
      <p>Los percentiles se calculan sobre las oportunidades completas de la carga de datos; sin los cuatro datos (tamaño, crecimiento, cuota y exportación española) la oportunidad queda fuera. El crecimiento y la posición exportadora se muestran como datos informativos, pero no ordenan. Hasta el 03/11/2026 había una puntuación única (0,35·tamaño + 0,30·crecimiento + 0,20·expansión + 0,15·exportación); se sustituyó por estos dos rankings tras la validación histórica de abajo.</p>
      <h2 className={h}>Validación histórica (backtest)</h2>
      <p>Se calculó la antigua puntuación única como si fuera 2019, 2020 y 2021, con datos reales de Eurostat (50 productos, 26 mercados de la UE), y se comparó con lo que pasó en los 3 años siguientes. Resultado, igual en los tres años:</p>
      <ul className="list-disc pl-5">
        <li>El crecimiento pasado de un mercado <b>no anticipó</b> su crecimiento posterior.</li>
        <li>Para saber dónde aumentaron más en euros las ventas españolas, ordenar <b>solo por tamaño del mercado</b> acertó más que la puntuación única.</li>
        <li>El potencial de cuota española sí anticipó, con correlación modesta, dónde crecieron más <b>en porcentaje</b> las ventas españolas.</li>
      </ul>
      <p>Por eso hay dos rankings, uno por cada señal que funcionó, y el crecimiento pasado ya no ordena. Siguen siendo señales para decidir qué investigar, no previsiones. Es un único periodo (con la COVID y la inflación de 2022) y solo mercados de la UE. Detalle en <code>docs/methodology.md</code> y <code>docs/backtest-ranking.md</code>.</p>
      <h2 className={h}>Fuentes</h2>
      <ul className="list-disc pl-5">
        <li>Eurostat Comext (primaria; mercados de la UE como declarantes).</li>
        <li>UN Comtrade (complementaria; requiere clave).</li>
        <li>ICEX y Access2Markets: solo enlaces de consulta. La sección «Acceso al mercado» de la ficha es informativa, no consulta aranceles y no influye en los rankings.</li>
        <li>Modo DEMO: datos sintéticos, siempre etiquetados.</li>
      </ul>
    </article>
  );
}
