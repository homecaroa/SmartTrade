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
Solo con: importaciones de los 3 años, CAGR calculable, cuota calculable, exportaciones españolas, clasificación y moneda homogéneas. Si falta algo → **incompleta**, fuera de los dos rankings y con el motivo. No se imputan datos (criterio que se mantuvo al pasar a dos rankings, aunque cada uno use un solo componente: así las dos listas tienen el mismo conjunto de oportunidades). Combinaciones sin ninguna observación se cuentan como "sin datos" (no implican ausencia de comercio).

## Dos rankings (índices 0–100)
Desde el 03/11/2026 (ver «Validación histórica» abajo) no hay puntuación única. Hay dos rankings, cada uno con un solo componente normalizado a 0–100 por **percentil de rango medio**:
- **«Mercados grandes»** (`volumen`): percentil del tamaño del mercado. Ranking por defecto (decisión documentada, no estimada: responde a «dónde puedo vender más en euros»).
- **«Potencial de cuota»** (`potencial`): percentil de la expansión de cuota (brecha de penetración, abajo), con sus límites por baja exportación española.

Crecimiento y posición exportadora se siguen calculando y mostrando como datos informativos; no ordenan. Ordenar por crecimiento pasado sigue disponible en la interfaz, con un aviso. Antes la puntuación era `0,35·tamaño + 0,30·crecimiento + 0,20·expansión + 0,15·exportadora` (pesos en `DEFAULT_WEIGHTS`, ya eliminado).

**Universo:** todas las oportunidades completas de la carga de datos (año y, en modos reales, los códigos consultados), calculado **antes** de los filtros de mercado/tamaño/crecimiento/texto. Así filtrar no cambia los índices. Cambiar año o códigos cambia el universo y, por tanto, los índices: no son comparables entre cargas distintas. En modo demo el universo son los 8 productos × 11 mercados.

- **Crecimiento:** CAGR winsorizado en los percentiles 5–95 del universo y luego percentil. Crecimiento ≤ 0 → componente limitado a 25.
- **Expansión de cuota (brecha de penetración):** compara la cuota española del mercado con la cuota española de referencia del mismo producto (suma de todos los mercados de la búsqueda), de forma independiente del tamaño. `cuota contraída = (imp. desde España + m·cuota_ref) / (imp. totales + m)`; `brecha = 1 − cuota contraída / cuota_ref`; `m = 0,1 × mediana del tamaño de los mercados del producto`. Se normaliza por percentil. Brecha > 0: cuota inferior a la de referencia. Si España no vende el producto en ningún mercado analizado → 0. Si España no exporta el producto (valor 0) → 0. Si su percentil exportador < 25 → limitado a 25. Con un solo mercado por producto no hay referencia: brecha neutra.
- **Posición exportadora:** percentil del valor exportado, con un valor por producto (no se pondera por número de mercados).

La interfaz muestra, para cada oportunidad, su índice y su puesto en los dos rankings, y los percentiles informativos de crecimiento y exportación. Los enlaces antiguos con `sort=score` o `sort=size` llevan a «Mercados grandes». El CSV ya no tiene columna `puntuacion`: los índices son `percentil_tamano` y `percentil_expansion`.

## Calidad
`alta`: completa y todo observado · `media`: completa con alguna observación estimada · `baja`: incompleta.

## Limitaciones del método
Percentiles dependen del universo y con universos pequeños son poco informativos. Los rankings ordenan señales estadísticas; no es probabilidad de éxito, rentabilidad ni evaluación de costes, aranceles o barreras.

## Etiquetas en lenguaje llano
Cada oportunidad muestra hasta 3 etiquetas y una frase («Sube en el ranking por…»). Son un resumen con reglas fijas de los indicadores y percentiles ya calculados (`lib/scoring/labels.ts`); no cambian la puntuación ni aportan datos nuevos.
- Percentil alto = ≥ 75 dentro de las oportunidades de la búsqueda (tamaño, crecimiento, expansión de cuota, exportación). Por eso las etiquetas «de esta búsqueda» son relativas y no comparan con el mercado mundial.
- «Crece rápido» exige estar en el percentil ≥ 75 de crecimiento **y** un CAGR de al menos 5 % anual (corregido el 26/10/2026: en un universo en retroceso, un +0,2 % quedaba entre el 25 % mejor y se etiquetaba «rápido»); «En retroceso» se aplica a CAGR negativo; «Crecimiento irregular» a CAGR positivo con alguna variación anual negativa.
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

La frase «Sube en el ranking por…» usa expresiones neutras («el tamaño de su mercado», «la evolución de sus importaciones»), porque nombrar a un componente como «gran mercado» o «crecimiento» cuando su percentil o su valor no lo justifican contradecía las etiquetas.

## Validación histórica del ranking (backtest, 2026-11)
**Problema.** Los pesos (35/30/20/15) son una decisión documentada, no una medición: no sabíamos si el orden de mercados anticipa algo.

**Medición.** `scripts/backtest-ranking.ts` (método en `lib/backtest/ranking.ts`, pruebas en `tests/backtest.test.ts`) calcula el ranking con el mismo algoritmo como si fuera 2019, 2020 y 2021 (Eurostat, 50 códigos del catálogo, 26 mercados de la UE, unas 1.140 oportunidades por año) y lo compara con lo ocurrido en los 3 años siguientes. Métrica principal: correlación de Spearman **dentro de cada producto** (el orden que ve quien busca su producto), en 45–46 productos. No se pueden usar 2022 ni 2023 como origen: sus ventanas mezclan HS2017 y HS2022 y la app las marca como incompatibles. Resultados completos: `docs/backtest-ranking.md`.

**Resultado medido (ρ media dentro del producto, orígenes 2019 / 2020 / 2021):**
| Resultado posterior | Puntuación | Solo tamaño | Solo crecimiento pasado | Solo potencial de cuota |
|---|---|---|---|---|
| Crecimiento del mercado (CAGR) | −0,13 / −0,30 / −0,28 | −0,18 / −0,30 / −0,30 | 0,00 / −0,15 / −0,11 | −0,03 / −0,11 / −0,05 |
| Crecimiento de las ventas españolas (CAGR) | 0,06 / −0,03 / −0,02 | −0,10 / −0,16 / −0,10 | 0,06 / −0,01 / −0,01 | 0,21 / 0,17 / 0,18 |
| Aumento de las ventas españolas (€) | 0,21 / 0,15 / 0,08 | 0,35 / 0,40 / 0,35 | −0,01 / −0,03 / −0,06 | −0,12 / −0,22 / −0,18 |

Lectura:
- **El crecimiento pasado no anticipa el crecimiento futuro** (ρ ≈ 0) y pondera un 30 %.
- La puntuación **no anticipa** el crecimiento del mercado (correlación negativa: los mercados grandes crecieron menos en porcentaje) ni el crecimiento porcentual de las ventas españolas (≈ 0).
- Para el **aumento en euros** de las ventas españolas, ordenar **solo por tamaño** acierta más que la puntuación en los tres años (0,35–0,40 frente a 0,08–0,21). Parte es mecánica: en un mercado grande cualquier variación mueve más euros.
- El **potencial de cuota** anticipa el **crecimiento porcentual** de las ventas españolas (ρ ≈ 0,17–0,21, positivo en ~80 % de los productos). Parte puede ser regresión a la media (cuotas españolas bajas parten de bases pequeñas y volátiles).
- En resumen: la mezcla actual combina dos señales que funcionan para objetivos distintos (tamaño → euros; potencial de cuota → crecimiento relativo) con una que no aporta (crecimiento pasado), y el resultado queda por debajo de usar el tamaño solo.

**Corrección (03/11/2026, decisión del dueño).** La puntuación única se sustituye por dos rankings, uno por cada señal que funcionó: «Mercados grandes» (tamaño) y «Potencial de cuota» (expansión). El crecimiento pasado deja de ordenar. No se buscaron pesos nuevos a propósito: ajustar una mezcla a un único periodo arriesgaba sobreajustar. Cada ranking es exactamente el predictor medido, así que `docs/backtest-ranking.md` (regenerado ese día con los dos rankings) es su validación directa. Coste: el ranking «Mercados grandes» es, en la práctica, ordenar por tamaño; y «Potencial de cuota» favorece mercados donde España vende poco, que pueden ser pequeños o tener barreras (la ficha muestra el tamaño y los competidores al lado).

**Limitaciones.** Un solo periodo (2017–2024) con la COVID y la inflación de 2022 dentro; solo mercados de la UE; parejas no independientes (sin p-valores); los códigos que cambiaron en HS2022 quedan fuera del resultado posterior; el catálogo es una selección orientativa, no una muestra aleatoria.
