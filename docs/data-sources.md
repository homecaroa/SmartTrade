# Fuentes de datos

## Estado de verificación (honesto)
| Fuente | Estado |
|---|---|
| Datos DEMO | Funciona. Sintéticos, siempre etiquetados. |
| Eurostat Comext | **Primer contacto real verificado (18/10/2026, `npm run verify:comext` en un PC con internet):** HTTP 200, JSON-stat con las dimensiones esperadas, socio `WORLD`, flujos 1/2 e indicadores confirmados, y valores anuales reales devueltos para consultas con códigos vigentes. **Verificado también de principio a fin (18/10/2026):** la app en modo `comext` con `220421, 150920` devolvió 49 oportunidades válidas (26 mercados UE × 2 productos, ventana 2022–2024, `HS2022`, EUR) y 1 incompleta; las consultas con varios valores por dimensión funcionan. Adaptador probado además con un servidor simulado (`tests/helpers/mock-comext.ts`). |
| UN Comtrade | Documentación oficial contrastada; adaptador **opcional**, sin clave ni llamadas reales. |
| ICEX, Access2Markets | Solo enlaces en la ficha. |

El criterio «resultados de una fuente oficial en condiciones reales» está **parcialmente verificado**: la API responde con valores reales, pero falta comprobar la app completa en modo `comext` con códigos HS vigentes.

## Eurostat Comext
Docs oficiales consultadas: [Getting started – Comext](https://ec.europa.eu/eurostat/fr/web/user-guides/data-browser/api-data-access/api-getting-started/comext-database), [API Statistics](https://ec.europa.eu/eurostat/web/user-guides/data-browser/api-data-access/api-detailed-guidelines/api-statistics) y el listado de dataflows (`.../comext/dissemination/sdmx/2.1/dataflow/ESTAT/all`).

### Confirmado por la documentación oficial
- Host Comext propio: `https://ec.europa.eu/eurostat/api/comext/dissemination` (distinto del host general). Ruta: `/statistics/1.0/data/{dataset}`.
- Filtros `DIMENSION=VALOR`, sin orden obligatorio; varios valores repitiendo el parámetro; el filtro de tiempo acepta `time` (o `time_period`); `sinceTimePeriod/untilTimePeriod/lastTimePeriod` no se pueden mezclar con otros parámetros de tiempo salvo since+until. Respuesta JSON-stat 2.0; `format=JSON`, `lang=EN|FR|DE`.
- **La descarga completa de un dataset Comext está deshabilitada**: toda consulta debe llevar filtros (el adaptador siempre filtra por declarante, socio, producto, flujo y año).
- Errores: 400/404 «100 No results found» (consulta vacía), 400 «140 Syntax error», 400 «150 Semantic error», 500. El adaptador trata «No results» como *sin datos* (nunca como ceros) y el resto como error con la etiqueta de Eurostat.
- **Respuestas asíncronas** en extracciones grandes: `{"warning":{"status":413,"label":"ASYNCHRONOUS_RESPONSE..."}}`; hay que repetir la petición más tarde. El adaptador reintenta 3 veces (5 s, 10 s) y, si sigue pendiente, lanza un error `pending` (HTTP 503 en nuestra API) sin inventar datos.
- Dataset vigente: **DS-045409** «EU trade since 1988 by HS2-4-6 and CN8» (estructura v6.4 en el listado de agosto 2026). Existe también **DS-059341** «International trade of EU and non-EU countries since 2002 by HS2-4-6», candidato para cubrir declarantes no UE (no implementado; dimensiones sin verificar).
- Los valores comerciales son FOB en exportaciones y CIF en importaciones (nota metodológica de Eurostat/Comext): no son directamente comparables entre sí.

### Confirmado con la API real (ejecución del script en un PC con internet)
- Dimensiones: `freq, reporter, partner, product, flow, indicators, time` (`freq` = `A` anual / `M` mensual; el adaptador fuerza `A` y descarta cualquier otra).
- Socio «mundo» = `WORLD` («All countries of the world»); también existen agregados `EXT_EU27_2020`, `INT_EU27_2020`, etc. y `ES` como socio. Flujos `1` = IMPORT, `2` = EXPORT. Indicadores `VALUE_IN_EUROS`, `QUANTITY_IN_100KG`, `SUPPLEMENTARY_QUANTITY`.
- Tiempo anual: `time=2023` (mensual: `2023-01`). Productos HS2, HS4 y HS6 conviven en la dimensión `product` (p. ej. `15`, `1509`, `220421`): hay que usar siempre códigos de 6 dígitos para no mezclar niveles.
- Una consulta sin datos devuelve HTTP 200 con `"value":{}` (no un error): el adaptador lo trata como ausencia de datos.
- **Los códigos HS6 siguen la nomenclatura de cada año.** `150910` devolvió datos en 2021 y **ninguno en 2022–2023** porque la revisión HS2022 lo sustituyó por `150920/150930/150940/150990` (comprobado en las tablas de la OMA). Eso no es un fallo de la API. Con ventanas desde 2022 hay que usar códigos HS2022; `220421` devuelve datos en 2023.

### Confirmado además: consultas con varios valores por dimensión (reporter, partner, product, flow, indicators, time) en una sola petición.

### Supuestos aún NO confirmados (centralizados en `COMEXT` en `lib/sources/comext.ts`)
Grecia = `EL` como declarante, y el significado de los indicadores de estado (`c`, `e`) del JSON-stat.

### Consultas del adaptador
1) Importaciones: declarantes UE × socios {mundo, ES} × productos HS6 × 3 años, flujo 1, valor y peso. 2) Exportaciones: declarante ES × socio mundo × productos × años, flujo 2. 3) Ficha: declarante × producto × año sin filtrar socio (proveedores; se descartan agregados que no sean ISO2).

**Cobertura:** declarantes de la UE. Mercados no UE requieren Comtrade (o el dataset DS-059341 tras verificarlo).

## UN Comtrade (opcional)
Docs: https://uncomtrade.org/docs/un-comtrade-api/
- **No es necesario** para usar la app: sin `COMTRADE_API_KEY` el modo `comtrade` devuelve un error de configuración claro y los demás modos no se ven afectados.
- Confirmado: `data/v1/get/C/A/HS` con `cmdCode, period, reporterCode, partnerCode, flowCode, maxrecords`; la clave gratuita permite `get` para «pequeñas cantidades de datos»; la API de vista previa (`public/v1/preview/...`) funciona sin clave y está muy limitada. Las claves se obtienen en el API Portal de Comtrade (cuenta gratuita).
- No confirmado: nombres exactos de campos, límite de registros de la clave gratuita (el adaptador usa `maxrecords=500`, **trocea** las consultas y **rechaza** respuestas que alcancen 500 filas por posible truncado), y envío por cabecera `Ocp-Apim-Subscription-Key` (la documentación muestra `subscription-key` en la URL; `COMTRADE_KEY_IN_QUERY=true` lo activa).
- Valores en **USD** (nunca se mezclan con EUR). Los códigos numéricos de país del catálogo (`lib/config/catalog.ts`) no están verificados: se aceptan solo filas cuyo ISO3 coincide con el país solicitado. Lista oficial: [ComtradePlus_DataItems.xlsx](https://comtradeapi.un.org/files/v1/app/wiki/ComtradePlus_DataItems.xlsx).
- Comprobación: `npm run verify:comtrade` (vista previa sin clave; con clave prueba también `data/v1/get`).

## Clasificación
HS a 6 dígitos. La versión HS se deduce del año (2012, 2017, 2022). Una ventana que cruce revisiones (p. ej. 2021–2023) **no se combina**: queda incompleta. Por eso el año final por defecto es 2024 (ventana 2022–2024). Años posteriores al último año completo se rechazan (datos provisionales/incompletos).

## Datos demo
`lib/sources/demo.ts`: 8 productos HS6 y 11 mercados, valores sintéticos deterministas, `synthetic=true`. Incluye dos casos incompletos a propósito.
