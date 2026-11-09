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

## Diagnóstico descriptivo (06/11/2026)
Ejecutado aquí: `npm test` → **42 archivos, 453 pruebas correctas**; `tsc --noEmit` y `next build` sin errores. (`eslint` no tiene configuración en el proyecto y no se ejecuta.)
- **Borradas con el código que probaban** (puntuación retirada): `score.test.ts`, `expansion.test.ts`, `backtest.test.ts`, `labels.test.ts`. Sustituidas por `diagnosis.test.ts` (lectura y avisos con sus umbrales), `rankings.test.ts` (orden por métrica dentro del producto, sin mezclar productos, empates, mercados sin dato) y `opportunities.test.ts` reescrito (indicadores, CAGR solo con serie completa, expedición/origen).
- **Adaptadas con su porqué en el propio fichero:** `quality.test.ts` (España > total y monedas: el indicador queda null y se explica; la ventana HS se une si el código no cambió y no si cambió), `compare.test.ts`, `research-checklist.test.ts` (CSV), `sectors.test.ts`, `snapshots.test.ts`, `nc8.test.ts`, `integration.test.ts`, `outside-eu.test.ts`, `normalize.test.ts`, `learning-logistics.test.ts`.
- **Nuevas:** `learning-corrections.test.ts` (base FOB de EE. UU., capital asegurado, cláusulas A/C, texto de incidencias, sin «110 % del valor» en los casos) y `errors-and-pages.test.ts` (413 de Eurostat como error de consulta, página fuera de rango, ninguna página habla de puntuación ni enlaza a `/compradores`, `/compradores` estático).
- **Mutaciones en rojo:** devolver la base del seguro al valor EXW (3 fallos) y sumar el flete internacional a la base de EE. UU. (2 fallos).
- **Navegador** (Playwright contra `next start`, demo y comext con datos guardados; escritorio y 390 px): portada, búsqueda, sector, página 99, `sort` antiguo, vino 2021–2023 (ventana unida, 26 mercados), AOVE 150920 2021–2023 (sin CAGR, serie incompleta), 999999 («Revisa el producto»), ficha de Alemania y Países Bajos, comparación válida e inválida, compradores, metodología, guía y aprendizaje. Sin errores de consola, sin peticiones externas, sin desbordamiento horizontal, un `h1` por página. Encontrado y corregido al mirar las capturas: el gráfico de evolución no tenía leyenda; el estado de error y la comparación inválida no tenían `h1`; la portada tenía dos.

## Portada del Modo Aprendizaje (09/11/2026)
`npm test` → **42 archivos, 455 pruebas correctas**; `tsc` y `next build` sin errores. Nuevas en `errors-and-pages.test.ts`: las reglas de `next.config.mjs` cubren exactamente los parámetros de `querySchema`, `/aprendizaje` → `/`, ninguna regla redirige la portada sin parámetro del análisis, y ningún formulario o enlace del análisis apunta ya a `/?`. Adaptadas con su porqué: `learning-integrity.test.ts` (la portada es del modo y solo importa su componente) y `learning-logistics.test.ts` (destino «/»). Mutación en rojo: devolver el buscador a `action="/"`. Navegador (`next start`, comext): `/` 200, `/?q=vino` → 308 `/mercados?q=vino`, `/?utm_source=x` 200 sin redirigir, `/aprendizaje` → 308 `/`; recorrido buscar → ficha → volver → cabecera → caso → «Todos los casos», sin errores; portada sin desbordamiento a 390 px.

## Caso de importación (09/11/2026)
`npm test` → **43 archivos, 475 pruebas correctas**; `tsc` y `next build` sin errores. Nuevo `learning-import.test.ts` (20): coste puesto en almacén por proveedor, antidumping también vía Malasia, composición del valor en aduana (con y sin DAP/CIF), base y tipo del IVA, IVA diferido sin coste, representación, recorrido completo con la mejor opción (100 %), errores graves, opciones según proveedor, sesión, integridad del caso. `learning-integrity.test.ts` incluye ya los componentes de importación (aviso de datos simulados, orden mezclado, sin red ni azar). Mutaciones en rojo: comisión de compra dentro del valor en aduana (2 fallos), base del IVA sin gastos hasta el primer destino (3), elusión que evita el antidumping (1), canon fuera del valor (2). Navegador (`next start`, demo, escritorio y 390 px): recorrido completo desde la portada, 13 decisiones con la mejor opción → 100 %, sin errores de consola, sin peticiones externas, sin desbordamiento; el resumen sobrevive a la recarga y la portada marca «Terminado». Al mirar las capturas se corrigió la frase de acierto del valor en aduana, que hablaba de «documentación».

## Business Simulator, fase 1 (09/11/2026)
`npm test` → **44 archivos, 500 pruebas correctas**; `tsc` y `next build` sin errores. Nuevo `tests/sim.test.ts` (25): semilla reproducible y secuencias independientes por sistema; reproducir las acciones da el mismo estado; balance cuadrado tras cada acción en 600 partidas; fijos pagados cada 4 semanas; capacidad del camión; equilibrio con 3 estrategias en 200 semillas; plazos de 30 y 60 días; calificación de ofertas; avería (subcontratar o callar); cliente moroso; reputación; pregunta del mes; guardado, importación y descarte de acciones inválidas; el motor sin `Math.random`, red ni hora; la interfaz sin reglas propias. `learning-integrity.test.ts` permite que `lib/sim` use solo las utilidades `money` y `order` del modo (comprobado con un import prohibido, que se pone en rojo). Mutaciones en rojo: sin cancelación por incumplimiento, cobro sin plazo, fijos pagados cada semana, fianza sin activo, viaje puntual servido a medias. Navegador (`next start`, escritorio y 390 px): partida 48213 completa desde la portada, con las dos incidencias, pregunta del mes respondida, balance cuadrado en pantalla, sin errores ni peticiones externas, y se recupera al recargar. Al mirar las capturas se corrigieron: «Pago a 28 días» (ahora 30), tarifas con un decimal y la pregunta del mes, que no se veía.

## Simulador: temporada de 26 semanas (09/11/2026)
`npm test` → **44 archivos, 507 pruebas correctas**; `tsc` y `next build` sin errores. `tests/sim.test.ts` pasa a 32 pruebas:
- **Equilibrio de temporada:** no hacer nada quiebra por caja; aceptarlo todo nunca gana y quiebra por servicio; la selectiva gana entre el 30 y el 70 % y más que la prudente; la victoria exige beneficio.
- **Compatibilidad con la fase 1:** las semanas 1–6 no cambian (ofertas base y primera avería) y hay una avería por tramo.
- **Reputación y prima de fiabilidad.**
- **Clientes:** referencia de terceros fija por cliente e historial propio.
- **Calculadora:** prioridad de operadores, paréntesis, coma decimal y rechazo de lo que no es una operación.

Las pruebas de la fase 1 que dependían del final en la semana 6 se adaptaron explicándolo en el propio archivo.

**Mutaciones en rojo:** prima desde la semana 1, victoria sin exigir beneficio, cambio del identificador de la primera avería, calculadora sin prioridad y sin derrota por servicio.

**Compatibilidad real:** 10 partidas generadas con el motor publicado (`main`) y cargadas con el nuevo. Las 7 jugadas con cuidado conservan las semanas 1–6 idénticas y continúan en la semana 7. Las 3 de «aceptarlo todo» terminan ahora por la nueva derrota por servicio.

**Navegador:** temporada completa en escritorio y a 390 px, con calculadora, historial y prima visibles, sin errores ni peticiones externas.

## Simulador: negociación, documentación y tesorería (09/11/2026)
`npm test` → **44 archivos, 521 pruebas correctas**; `tsc` y `next build` sin errores. `tests/sim.test.ts` pasa a 46 pruebas:
- **Negociación:** aceptar, contraofertar o irse según el límite oculto; el límite es reproducible; cobrar a 30 días cuesta; el plazo no se negocia en transporte ni pasa de 60 días; dos rondas; el contrato recoge lo pactado; negociar gana más que no hacerlo, pero no siempre.
- **Documentación:**
  - calificación en transporte y almacén;
  - la carta de porte sustituye al documento de control;
  - las sanciones cuadran en caja y resultados;
  - las aceptaciones antiguas no se penalizan y no se aceptan documentos inexistentes.
- **Tesorería:** sus conceptos explican la variación de caja de cada semana; beneficio y caja difieren.

**Mutaciones en rojo:** el cliente nunca se va, cobrar antes no cuesta, la carta de porte no sustituye al documento de control, sanción que no sale de caja y partidas antiguas penalizadas.

**Compatibilidad:** 21 partidas generadas con el motor publicado se reproducen idénticas.

**Navegador** (`next start`, escritorio y 390 px): negociación aceptada por el cliente, documentación al confirmar, cierre de semana con beneficio y tesorería separados, tablas de finanzas, sin errores ni desbordamiento.

## Simulador: viajes puntuales v2 y guardado (09/11/2026)
`npm test` → **44 archivos, 528 pruebas correctas**; `tsc` y `next build` sin errores. Nuevas en `tests/sim.test.ts`:
- **Viajes puntuales v2:** reparto de precios y porcentaje con carga de retorno.
- **Compatibilidad:** la v1 genera las mismas ofertas que antes.
- **Carga de retorno:** suma su precio a la factura, y aceptar un retorno inexistente se rechaza.
- **Versiones:** una partida v1 se reproduce con v1 sin aviso; una versión desconocida avisa.
- **Guardado:** una partida con negociación, documentación y retorno se guarda y se recupera entera, y se rechazan campos de tipo incorrecto.

**Mutación en rojo:** quitar el reconocimiento de «proponer» en el guardado, que era el fallo de producción.

**Compatibilidad real:** 28 partidas generadas con el motor publicado se reproducen idénticas, textos incluidos.

**Navegador:** partida nueva con carga de retorno; negociación, documentación y retorno; la partida se recupera al recargar.
