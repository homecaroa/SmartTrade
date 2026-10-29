# Modo Aprendizaje

Simulador educativo para el Grado Superior de Comercio Internacional, en `/aprendizaje`. Es **independiente** del análisis de mercados: rutas, componentes y lógica propios (`app/aprendizaje`, `components/learning`, `lib/learning`). No toca la API, el modelo estadístico ni los rankings, y **no hace ninguna llamada de red** (ni Gemini ni ninguna otra API): todo son escenarios locales y reglas deterministas.

## Módulos y casos
| Módulo | Caso | Dificultad | Qué se practica |
|---|---|---|---|
| Exportación | Aceite de oliva a Múnich (HS 150920, DE) | básica | Venta intracomunitaria: Incoterm multimodal, VIES, IVA exento, CMR como prueba de salida. Sin aduana. |
| Exportación | Vino a Yokohama (HS 220421, JP) | media | Tercer país: CIP para contenedor, cobro documentario, DUA, origen preferencial, coherencia documental. |
| Negociación | Aceite para un distribuidor mexicano (MX) | media | Punto de retirada, aplazamiento con seguro de crédito, exclusividad a cambio de volumen. |
| Negociación | Calzado para una cadena británica (GB) | avanzada | Plazo y garantías por encima del precio; DDP inviable sin registro de IVA. |

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
- Las rutas de casos inexistentes muestran la página 404 pero responden con código 200, como el resto del proyecto, por el `app/loading.tsx` global.

## Pruebas
`tests/learning-export.test.ts`, `learning-negotiation.test.ts`, `learning-integrity.test.ts`, `learning-order.test.ts`: fórmulas, reparto por Incoterm, itinerario adaptativo, incidencias, motor del comprador, evaluación, integridad de datos, ausencia de red y de azar, y que las pantallas usen el orden mezclado. 14 mutaciones comprobadas en rojo. Comprobación en navegador (Playwright contra `next start`): los dos módulos completos de principio a fin, recarga a mitad de caso, progreso en la portada, sin errores de consola, sin peticiones externas y sin desbordamiento a 390 px.
