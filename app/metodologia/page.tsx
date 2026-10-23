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
      <h2 className={h}>Puntuación (0-100)</h2>
      <p>0,35·tamaño + 0,30·crecimiento + 0,20·expansión de cuota + 0,15·posición exportadora. Cada componente se normaliza por percentil dentro de las oportunidades completas de la carga de datos. El crecimiento se acota (percentiles 5-95) y el negativo se limita a 25. Sin los cuatro componentes no hay puntuación. Limitación conocida: tamaño y expansión de cuota están muy correlacionados (ver docs/methodology.md).</p>
      <h2 className={h}>Fuentes</h2>
      <ul className="list-disc pl-5">
        <li>Eurostat Comext (primaria; mercados de la UE como declarantes).</li>
        <li>UN Comtrade (complementaria; requiere clave).</li>
        <li>ICEX y Access2Markets: solo enlaces de consulta. La sección «Acceso al mercado» de la ficha es informativa, no consulta aranceles y no influye en la puntuación.</li>
        <li>Modo DEMO: datos sintéticos, siempre etiquetados.</li>
      </ul>
    </article>
  );
}
