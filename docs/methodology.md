# Metodología

Unidad de análisis: producto HS6 × mercado de destino × ventana de 3 años (año final seleccionable). Origen: España (único soportado).

## Indicadores
- **Tamaño:** importaciones anuales del mercado (partner mundo) en el año final, moneda de la fuente.
- **Crecimiento (CAGR):** `((final/inicial)^(1/2) − 1) × 100` con 3 años y 2 intervalos. Si inicial o final ≤ 0 o falta → no disponible (no se fuerza). Se muestran las variaciones anuales.
- **Cuota española:** `importaciones desde España / importaciones totales × 100` (mismo producto, periodo, clasificación y moneda). No disponible si España > total.
- **Posición exportadora:** exportaciones españolas del producto al mundo, año final. No prueba capacidad productiva ni competitividad.
- **Concentración:** top-3 proveedores / importaciones totales (ficha de detalle, si hay datos bilaterales).
- **Valor unitario:** valor / peso neto (kg). Valor estadístico, no precio de venta.

## Inclusión en el ranking
Solo con: importaciones de los 3 años, CAGR calculable, cuota calculable, exportaciones españolas, clasificación y moneda homogéneas. Si falta algo → **incompleta**, sin puntuación y con el motivo. No hay puntuación parcial ni redistribución de pesos. Combinaciones sin ninguna observación se cuentan como "sin datos" (no implican ausencia de comercio).

## Puntuación (0–100)
`0,35·tamaño + 0,30·crecimiento + 0,20·expansión + 0,15·exportadora`, cada componente normalizado a 0–100 por **percentil de rango medio**.

**Universo:** todas las oportunidades completas de la carga de datos (año y, en modos reales, los códigos consultados), calculado **antes** de los filtros de mercado/tamaño/crecimiento/texto. Así filtrar no cambia la puntuación. Cambiar año o códigos cambia el universo y, por tanto, las puntuaciones: no son comparables entre cargas distintas. En modo demo el universo son los 8 productos × 11 mercados.

- **Crecimiento:** CAGR winsorizado en los percentiles 5–95 del universo y luego percentil. Crecimiento ≤ 0 → componente limitado a 25.
- **Expansión de cuota:** percentil de las importaciones no españolas (`tamaño × (1 − cuota)`). Si España no exporta el producto (valor 0) → 0. Si su percentil exportador < 25 → limitado a 25.
- **Posición exportadora:** percentil del valor exportado, con un valor por producto (no se pondera por número de mercados).

Los pesos están en `DEFAULT_WEIGHTS` (`lib/scoring/score.ts`) y son configurables en código. La interfaz muestra aporte por componente y los dos mayores contribuyentes.

## Calidad
`alta`: completa y todo observado · `media`: completa con alguna observación estimada · `baja`: incompleta.

## Limitaciones del método
Percentiles dependen del universo y con universos pequeños son poco informativos. La puntuación ordena señales estadísticas; no es probabilidad de éxito, rentabilidad ni evaluación de costes, aranceles o barreras.

## Etiquetas en lenguaje llano
Cada oportunidad muestra hasta 3 etiquetas y una frase («Sube en el ranking por…»). Son un resumen con reglas fijas de los indicadores y percentiles ya calculados (`lib/scoring/labels.ts`); no cambian la puntuación ni aportan datos nuevos.
- Percentil alto = ≥ 75 dentro de las oportunidades de la búsqueda (tamaño, crecimiento, expansión de cuota, exportación). Por eso las etiquetas «de esta búsqueda» son relativas y no comparan con el mercado mundial.
- «Crece rápido» exige CAGR positivo; «En retroceso» se aplica a CAGR negativo; «Crecimiento irregular» a CAGR positivo con alguna variación anual negativa.
- «España ya vende aquí»: cuota española ≥ 10 %. «Poca exportación española»: percentil de exportación ≤ 25.
- «Datos con reservas»: calidad media o baja. Las etiquetas no son recomendaciones ni predicen rentabilidad.
