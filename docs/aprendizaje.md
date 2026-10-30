# Modo Aprendizaje

Simulador educativo para el Grado Superior de Comercio Internacional, en `/aprendizaje`. Es **independiente** del análisis de mercados: rutas, componentes y lógica propios (`app/aprendizaje`, `components/learning`, `lib/learning`). No toca la API, el modelo estadístico ni los rankings, y **no hace ninguna llamada de red** (ni Gemini ni ninguna otra API): todo son escenarios locales y reglas deterministas.

## Módulos y casos
| Módulo | Caso | Dificultad | Qué se practica |
|---|---|---|---|
| Exportación | Aceite de oliva a Múnich (HS 150920, DE) | básica | Venta intracomunitaria: Incoterm multimodal, VIES, IVA exento, CMR como prueba de salida. Sin aduana. |
| Exportación | Vino a Yokohama (HS 220421, JP) | media | Tercer país: CIP para contenedor, cobro documentario, DUA, origen preferencial, coherencia documental. |
| Negociación | Aceite para un distribuidor mexicano (MX) | media | Punto de retirada, aplazamiento con seguro de crédito, exclusividad a cambio de volumen. |
| Negociación | Calzado para una cadena británica (GB) | avanzada | Plazo y garantías por encima del precio; DDP inviable sin registro de IVA. |
| Logística | Aceitunas Sevilla–Múnich (HS 200570, DE) | básica | 18 palés en 10 días dentro de la UE: el camión completo gana; el contenedor por mar es más barato pero no llega; grupaje y tren, con más manipulaciones. |
| Logística | Recambios Sevilla–Casablanca (HS 870899, MA) | media | Camión en ferry por el Estrecho (DAP: regla multimodal; FOB sería contradicción); el grupaje es más barato pero arriesga el plazo. Sin tren ni carretera directa. |
| Logística | Vino Sevilla–Nueva York (HS 220421, US) | media | Contenedor completo de 20' vía Algeciras frente a LCL y avión; CIP para contenedores (CIF, válida pero con aviso). |
| Logística | Calzado Sevilla–Tokio (HS 640399, JP) | avanzada | Con 15 días solo llega el avión, que es la opción más cara: peso tasable (1.500 kg por 9 m³ con 1.100 kg reales). |

Para añadir un caso basta con un fichero de datos en `lib/learning/*/scenarios/` y registrarlo en su `index.ts`; las pruebas de integridad comprueban que use productos, mercados e Incoterms de SmarTrade, que tenga incidencia y que sus datos lleven procedencia.

## Datos: qué es real y qué no
Cada dato de la ficha lleva su procedencia (`lib/learning/provenance.ts`): **dato real reutilizado** (código HS y nombre del catálogo de SmarTrade, pertenencia a la UE, reglas Incoterms® 2020 de `/logistica`), **supuesto del escenario**, **estimación didáctica** o **verificar en una operación real**. Las empresas llevan «(ficticia)» en el nombre. Los aranceles (15 % / 0 %), impuestos de importación (10 %), fletes, primas y probabilidades de impago son **inventados**: sirven para practicar el cálculo, no son tarifas. El aviso «Datos simulados con fines educativos» está en la portada, en cada simulador y en cada resumen (comprobado por prueba).

## Exportación: reglas y fórmulas (`lib/learning/export/`)
- **Quién paga cada tramo** sale de la tabla de Incoterms ya existente (`lib/logistics/incoterms.ts`): transporte principal, despachos, seguro obligatorio en CIF/CIP; carga del comprador solo en EXW; descarga del vendedor solo en DPU. Cada concepto aparece una vez: no se cuenta dos veces.
- **Precio (escandallo)** = precio EXW + costes logísticos estándar que asume el vendedor en ese Incoterm / unidades.
- **Seguro** = tipo × valor EXW × 110 %. **Valor en aduana** ≈ mercancía + transporte + seguro. **Arancel** = tipo (preferencial solo con prueba de origen) × valor en aduana. **IVA de importación** = tipo × (valor en aduana + arancel): si quien lo paga puede recuperarlo, se muestra aparte y **no** suma al coste; solo es coste para el vendedor en DDP sin registro en destino.
- **Margen** = ingresos − coste del producto − costes del vendedor (incluidos medio de cobro, incidencias y compensaciones).
- Itinerario **adaptativo**: dentro de la UE no hay despacho ni aranceles (el DUA es un error); si el transporte lo contrata el comprador no se pregunta el modo; el seguro solo se pregunta en reglas D. Las reglas de `validation.ts` detectan contradicciones (CIF con camión, DUA intracomunitario, plazo imposible, DDP sin registro…).
- Una decisión confirmada no se puede cambiar. Cada caso tiene al menos una incidencia con efecto económico coherente con el Incoterm (por ejemplo, la penalización por retraso solo la paga el vendedor si el transporte era suyo; sin declaración de origen compensa el arancel al comprador, salvo en DDP, donde ya lo pagó él).

## Laboratorio de logística (`lib/learning/logistics/`, `/aprendizaje/logistica`)
Acceso propio desde la portada y enlace desde la decisión «Modo de transporte» del simulador de exportación. Siete pasos: pedido → alternativas → selección y justificación → Incoterm (y una pregunta sobre riesgo frente a propiedad) → presupuesto → incidencia → resultado. Los casos son **datos** (`cases/`); los parámetros, en un único fichero (`params.ts`); las reglas, en `capacity.ts`, `allocation.ts`, `calculator.ts`, `assess.ts`, `incidents.ts` y `evaluation.ts`. Reutiliza la tabla de Incoterms® 2020 de `lib/logistics/incoterms.ts` y las funciones de riesgo y seguro de `export/costs.ts`.

**Fórmulas.**
- Aéreo: peso tasable = máx(peso real, m³ × 166,7) (relación 1:6000). Grupaje por carretera: máx(peso real, m³ × 333). LCL: toneladas-volumen W/M = máx(t, m³).
- FCL: contenedores = ⌈máx(m³ / capacidad útil, kg / carga máxima)⌉ con 20' = 28 m³ / 25 t y 40' = 58 m³ / 26,5 t (útiles, no nominales); se elige el equipo más barato. Camión: ⌈máx(palés / 33, kg / 24.000, m³ / 85)⌉.
- Camión completo = (fijo + €/km × km) × camiones. Seguro = prima × 110 % del valor. Terminales por contenedor, tonelada-volumen, kg tasable, palé o camión según la modalidad; transbordos por unidad y por punto.
- Coste logístico total = suma de conceptos (los pague quien los pague); por kg, t, palé y unidad = total / peso, palés o unidades; % logístico = total / valor × 100.
- Arancel = tipo preferencial × (valor + flete principal + seguro); impuesto de importación = tipo × (valor en aduana + arancel). Van **aparte** de la logística, y el impuesto recuperable por el importador no suma coste (sí en DDP).
- Coste por unidad entregada = (valor + logística + impuestos no recuperables) / unidades. Margen = precio pactado × unidades − coste de producto − lo que paga el vendedor según el Incoterm (incluidas las consecuencias de la incidencia).
- Todo se calcula en rangos (mín–máx); el **valor central** (punto medio) solo sirve para comparar y puntuar.

**Reparto por Incoterm** (convención didáctica, en el comentario de `allocation.ts`): recogida del comprador solo en EXW; terminal de origen del comprador en EXW, FCA y FAS; transporte, despachos y seguro, de la tabla existente; terminal y gastos de destino y última milla del vendedor solo en reglas D; descarga incluida solo en DPU. FAS/FOB/CFR/CIF con un tramo principal que no sea por barco (camión en ferry incluido) = contradicción; con contenedores = aviso (mejor FCA/CPT/CIP). El Incoterm fija el **riesgo**, no la propiedad.

**Valoración.** Plazo: «llega a tiempo» si incluso el peor caso (preparación + espera + tramos) cabe en el plazo; «solo en el mejor caso» o «no llega». La **mejor ruta es la más barata de las que llegan a tiempo**, no la más barata a secas; no llegar o costar más de 3× la mejor sin necesidad es error. La justificación se corrige contra los mismos datos de la tabla: un motivo falso es error; motivos ciertos sin el decisivo del caso, razonable. Incidencias deterministas según la modalidad: daño (lo paga quien tiene el riesgo; sin reservas en el CMR/B/L/AWB no hay reclamación), retraso o «roll-over» (penalización del 0,5 % del valor por día solo si el vendedor entrega en destino, reglas D), retención aduanera por documentos incoherentes (la paga el vendedor que los emitió) y descarga en escala aérea. Resultado: nota de conocimientos (5 decisiones, 10/6/0) y cinco dimensiones por separado: coste, plazo, adecuación, riesgo y coherencia comercial.

**Supuestos de costes** («Estimaciones simuladas con fines educativos», en `params.ts` y en cada caso): camión 250–400 € fijos + 1,15–1,45 €/km; despacho de exportación 90–160 €, de importación 120–250 €; prima de seguro 0,15–0,35 %; recogida 80–150 € (hasta 4 palés) o 120–220 € por camión; última milla 90–190 € o 180–380 €; fletes por caso (por ejemplo, FCL Algeciras–Nueva York 1.500–2.300 € por 20'; aéreo Sevilla–Tokio 3,4–4,8 €/kg tasable). Órdenes de magnitud plausibles, **no** tarifas reales.

## Negociación: comprador por reglas (`lib/learning/negotiation/`)
- Compara en **coste puesto en su almacén** (precio + lo que paga él según el Incoterm). Utilidad 0–1 por criterio (precio, pago, plazo, cantidad, garantía, entrega) ponderada por sus prioridades. **Límites duros** (cantidad fuera de rango, plazo excesivo, pago inaceptable, precio > 110 % de su máximo) impiden aceptar.
- Acepta si no hay límites duros y la utilidad llega a su umbral; si no, **contraoferta** acercándose a su objetivo con concesiones crecientes por ronda (30 %, 50 %, 70 %…), corrigiendo pago, plazo, cantidad e Incoterm, y pidiendo exclusividad **a cambio de volumen** si la valora. Se retira si dos ofertas seguidas no mejoran o si a partir de la tercera la oferta sigue muy lejos; la quinta respuesta es su última propuesta. Al alumno solo le explica qué ha pesado, sin cifras; los límites se revelan al final.
- Economía del vendedor: ingresos − producto − logística − garantía − financiación (coste de capital × días / 365) − comisión − **pérdida esperada** (probabilidad de impago, que se muestra como coste medio del riesgo, no como gasto seguro).

## Evaluación
- Exportación: **nota de conocimientos** (decisión adecuada 10, razonable 6, error importante 0) y, aparte, **resultado económico**. Ejemplo medido: elegir siempre la primera opción da 53 % de nota con un 15,6 % de margen.
- Negociación: cinco dimensiones por separado (rentabilidad con tope en el margen objetivo, para no premiar el precio por sí solo; adecuación; riesgo de impago; plazos y requisitos; estrategia) y una nota de conocimientos (preparación + proceso: apertura, ritmo de concesiones, concesiones con contrapartida —aceptar una contraoferta más barata cuenta como concesión—, punto de retirada, exclusividad). Se compara con una estrategia de referencia simulada con el mismo comprador.
- Las opciones se muestran en un **orden mezclado determinista** (`lib/learning/order.ts`): en los datos la correcta suele ir primera y, sin mezclar, elegir siempre la primera daba un 100 %.

## Persistencia
`localStorage` del navegador, con clave por módulo, caso y versión (`smartrade:aprendizaje:v1:…`), validada al cargar: no se mezclan sesiones de casos o versiones distintas. Si el navegador lo bloquea, la simulación funciona sin guardar.

## Limitaciones educativas
- Los casos simplifican la realidad: un pedido, un envío, importes redondos, sin tipo de cambio (todo en euros), sin impuestos especiales, sin seguros de cambio ni financiación bancaria.
- Las afirmaciones normativas (etiquetado en alemán, declaración de origen UE–Japón, notificación sanitaria del importador, IVA intracomunitario y modelo 349) están marcadas **«verificar en una operación real»**: son el planteamiento didáctico habitual, no asesoramiento.
- El comprador simulado es un modelo de reglas: no imita el comportamiento humano ni culturas concretas más allá de lo descrito en su perfil.
- La valoración es orientativa y no sustituye la evaluación del profesorado.
- Laboratorio de logística: tarifas, distancias, plazos, frecuencias y tipos son inventados y redondos; no hay recargos (combustible, BAF, temporada alta), tipo de cambio, demoras de contenedor ni restricciones de mercancía peligrosa. Las rutas son didácticas: en una operación real hay que confirmar servicios y salidas con transitarios. El reparto de los conceptos que la tabla de Incoterms no detalla (terminales, gastos en destino) es una simplificación y en la práctica se pacta por escrito.
- Las rutas de casos inexistentes muestran la página 404 pero responden con código 200, como el resto del proyecto, por el `app/loading.tsx` global.

## Pruebas
`tests/learning-export.test.ts`, `learning-negotiation.test.ts`, `learning-logistics.test.ts` (peso tasable, W/M, contenedores, camiones, conceptos sin duplicar, reparto por Incoterm, aranceles e impuestos, métricas y margen, aplicabilidad de reglas marítimas, mejor ruta, justificación, incidencias, sesión y evaluación; 4 mutaciones comprobadas en rojo), `learning-integrity.test.ts`, `learning-order.test.ts`: fórmulas, reparto por Incoterm, itinerario adaptativo, incidencias, motor del comprador, evaluación, integridad de datos, ausencia de red y de azar, y que las pantallas usen el orden mezclado. 14 mutaciones comprobadas en rojo. Comprobación en navegador (Playwright contra `next start`): los dos módulos completos de principio a fin, recarga a mitad de caso, progreso en la portada, sin errores de consola, sin peticiones externas y sin desbordamiento a 390 px.
