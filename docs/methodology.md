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
- **Expansión de cuota (brecha de penetración):** compara la cuota española del mercado con la cuota española de referencia del mismo producto (suma de todos los mercados de la búsqueda), de forma independiente del tamaño. `cuota contraída = (imp. desde España + m·cuota_ref) / (imp. totales + m)`; `brecha = 1 − cuota contraída / cuota_ref`; `m = 0,1 × mediana del tamaño de los mercados del producto`. Se normaliza por percentil. Brecha > 0: cuota inferior a la de referencia. Si España no vende el producto en ningún mercado analizado → 0. Si España no exporta el producto (valor 0) → 0. Si su percentil exportador < 25 → limitado a 25. Con un solo mercado por producto no hay referencia: brecha neutra.
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

## Corrección: redundancia entre tamaño y expansión de cuota (2026-10)
**Problema.** La versión inicial calculaba la expansión como el percentil de las importaciones no españolas (`tamaño × (1 − cuota)`). Con cuotas bajas, eso es casi igual al tamaño: ambos componentes (55 % del peso) medían prácticamente lo mismo. Sobre el universo demo (76 oportunidades, **datos sintéticos**) la correlación de rangos entre ambos percentiles era 0,998 (0,993 en la primera medición). Con datos reales, la ficha 690721 → Rumanía (50 oportunidades, 2 productos) mostraba percentil de tamaño 89 y de expansión 91 con una cuota española del 11,4 %.

**Corrección.** La expansión pasa a medir la brecha de penetración respecto a la cuota de referencia del producto (fórmula arriba). No se han cambiado los pesos (35/30/20/15) ni el resto de componentes. La contracción (`m`) evita que mercados muy pequeños, con cuotas inestables, obtengan brechas extremas; su valor (0,1 × mediana) es una decisión documentada, no estimada.

**Resultado medido (demo, datos sintéticos):** correlación tamaño–expansión 0,998 → 0,402; correlación de la puntuación total antes/después 0,954; 9 de las 10 primeras posiciones se mantienen. Las pruebas `tests/expansion.test.ts` comprueban independencia del tamaño, referencia por producto, contracción y que, en un universo sintético con cuotas independientes del tamaño, la correlación es menor de 0,3.

**Limitaciones.** La cuota de referencia depende de los mercados incluidos en la búsqueda (en datos reales, los de la UE como declarantes), no del mercado mundial. Un mercado con cuota baja puede reflejar barreras o falta de competitividad, no una oportunidad. Con datos reales aún no se ha repetido la medición completa: conviene hacerlo con un sector de 10 o más productos.

## Crecimiento en volumen y efecto precio (ronda 08)
Además del CAGR en valor, la ficha muestra el CAGR del **peso neto** importado (`cagrVolume`), que aproxima el volumen. Es `null` si faltan pesos o no son positivos (nunca cero). No entra en la puntuación. Dos etiquetas de precaución lo usan:
- «Crecimiento excepcional»: CAGR en valor ≥ 30 % anual. Suele deberse a efectos puntuales (precios, cambios de clasificación, reexportaciones o de quién declara).
- «Posible efecto precio»: el CAGR en valor supera al del peso en 15 puntos por año o más. El peso es una aproximación: un cambio en la composición del producto (por ejemplo, vehículos más pesados) también separa ambas cifras.
Los umbrales (30 % y 15 puntos) son decisiones documentadas, no estimadas. Motivo: en datos reales, un mercado (vino en Luxemburgo, CAGR 46 %) llegó al primer puesto de su sector con un crecimiento difícil de explicar solo con demanda; las etiquetas avisan, no corrigen el dato.

## Mercados fuera de la UE
Se calculan con la misma fórmula, pero sobre un universo propio (UN Comtrade, USD, solo los mercados verificados): sus percentiles y puntuaciones no son comparables con los del ranking de la UE (Eurostat, EUR), por moneda, criterio de valoración y conjunto de mercados distintos. Aranceles, reglas de origen e impuestos, que fuera de la UE sí existen, siguen sin verificarse en la ficha.
