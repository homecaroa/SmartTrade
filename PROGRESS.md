# PROGRESS — SmarTrade

## Estado real de la integración de datos
| Fuente | Estado |
|---|---|
| DEMO (sintético) | Funciona; siempre etiquetado. |
| Eurostat Comext | **Verificado de principio a fin con datos reales** (18/10/2026): `verify:comext` y la app en modo `comext` con `220421, 150920` → 49 oportunidades válidas, 1 incompleta. Los códigos HS6 siguen la nomenclatura de cada año (150910 no existe desde HS2022). Pendiente: más productos, indicadores de estado. Grecia corregida el 30/10/2026 (Comext usa `GR`). |
| UN Comtrade | Opcional, sin clave ni llamadas reales. |

## Business Simulator: Fase 0 aprobada (09/11/2026)
Reglas del juego en `docs/simulador.md`: operador logístico ficticio de Valencia, 26 semanas por turnos, azar con semilla, módulo independiente (`lib/sim`). Público: el dueño, alumno de 1.º de Comercio Internacional (módulos 0622, 0623, 0625 y 0627). Normativa leída en el BOE: plazo de mora de 30 días en el transporte (Ley 15/2009, art. 41), máximo de 60 días por pacto (Ley 3/2004, art. 4), responsabilidad y reservas del transportista (Ley 15/2009, arts. 47, 57 y 60); tiempos de conducción del Reglamento (CE) 561/2006 a 31/01/2020 (consolidado pendiente). **Fase 1 jugable** (`/simulador`): 6 semanas con camión, almacén, 3 tipos de oferta, cobros a 30 y 60 días, fijos cada 4 semanas, avería y cliente moroso, reputación, informe del mes y resumen con competencias; guardado como semilla + acciones y exportación a archivo. Equilibrio ajustado con estrategias automáticas (docs/simulador.md §17 bis). Tras jugarla el dueño: **temporada completa de 26 semanas**, calculadora, reputación visible con prima de fiabilidad, historial propio de cada cliente y objetivos que exigen beneficio al final (docs/simulador.md §17 ter). Después: **negociación** de cada oferta (tarifa, duración, plazo en almacenaje) contra un límite oculto del cliente, **documentación** de cada operación (documento de control o carta de porte, recibo de entrega; albarán en almacén) con consecuencias, y **beneficio y tesorería separados** en todas las vistas (§17 quater). Viajes puntuales con precios realistas y **carga de retorno** (reglas v2, solo partidas nuevas; las guardadas se reproducen con su versión) y corrección de un fallo que impedía cargar partidas con negociación (§17 quinquies).

**Herramientas para crecer** (10/11/2026, §17 sexies): subcontratar al aceptar (1,40 €/km, tope de un camión, falla un 3 % de las semanas), segundo camión en renting o comprado, nave contigua de 400 palés y póliza de crédito de 20.000 €. Reglas v3 solo para partidas nuevas: el subcontratista de avería pasa de 1,05 a 1,40 €/km. Las partidas v1 y v2 guardadas se reproducen idénticas: comprobado con 120. Victorias en 300 partidas: crecedora 234, negociadora 186. Normativa comprobada en el BOE: Ley 15/2009, art. 6.1 (respondes de lo subcontratado), y LAU, art. 36.1 (fianza de dos meses).

**Reclamaciones con base legal** (10/11/2026, reglas v4, §17 septies): mercancía dañada, en la que el recibo de entrega firmado decide (Ley 15/2009, arts. 47, 57, 60 y 61); retraso, que cuesta como mucho el precio del transporte salvo causa inevitable (arts. 48, 56 y 57.2); y un cliente que pide pagar a 90 días (Ley 3/2004, art. 4.3: máximo 60). Las partidas v1, v2 y v3 guardadas se reproducen idénticas: comprobado con 216. El IPREM de 2026 no está comprobado en el BOE.

**Viajes internacionales** (10/11/2026, reglas v5, §17 octies): camión completo a Francia y Portugal. Ocupa días de camión y paga peajes extranjeros y dietas. La documentación es el CMR con los datos del documento de control y la copia certificada de la licencia comunitaria (Convenio CMR, arts. 1, 4 y 5; Orden FOM/2861/2012, art. 2.2; Reglamento 1072/2009, art. 4, leído en legislation.gov.uk). Las partidas v1–v4 guardadas se reproducen idénticas: comprobado con 240. Marruecos queda fuera, sin verificar.

**Almacén a fondo** (10/11/2026, reglas v6, §17 nonies):
- Movimientos y líneas de pedido cobrados aparte, con la capacidad del mozo, horas extra, temporales y reorganización ABC.
- Una decisión de punto de pedido.
- Devoluciones con la Ley 7/2022, arts. 8, 20 y 21, comprobada en el BOE.
- Las partidas v1–v5 guardadas se reproducen idénticas: comprobado con 240.
- Victorias algo más bajas que en la v5, documentado.

**Auditoría completa** (11/11/2026, `docs/simulador.md` §17 decies):
- Sin fallos de cálculo ni de guardado en 840 partidas aleatorias.
- Corregido en reglas v7: la reputación no escalaba la carga de retorno ni la manipulación del almacén, y negociar el almacén solo subía el sitio.
- Corregido: el informe final dejaba 11 competencias sin nombre.
- `HANDOFF.md` reescrito con el estado real; README y `docs/testing.md` puestos al día.
- Después: reglas v8 (las devoluciones guardadas no cuentan como ocupación) y 404 de verdad en casos inexistentes y fichas mal formadas, al quitar el `app/loading.tsx` general.

**Interfaz del simulador** (11/11/2026, petición del dueño; `docs/simulador.md` §17 undecies):
- Resumen fijo de capacidad y botón para volver a ella.
- Barras en azul, verde y violeta, y en rojo si se pasan del límite.
- Efecto de cada oferta en tu capacidad.
- Aviso de tesorería y previsión a 4 semanas.
- Resultado por línea de negocio (transporte, almacén, estructura) con el coste de la capacidad sin usar, en el cierre de semana y en Finanzas.
- Bandeja de correos sin IA (§17 duodecies). Clientes con persona propia; los internacionales escriben en inglés. Cada correo tiene una ficha de datos preparada para la IA futura.
- Incidencias en los repartos (17/11/2026, reglas v9, §17 terdecies): destinatario ausente, espera para descargar, peso sospechoso, mala estiba, bultos que no coinciden y cambio de destino. Base: Ley 15/2009, arts. 20, 21, 22, 26, 29, 36 y 47, comprobados en el BOE.
- Preguntas mensuales (17/11/2026): cinco al cerrar cada mes, unas 30 por temporada. Dos con tus números y tres de concepto, de un banco de 25. Next actualizado a 16.4.6 por seguridad: el build se negaba a compilar con 16.4.2.

**Campaña, segunda entrega** (23/11/2026, `docs/simulador-campana.md` §4 bis): niveles 4 (contratación: Estatuto de los Trabajadores, Orden de cotización 2026 y salario mínimo leídos en el BOE), 5 (negociación de un acuerdo marco por paquetes, con alternativa) y 6 (calidad: prevención, incidencias de la Ley 15/2009 y auditorías). Dibujo de la empresa y las 11 animaciones con interruptor. Cuatro rutas distintas completan los seis niveles; las 384 campañas guardadas se reproducen idénticas.

**Campaña por niveles, primera entrega** (23/11/2026, `docs/simulador-campana.md`): nuevo modo principal tipo *tycoon* con misiones (18 niveles en 5 actos, aprobados por el dueño) y motor nuevo (`lib/sim/campaign`). Empresa persistente entre niveles, estrellas de gestión y dominio de aprendizaje por separado, Manual, «qué habría pasado si», mejoras en la sede y socio de rescate. Niveles 1–3: operación (precio, volumen, capacidad), construcción (nave, fianza, obra) y tesorería (Ley 3/2004 comprobada en el BOE). Cada nivel con al menos dos estrategias válidas medidas. `/simulador` es el menú; la Temporada pasa a `/simulador/temporada` con la misma partida guardada. Temporada y Carrera intactas (650 partidas idénticas).

**Carrera, fase B2** (22/11/2026, reglas v12, `docs/simulador-carrera.md` §1 ter): gasóleo variable (índice semanal sembrado) y revisión del precio según la Ley 15/2009, art. 38 vigente (automática desde el 5 %, al alza y a la baja, desglosada; pacto en contrario nulo). Una decisión por contrato de distribución al cruzar el 5 %. La Temporada y las Carreras v10–v11 no cambian (650 partidas idénticas).

**Carrera, fase B1** (21/11/2026, reglas v11, `docs/simulador-carrera.md` §1 bis): de 0 a 3 ofertas por semana, más grandes y largas, con ficha; informe comercial; escandallo obligatorio corregido partida a partida (con el art. 10 bis.1.g de la Ley 15/2009 si el precio no cubre el coste); evaluación de previsto frente a real. Calibrado con estrategias: la crecedora gana 19–34 k€/año y las demás que eligen bien sobreviven 7–8 de 10. La Temporada y las Carreras v10 no cambian (726 partidas idénticas).

**Corrección legal, reglas v10** (21/11/2026, `docs/simulador.md` §17 quattuordecies): la espera para descargar se indemniza pasada la primera hora (Ley 15/2009, art. 22, redacción vigente desde el 02/03/2022). La v9 usaba el texto de 2009 (dos horas). Las partidas v9 conservan su cálculo con el texto corregido. Revisados en el BOE los demás artículos citados: siguen igual.

**Carrera, fase A** (21/11/2026, `docs/simulador-carrera.md`):
- `/simulador/carrera`: 5 años (260 semanas) con el mismo motor. Los sucesos de la temporada se repiten cada semestre con otra semilla; las preguntas de concepto no se repiten dentro de un año. Se guarda aparte de la Temporada.
- «Avanzar hasta la próxima decisión»: se para con incidencia, informe del mes, fin de contrato, aviso de caja o 13 semanas; no arranca sin trabajo comprometido.
- Estados financieros por trimestre y año (resultados con EBITDA, balance reconstruido, flujos de caja), calculados sin guardar nada. Cuadran en todas las semanas.
- Reproducción sin clonar en cada acción: cargar 5 años pasó de 2,6–4,7 s a 140–200 ms, así que no hacen falta instantáneas. Las preguntas mensuales dejaron de recalcularse en cascada.
- La Temporada no cambia: 783 partidas de `main` (v1–v9) se reproducen con el estado idéntico.
- Medido: con el contenido actual la empresa no crece en 5 años (techo de la Temporada). Lo resuelven las fases B–E. Pendiente del dueño: IVA, detalle del personal y duración.
- Finanzas simplificada (16/11/2026): resumen con cuatro cifras, gráfico de caja frente a beneficio, tablas de 4 semanas y detalle contable plegado.
- Responder en inglés (14/11/2026): tres borradores, uno correcto, uno informal y uno con un error técnico. Se califican y quedan en el informe (0824-RA2).

## Foco en el Modo Aprendizaje (09/11/2026, decisión del dueño)
- **Portada:** `/` es el Modo Aprendizaje; el análisis de mercados pasa a `/mercados`. Las búsquedas antiguas `/?q=…` redirigen (308) con la consulta intacta; `/aprendizaje` → `/`.
- **Currículo oficial leído** (RD 1574/2011, RD 500/2024, Orden EFD/659/2024) y cruzado con los casos: `docs/curriculo.md`. Cobertura alta en Transporte internacional; parcial en Gestión administrativa (solo exportación), Medios de pago, Financiación y Negociación; nula en Marketing, Sistema de información de mercados, Almacenamiento y Comercio digital. Propuesta de huecos ordenada, pendiente de decisión.
- Se borró `components/buyer-card.tsx` (sin uso).
- **Caso de importación** (módulo nuevo `lib/learning/import`, `/aprendizaje/importacion/bicicletas-valencia`): coste puesto en almacén, antidumping, valor en aduana, IVA a la importación, despacho. Normativa leída en BOE y en el texto oficial de los reglamentos de la UE; lo no verificable (tipo antidumping vigente, arancel convencional) se marca «verificar».

## Transformación: diagnóstico descriptivo (06/11/2026, fusionado en #22)
Tras la segunda auditoría independiente. Detalle y porqués en `docs/methodology.md`.
- **Sin puntuación:** se retiran los dos rankings por percentiles (no superaban a reglas triviales en su validación). Indicadores en su unidad, calculados solo con el producto y mercado de cada fila; los mercados se ordenan dentro de un producto por una métrica (valor, crecimiento, volumen, socio España). Ficha nueva por bloques (lectura con plantillas fijas, tamaño, evolución, presencia española, proveedores, el producto en otros mercados), comparación y CSV descriptivos.
- **España = país de expedición** en los mercados de la UE: se avisa en listado, ficha, comparación y CSV.
- **Compradores retirados de la interfaz:** `/compradores` es un aviso estático; `lib/buyers` se conserva.
- **Ventanas 2022/2023:** se unen HS2017→HS2022 para los códigos sin cambios (tabla de la OMA); antes salían vacías.
- **Errores:** código no reconocido por Eurostat (413 `EXTRACTION_TOO_BIG`) → «Revisa el producto»; fallo del proveedor y error interno con mensajes distintos; página fuera de rango explicada.
- **Modo Aprendizaje:** valor en aduana de EE. UU. con base FOB (CBP); capital asegurado = 110 % del precio con transporte hasta destino; CIF con cláusulas (C) y CIP con (A) en prima e incidencias.
- Verificado: 453 pruebas, `tsc`, `next build`, navegador (Playwright contra `next start`, demo y comext con datos guardados, escritorio y 390 px).

## Datos guardados con actualización bimensual (30/10/2026)
La web lee primero `data/snapshots` (Eurostat: 49 códigos, 2022–2025, cargados de verdad) y consulta en vivo solo lo que falte; GitHub Actions los actualiza cada dos meses con un PR. Pendiente: secreto `COMTRADE_API_KEY` y permiso de Actions para crear PRs en GitHub, y la primera carga de Comtrade. Mandarinas corregidas el 30/10/2026: el 080520 se sustituyó por 080521 y 080522 (división de HS2017, no de HS2022: corregido el 06/11/2026); Eurostat recargado; Comtrade de esos dos códigos pendiente de la próxima actualización. Detalle en `docs/data-sources.md`.

## Modo Aprendizaje (29/10/2026, publicado)
Simulador educativo separado del análisis (`/aprendizaje`): exportación (2 casos: intracomunitario y tercer país) y negociación B2B (2 casos), con datos simulados etiquetados, reglas deterministas, evaluación de conocimientos separada de la económica y progreso en el navegador. Detalle, fórmulas y limitaciones en `docs/aprendizaje.md`.

## Logística integrada en las operaciones de exportación (30/10/2026)
El «Laboratorio de logística» publicado ese día (#5) se integró en la exportación por decisión del dueño (un solo tipo de ejercicio): cuatro operaciones completas (Alemania, Marruecos, Japón, EE. UU.), cada una con elección y justificación de ruta, presupuesto por conceptos en rangos y liquidación con el valor central. `/aprendizaje/logistica` redirige a la portada. Las sesiones guardadas de exportación anteriores se descartan (versión 2). Detalle en `docs/aprendizaje.md`.

## Competidores y validación histórica del ranking (02/11/2026)
- **España frente a sus competidores** (ficha de cada oportunidad, `lib/trade/competitors.ts`): cuota, variación de cuota en la ventana y valor unitario de cada proveedor frente al de España. La consulta de proveedores de Comext pide ahora valor y peso (comprobado en vivo). Advertencias: el valor unitario es un indicio, no un precio; dentro de la UE el proveedor es el Estado miembro de expedición (metadata de Eurostat).
- **Backtest del ranking** (`scripts/backtest-ranking.ts`, `docs/backtest-ranking.md`): orígenes 2019–2021, Eurostat, 46 productos. El crecimiento pasado no anticipa el futuro; para el aumento en euros de las ventas españolas, el tamaño solo acierta más que la puntuación; el potencial de cuota anticipa el crecimiento porcentual. Detalle en `docs/methodology.md`.
- **Dos rankings (03/11/2026, decisión del dueño)**: la puntuación única se sustituye por «Mercados grandes» (tamaño, por defecto) y «Potencial de cuota» (expansión). El crecimiento pasado y la exportación quedan como datos informativos. Enlaces antiguos `sort=score/size` → «Mercados grandes»; el CSV pierde la columna `puntuacion`.

## Fuentes externas evaluadas (03/11/2026)
- **Trade Map (ITC):** solo enlace (#10). Empresas de Kompass y D&B con licencia; sin API abierta.
- **Aranceles con la API de la OMC (Timeseries):** NMF a 6 dígitos (con aviso cuando son derechos por unidad) y preferencial para España, en «Acceso al mercado» de mercados fuera de la UE. Necesita `WTO_API_KEY` en el servidor (y en Vercel). Sustituye al intento con WITS (bloqueado por su cortafuegos). Detalle en `docs/data-sources.md`. Primera ficha real en producción (04/11/2026, vino en Canadá): la consulta se hizo pero superó los 8 s; desde el entorno de desarrollo la OMC responde en 1–2 s. Recargar reintenta (los fallos no se guardan en caché). Pendiente menor: países fuera del catálogo salen con el nombre en inglés de Comtrade («New Zealand»).
- **Hecho (04/11/2026):** paso «Cobro, seguro de crédito y financiación» en «Qué falta por comprobar», con enlaces a CESCE, ICO, COFIDES y FIEM.
- **Aprendizaje: divisa de facturación y riesgo de cambio (04/11/2026):** propuesta 1 de 5 aprobadas (1, 2, 3, 4, 9). Casos de Japón y Nueva York: factura en divisa con seguro de cambio, en euros o sin cubrir; tipos simulados. Hecha también la 2: recargos del flete (combustible en todas las rutas, temporada alta en Japón) y pregunta para presupuestar el flete «todo incluido». Hecha la 3: variantes A–D por caso con incidencias de viaje (daño, retraso, retirada tardía), elegibles antes de empezar o por enlace. Hecha la 4: caso de perfumes a Dubái como mercancía peligrosa (UN 1266, clase 3) y recargo de mercancía peligrosa en el motor logístico. Completada la 4 con el caso de baterías de litio a México (UN 3480, clase 9). Hecha la 9: repaso de dos preguntas al cerrar cada etapa, puntuado aparte. Las cinco propuestas aprobadas (1, 2, 3, 4 y 9) están terminadas.
- **Subcategorías NC8, solo UE (04/11/2026):** 15 códigos de 8 dígitos (Rioja, Navarra, Penedés, Valdepeñas, Valencia, otras DOP, Cava, naranjas navel/blancas/otras, eléctricos nuevos/usados). Ribera del Duero por separado y «SUV» no existen en la estadística. Fuera de la UE se usa el HS6. Ver `docs/data-sources.md` § Clasificación.
- **Contexto del país (04/11/2026):** Eurostat para la UE y OCDE Economic Outlook (con previsiones) para EE. UU., Reino Unido, Suiza, Noruega, Japón, México y Canadá; Marruecos y Emiratos sin datos. Solo informativo, no entra en los rankings. Banco Mundial y FMI descartados (403 / intermitente). Ver `docs/data-sources.md`.
- **Pendiente:** DataComex (API con registro gratuito; falta leer su aviso legal).
- **Descartadas:** TARIC (arancel de entrada en la UE, no el del destino), CIRCE (creación de empresas), CEOE (patronal: no se encontró API ni datos abiertos; no verificado a fondo).

## Añadido el 29/10/2026 (pendiente de la primera ejecución real)
- **Pistas de empresas con IA** (`lib/buyers/ia/`, `npm run buyers:generar`): Gemini sin búsqueda de Google + auditoría que lee cada web. Dos niveles en la web y el CSV: «web verificada» y «pista sin verificar». Detalle, decisiones y riesgos en `docs/buyers.md`. **Falta:** ejecutarlo con una clave real, medir la tasa de verificadas con la lista de vino en Alemania y revisar los términos del EEE.

## Completado
- MVP completo en modo demo (buscador, ranking explicable, filtros, detalle, gráficos, trazabilidad, CSV, errores/carga/vacío, caché, avisos).
- Comext: manejo de respuesta asíncrona (reintentos) y de consultas vacías («No results»), errores con la etiqueta de Eurostat, supuestos centralizados en `COMEXT` (`lib/sources/comext.ts`).
- Comtrade: troceo de consultas, límite `maxrecords`, rechazo de respuestas truncadas, clave por cabecera (o query opcional), nunca en errores.
- `verify:comext` y `verify:comtrade`: diagnóstico de DNS/red/HTTP/asíncrono/formato, códigos de salida 0/1/2, sin secretos.
- Calidad de datos: validación de esquema de entrada (negativos descartados), año posterior al último año completo rechazado, casos límite probados.
- Renombrado a SmarTrade.

## Pruebas (ejecutadas)
- `npm test`: 9 archivos, 94/94 correctas · `typecheck` y `build` sin errores.
- App compilada en modo demo: `/` → 200; `/api/opportunities` → 76 oportunidades válidas.
- `verify:comext` y `verify:comtrade` sin red → «DNS: no se resuelve el host» (diagnóstico correcto). `verify:comext` contra servidor simulado → códigos 0/1/2 según el caso (en `tests/comext-adapter.test.ts`).
- Detalle en `docs/testing.md`. Los servidores/fixtures de Comext son **simulados**.

## Bloqueos reales
1. Mi entorno de desarrollo no tiene red: las comprobaciones reales las ejecuta el usuario en su PC.
2. Alerta de GitGuardian (19/10/2026) sobre el repo `homecaroa/SmartTrade`: pendiente de revisar qué archivo marca (probable falso positivo en claves ficticias de pruebas).
2. UN Comtrade requiere clave propia (opcional).

## Siguiente tarea
1. Revisar la alerta de GitGuardian (archivo marcado; si es un valor de prueba, marcarlo como falso positivo).
2. Ver la web: en local (`npm run dev`) o en Vercel (desplegada en smart-trade-self.vercel.app; `/api/filters` respondía en modo `comext` el 11/11/2026).
3. Ampliar la prueba real a 10+ productos para que la posición exportadora sea informativa; añadir un catálogo de productos o categorías HS2/HS4.
