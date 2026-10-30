# Pruebas

Ejecutadas realmente en el entorno de desarrollo (Node 22, Vitest 5): `npm test` → **9 archivos, 94 pruebas, todas correctas**. `npm run typecheck` y `npm run build` sin errores.

| Archivo | Pruebas | Cubre |
|---|---|---|
| `indicators.test.ts` | 8 | CAGR (y valor inicial cero), variaciones, cuota, concentración, valor unitario |
| `score.test.ts` | 9 | percentiles, winsorización, ponderación, crecimiento negativo, sin exportación española, reproducibilidad |
| `normalize.test.ts` | 6 | duplicados, compatibilidad (clasificación, moneda, producto, sintético/real), esquema |
| `opportunities.test.ts` | 13 | no hay puntuación con datos faltantes, filtros, ordenación, CSV |
| `quality.test.ts` | 14 | casos límite: valor final cero, España > total, cuota 0 observada, exportación 0, `unavailable`, estimados, monedas, series de 2 años, cambio de revisión HS, sin cobertura, empates, valores negativos |
| `sources.test.ts` | 11 | JSON-stat controlado, Comtrade controlado, errores HTTP/red/JSON, caché obsoleta, separación real/sintético |
| `comext-adapter.test.ts` | 12 | clasificación de respuestas oficiales (datos/vacío/413/errores), reintentos asíncronos, URLs filtradas con el formato documentado, Grecia enviada como GR (Comext no usa EL), celdas ausentes ≠ 0, proveedores, **scripts `verify:comext` contra servidor simulado** (códigos 0/1/2) |
| `comtrade-adapter.test.ts` | 5 | sin clave no llama a la red, clave por cabecera/query y nunca en errores, truncado, troceo, filas ignoradas |
| `integration.test.ts` | 13 | flujo completo en demo, filtros, paginación, detalle, errores en modos reales, aviso de universo pequeño, año incompleto |

**Importante:** los servidores y fixtures de `tests/helpers/mock-comext.ts` son **simulados** (valores sintéticos y los supuestos del adaptador). Prueban nuestro código, no que la API real use esos ids.

## Comprobaciones manuales (modo demo, app compilada)
`/`, `/oportunidad/{id}`, `/metodologia` → 200; `/api/opportunities` → ranking; parámetros inválidos → 400; CSV filtrado con marca `SI_DEMO_SINTETICO`; estado vacío. `npm run verify:comext` sin red → diagnóstico «DNS: no se resuelve el host», código 1 (ejecutado aquí).

## No cubierto
Llamadas reales a Comext/Comtrade, pruebas de interfaz en navegador, pruebas de carga.

## Ejecución real de `verify:comext` (PC del usuario, 18/10/2026)
HTTP 200 y JSON-stat reales; dimensiones, `WORLD`, `ES`, flujos 1/2 e indicadores confirmados. Con 150910 y 2022–2023 devolvió `value:{}` porque el código ya no existe en HS2022 (con 2021 sí devolvió valores). Con 220421 (2023) devolvió valores. El script se amplió para probar códigos vigentes y eliminados.

## Ejecución real de la app en modo `comext` (PC del usuario, 18/10/2026)
`SMARTRADE_DATA_MODE=comext`, búsqueda `220421, 150920`: `/api/opportunities` devolvió `validCount: 49`, `incompleteCount: 1`, `pairsWithoutData: 2`, `synthetic: false`, fuente «Eurostat Comext». Auditoría de los resultados: valores y cuotas plausibles; hallazgos corregidos (peso con error de coma flotante, aviso de pocos productos, lista de pares sin datos, nombres largos en la tabla).

## Búsqueda por nombre (`tests/product-search.test.ts`)
Valida el catálogo (códigos HS6 únicos), la búsqueda por nombre (acentos, plurales, todas las palabras), la mezcla de códigos, prefijos y nombres, y el límite de 20 códigos. Total actual: 101 pruebas en 10 archivos.

## Acceso al mercado (`tests/market-access.test.ts`)
Origen/destino, UE frente a terceros países, ausencia de datos sin conversión a cero, separación arancel/impuestos/logística, fuentes y enlaces, datos demo y no interferencia con la puntuación. Todas con entradas controladas; ninguna consulta real.

## Sectores (`tests/sectors.test.ts`)
Integridad del catálogo de sectores, expansión de `sector:<id>` en la consulta, combinación de sectores y filtro del modo demo. Total actual: 116 pruebas en 12 archivos.

## Etiquetas (`tests/labels.test.ts`)
Umbrales (75 sí, 74 no), crecimiento negativo/irregular, precauciones, ausencia de etiquetas sin puntuación, frase con los dos mayores aportes, ausencia de promesas y de efectos sobre la puntuación. Total actual: 126 pruebas en 13 archivos. También se comprobó que el HTML en modo demo muestra etiquetas en la tabla y «En pocas palabras» en la ficha.

## Auditoría 2026-10: ficha imprimible, CSV, búsqueda
`tests/research-checklist.test.ts` (pasos pendientes, fuentes, metadatos del CSV) y ampliación de `tests/product-search.test.ts` (inglés y erratas). Total: 134 pruebas en 14 archivos; typecheck y build correctos. Comprobación manual en modo demo: la ficha incluye botón de impresión, cabecera de impresión y lista de comprobaciones; el CSV incluye ventana, universo y percentiles.

## Nombres y etiquetas (ronda 04)
`tests/names.test.ts` (nombres de país y título de producto) y ampliación de `tests/labels.test.ts` («Hueco de cuota» no convive con «España ya vende aquí»). Total: 140 pruebas en 15 archivos; typecheck y build correctos.

## Expansión de cuota (ronda 05)
`tests/expansion.test.ts` (independencia del tamaño, referencia por producto, contracción, casos sin referencia, reglas de exportación, reproducibilidad, universo sintético sin redundancia) y adaptación de `tests/score.test.ts` y `tests/labels.test.ts`. Total: 148 pruebas en 16 archivos; typecheck y build correctos.

## Comparador (ronda 06)
`tests/compare.test.ts`: validación de la selección, filas con «n.d.» (nunca cero), estado de aranceles y carga en modo demo con resultados inexistentes. Comprobación manual en modo demo: casillas y botón en la tabla, página `/comparar` con 2 resultados, mensaje de error con 1. Total: 153 pruebas en 17 archivos; typecheck y build correctos.

## Crecimiento en volumen y avisos (ronda 08)
Ampliación de `tests/labels.test.ts` (umbrales de crecimiento excepcional y efecto precio), `tests/opportunities.test.ts` (CAGR del peso, null sin pesos) y `tests/research-checklist.test.ts` (nueva columna del CSV). Total: 158 pruebas en 17 archivos; typecheck y build correctos. Comprobación manual en modo demo: la ficha muestra el crecimiento en volumen y el CSV la nueva columna.

## Comtrade: comportamiento observado en la API real (ronda 09)
`tests/comtrade-adapter.test.ts` incluye fixtures sintéticos con la forma observada: restricciones de totales, identificación por código numérico, descarte de desgloses, reintento tras 429, separación entre llamadas y proveedores fuera del catálogo. Total: 165 pruebas en 17 archivos; typecheck y build correctos. La verificación contra la API real se hizo a mano con `verify-comtrade-detalle.mjs` (resultados en docs/data-sources.md).

## Fuera de la UE (ronda 10)
`tests/outside-eu.test.ts`: concesión del modo solo con clave y comext, mercados verificados, parámetro `fuente` y un ranking completo con respuestas sintéticas de Comtrade (solo se llama a comtradeapi.un.org, USD, sin datos demo). Total: 170 pruebas en 18 archivos; typecheck y build correctos. Comprobación manual en modo demo: sin permiso, `?fuente=fuera` muestra un aviso y el selector no aparece. **No se ha probado el modo con la clave real dentro de la aplicación.**

## Revisión de fichas reales fuera de la UE (26/10/2026)
Tras revisar el ranking de «vino» fuera de la UE se corrigió «Crece rápido» (umbral absoluto de 5 %) y la frase explicativa; `tests/labels.test.ts` cubre 0,2 %, 4,9 % y 5 %. Total: 170 pruebas en 18 archivos; typecheck correcto.

## Peso estimado (ronda 12)
Fixtures sintéticos con la forma observada: el adaptador conserva `isNetWgtEstimated` y la oportunidad expone `weightEstimated`. Total: 172 pruebas en 18 archivos; typecheck y build correctos.

## Guía de transporte e Incoterms (ronda 13)
`tests/logistics.test.ts` comprueba las 11 reglas (exclusivas marítimas, quién despacha exportación e importación, quién contrata transporte y seguro) y que la guía no contiene tarifas, plazos ni porcentajes. Total: 179 pruebas en 19 archivos; typecheck y build correctos; comprobación manual en modo demo de `/logistica` y del enlace desde la ficha.

## Importadores y compradores (ronda 14)
`tests/buyers-*.test.ts` (6 archivos): reglas de evidencia, integridad del conjunto curado del piloto, extracción, descarga segura (SSRF, robots, tamaño, redirecciones), proveedor Tavily con respuestas simuladas, servicio (curado + en vivo, caché, errores) y CSV. Las fixtures de búsqueda en vivo son ficticias y están marcadas como tales; el conjunto curado son datos reales con fuente. Total: 223 pruebas en 25 archivos; typecheck y build correctos. Comprobación manual en modo demo: página, filtros, estado sin datos, validación, CSV y enlace desde la ficha. **Tavily no se ha probado con una clave real.**

## Pistas con IA (29/10/2026)
`tests/buyers-ia.test.ts` (29 pruebas): prompt y esquema, cliente de Gemini con `fetch` simulado (clave solo en cabecera y nunca en errores, sin herramientas de búsqueda, formas de respuesta, errores), auditoría (webs reales, que no responden, de otra empresa, dominio compartido, nombres genéricos, sin web, duplicadas, lectura única por dominio), generación de punta a punta, integración con el servicio y el CSV, validez de los ficheros guardados y términos de importación en alemán/francés/italiano/portugués. Todo FICTICIO. Total: 252 pruebas en 26 archivos; typecheck y `next build` correctos. Ampliado el mismo día con la forma de respuesta real, reintentos y modelo de respaldo (5 pruebas más: 257; mutaciones en rojo: reintentar 404, quitar el respaldo, quitar los reintentos). Mutaciones que se ponen en rojo: no exigir que la web nombre a la empresa, permitir «confirmado» a la IA, activar la búsqueda de Google, filtrar la clave en un error, enlazar webs sin leer. Comprobación manual: el script contra un Gemini simulado en local (salidas 0/1/2) y la página `/compradores` y el CSV con una lista temporal (borrada). **No probado con la API real de Gemini ni con webs reales.**
