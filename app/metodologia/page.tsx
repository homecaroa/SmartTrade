import Link from "next/link";

export const metadata = { title: "Metodología y fuentes · SmarTrade" };

export default function Methodology() {
  const h = "mt-4 font-semibold";
  return (
    <article className="max-w-3xl space-y-2 rounded-lg bg-white p-6 text-sm shadow-sm">
      <h1 className="text-xl font-bold">Metodología y fuentes</h1>
      <p>SmarTrade hace un <b>diagnóstico descriptivo</b>: muestra indicadores independientes de cada producto en cada mercado, en su unidad y con su periodo. <b>No hay puntuación</b>, ni índices, ni previsiones. Documentación completa en <code>docs/methodology.md</code> y <code>docs/data-sources.md</code>.</p>

      <h2 className={h}>Indicadores</h2>
      <ul className="list-disc pl-5">
        <li><b>Importaciones:</b> valor importado por el mercado desde todos los países en cada año de la ventana (3 años).</li>
        <li><b>Variación interanual:</b> (último año / año anterior − 1) × 100.</li>
        <li><b>Crecimiento anual compuesto (CAGR):</b> ((final / inicial)^(1/2) − 1) × 100. Solo con la serie completa y valores positivos. Es evolución pasada, no previsión.</li>
        <li><b>Volumen:</b> peso neto importado (kg) y su crecimiento anual; no todos los países lo publican.</li>
        <li><b>Presencia española:</b> valor importado con socio España y su participación en el total. Ver el aviso de expedición.</li>
        <li><b>Países proveedores:</b> valor, participación, variación de participación y valor unitario (valor / peso, un indicio, no un precio).</li>
        <li><b>Exportaciones españolas al mundo:</b> lo que declara España; es otra declaración y no se compara con la del mercado.</li>
      </ul>

      <h2 className={h}>España como país de expedición</h2>
      <p>En los mercados de la UE, Eurostat atribuye cada importación procedente de otro Estado miembro al país de <b>expedición</b>, no necesariamente al de origen; en las importaciones de fuera de la UE usa el país de origen (metadatos de Eurostat, «International trade in goods»). Por eso, en un mercado de la UE, «España» significa «expedido desde España»: el producto español que llega a través de otro país cuenta como de ese país. SmarTrade no corrige este dato con estimaciones: lo muestra tal cual y lo avisa. UN Comtrade (mercados fuera de la UE) usa el país de origen.</p>

      <h2 className={h}>Ordenar mercados</h2>
      <p>Los mercados se ordenan siempre <b>dentro de un mismo producto</b> y por <b>una sola métrica</b>: valor importado, crecimiento anual pasado, volumen o importaciones con socio España. Los productos no se ordenan entre sí. Solo entran los mercados con dato para esa métrica; el crecimiento exige los 3 años.</p>

      <h2 className={h}>Por qué ya no hay puntuación</h2>
      <p>Hasta el 06/11/2026 había dos rankings por percentiles («Mercados grandes» y «Potencial de cuota»). Una validación histórica con datos reales de Eurostat (orígenes 2019–2021, 50 productos) mostró que no aportaban información propia: el «Potencial de cuota» era casi lo mismo que ordenar por cuota española baja y predecía peor que esa regla trivial; «Mercados grandes» no superaba de forma consistente a ordenar por lo que España ya vendía en cada mercado. Además, los índices cambiaban según qué más se buscara. Se retiraron. Detalle en <code>docs/backtest-ranking.md</code>.</p>

      <h2 className={h}>Periodos y nomenclatura</h2>
      <p>Una ventana que cruza el cambio del Sistema Armonizado de 2022 (años finales 2022 y 2023) se une solo para los códigos que no cambiaron entre HS2017 y HS2022, según la tabla oficial de correlación de la Organización Mundial de Aduanas. Para los que cambiaron (por ejemplo, el aceite de oliva virgen extra 150920, nuevo en 2022) la ficha lo explica y no calcula el crecimiento.</p>

      <h2 className={h}>Fuentes</h2>
      <ul className="list-disc pl-5">
        <li>Eurostat Comext (primaria; mercados de la UE como declarantes; euros).</li>
        <li>UN Comtrade (mercados fuera de la UE; dólares; requiere clave). Nunca se mezcla con Eurostat ni se convierte de moneda.</li>
        <li>OMC (aranceles medios a 6 dígitos fuera de la UE, con clave), Eurostat y OCDE (contexto del país).</li>
        <li>ICEX y Access2Markets: solo enlaces de consulta.</li>
        <li>Modo DEMO: datos sintéticos, siempre etiquetados.</li>
      </ul>
      <p><Link className="underline" href="/guia">Guía de uso</Link></p>
    </article>
  );
}
