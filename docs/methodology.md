# Metodología

Unidad de análisis: producto (HS6 o NC8) × mercado de destino × ventana de 3 años (año final seleccionable). Origen: España (único soportado).

Desde el 06/11/2026 SmarTrade hace un **diagnóstico descriptivo**: indicadores independientes, en su unidad y con su periodo. **No hay puntuación, índices, percentiles ni previsiones.** El historial de la puntuación y por qué se retiró está al final.

## Indicadores (`lib/trade/opportunities.ts`)
Cada indicador se calcula solo con los datos de ese producto en ese mercado: no depende de qué más se haya buscado.
- **Importaciones:** valor importado por el mercado desde el mundo, cada año de la ventana, en la moneda de la fuente (EUR en Comext, USD en Comtrade; nunca se mezclan ni se convierten).
- **Variación interanual:** `(último / anterior − 1) × 100`.
- **Crecimiento anual compuesto (CAGR):** `((final / inicial)^(1/2) − 1) × 100`. **Solo con la serie completa y comparable** y valores positivos (corregido el 06/11/2026: antes se calculaba entre los extremos aunque faltara el año intermedio). Es evolución pasada, no previsión.
- **Volumen:** peso neto importado (kg) y su CAGR, solo si los tres pesos existen. Si la fuente estima algún peso, se avisa.
- **Presencia española:** importaciones del mercado con socio España, su participación en el total y la variación de esa participación en la ventana (puntos). Si España > total (definiciones inconsistentes), la participación queda sin calcular y se explica.
- **Exportaciones españolas al mundo:** declaración de España; informativa, no se compara con la del mercado. Si la fuente la da en otra moneda, no se muestra.
- **Países proveedores** (ficha): valor, participación, variación y valor unitario (valor / peso; indicio, no precio).

Ausente ≠ cero: un indicador no calculable es `null` («n.d.») con su motivo en `missing`. `complete` significa «serie de importaciones de los 3 años, misma clasificación y moneda». Calidad: `alta` (completa, todo observado), `media` (completa con alguna observación estimada), `baja` (incompleta).

## España como país de expedición
En Comext, las importaciones intra-UE se atribuyen al Estado miembro de **expedición** y las extra-UE al país de **origen** (metadatos ESMS de Eurostat, «International trade in goods»). En un mercado de la UE, «España» significa «expedido desde España»: el producto español reexpedido por otro país cuenta como de ese país, y lo que se expide desde España sin ser español cuenta como español. UN Comtrade usa el país de origen. `partnerBasis` lo indica en cada resultado y la interfaz y el CSV (`socio_espana_es`) lo dicen. No se corrige con estimaciones.

## Ordenar mercados (`lib/trade/ranking.ts`)
- Siempre **dentro de un producto** y por **una sola métrica**: `valor` (importaciones), `crecimiento` (CAGR, exige serie completa), `peso` o `espana` (importaciones con socio España).
- Solo entran los mercados con dato para esa métrica; los demás se listan aparte («sin dato»).
- Empates: por código de mercado (determinista).
- Los productos no se ordenan entre sí. El puesto se muestra como «N de M mercados del producto».

## Lectura del mercado (`lib/trade/diagnosis.ts`)
Frases generadas con plantillas fijas a partir de los indicadores (sin IA). Avisos:
- «Crecimiento excepcional»: CAGR ≥ 30 % anual.
- «Posible efecto precio»: el CAGR en valor supera al del peso en 15 puntos o más.
- «Puerto de entrada a la UE»: Países Bajos y Bélgica (efecto Róterdam), solo con socio por expedición.
- Producto DOP producido solo en España: la participación española es casi 100 % por definición.
- Datos estimados o serie incompleta.
- Umbrales de estabilidad: |CAGR| < 1 % = «prácticamente estable».

Los umbrales (1 %, 30 %, 15 puntos) son **decisiones documentadas, no estimadas**. El de 30 % nació de un caso real (vino en Luxemburgo, CAGR 46 %).

## Ventanas que cruzan HS2017 → HS2022 (`lib/trade/hs-revisions.ts`)
Hasta el 06/11/2026 ninguna ventana con años finales 2022 o 2023 se combinaba (mezclan ediciones) y salían vacías. Ahora se unen **solo** los códigos HS6 del catálogo que no cambiaron entre HS2017 y HS2022 según la tabla de correlación de la Organización Mundial de Aduanas (Table II). Quedan fuera, con explicación: 150920 y 150930 (nuevos, salen de 1509.10), 851713, 854143 (nuevos) y 180690, 841810, 870829 (alcance modificado). Los NC8 no se unen (su continuidad no está comprobada). 080521/080522 ya existían en HS2017 (comprobado en Comext).

## Errores de la fuente
- Código no reconocido por Eurostat: responde `EXTRACTION_TOO_BIG` (413) porque descarta el filtro de producto. Se trata como error de la consulta («revisa el producto», HTTP 404), no como fallo del proveedor.
- Fallo temporal del proveedor, respuesta asíncrona pendiente y error interno se muestran con mensajes distintos.
- Página fuera de rango: se avisa de cuántas páginas hay y se enlaza a la última.

## Limitaciones
Indicadores descriptivos de estadística oficial: no miden rentabilidad, barreras, competencia real ni probabilidad de éxito. El crecimiento pasado no anticipa el futuro (ver el historial). Las cifras de la UE y de fuera de la UE no son comparables entre sí (moneda, valoración, declarante).

## Historial: la puntuación y su retirada

**Hasta el 03/11/2026:** puntuación `0,35·tamaño + 0,30·crecimiento + 0,20·expansión de cuota + 0,15·posición exportadora`, cada componente como percentil dentro del universo de la búsqueda. En octubre se corrigió la redundancia entre tamaño y expansión (correlación de rangos 0,998 en la demo) con una «brecha de penetración».

**03/11/2026:** un backtest (Eurostat, orígenes 2019–2021, ~46 productos, Spearman dentro del producto; `docs/backtest-ranking.md`) mostró que el crecimiento pasado no anticipaba nada y que la mezcla rendía peor que el tamaño solo. Se sustituyó por dos rankings: «Mercados grandes» (percentil del tamaño) y «Potencial de cuota» (percentil de la brecha).

**06/11/2026 — retirada (segunda auditoría independiente, decisión del dueño):**
- **Problema.** Los dos rankings no superaban a reglas triviales en su propia validación (ρ media dentro del producto; medido con un script de la auditoría fuera del repositorio sobre la misma descarga 2017–2025):

  | Resultado | Predictor | 2019 | 2020 | 2021 |
  |---|---|---|---|---|
  | CAGR de las ventas españolas | «Potencial de cuota» | 0,21 | 0,17 | 0,18 |
  | | Cuota española baja (regla trivial) | 0,29 | 0,25 | 0,27 |
  | Aumento en € de las ventas españolas | «Mercados grandes» | 0,35 | 0,40 | 0,35 |
  | | Ventas españolas actuales (regla trivial) | 0,37 | 0,45 | 0,33 |

  Además, «Potencial de cuota» y «cuota española baja» tenían una correlación de rangos media de 0,87–0,89: era casi la cuota invertida. Y los percentiles cambiaban según qué otros productos se buscaran.
- **Corrección.** Se retiran la puntuación, los percentiles y las etiquetas relativas. Quedan los indicadores en su unidad y la ordenación por una métrica dentro del producto. Se borraron `lib/scoring/score.ts`, `labels.ts`, `lib/backtest/ranking.ts`, `scripts/backtest-ranking.ts` y sus pruebas.
- **Resultado.** Las cifras de un mercado ya no dependen de la búsqueda (la ficha y la comparación cargan solo los productos implicados). Coste: se pierde un «orden recomendado»; a cambio no se presenta como señal algo que no lo es.
- **Limitaciones del análisis.** Un solo periodo con COVID e inflación de 2022; solo mercados de la UE; parejas no independientes (sin p-valores). Las diferencias son de dirección consistente, no de significación formal.
