# SmarTrade Business Simulator — reglas del juego (Fase 0)

Documento de diseño aprobado para construir el simulador. Fecha: 09/11/2026. Es la referencia para programar: si el código
y este documento discrepan, se corrige uno de los dos explicando por qué. Contexto y alternativas descartadas en
`ESTUDIO_ESTRATEGICO_BUSINESS_SIMULATOR.md` (fuera del repositorio, 09/11/2026).

**Marcas:** **[N]** norma comprobada en fuente primaria (con referencia) · **[S]** parámetro de diseño simulado, no tarifa
real · **[V]** pendiente de verificar antes de usarlo en el juego.

## 1. Decisiones del dueño (09/11/2026)

- **Público:** el propio dueño, alumno del primer curso del Grado Superior de Comercio Internacional (familia Comercio y
  Marketing). El primer curso incluye los módulos de logística: 0622 Transporte internacional de mercancías, 0623 Gestión
  económica y financiera de la empresa, 0625 Logística de almacenamiento y 0627 Gestión administrativa del comercio
  internacional (Orden EFD/659/2024, anexo XVI; ver `docs/curriculo.md`). Sin modo de clase ni exportación para profesor.
- **Azar con semilla:** cada partida tiene una semilla que fija todo lo ajeno al jugador. Misma semilla y mismas
  decisiones → mismo resultado. La regla del proyecto pasa de «sin azar» a «sin azar no reproducible».
- **26 semanas por turnos.**
- **Sin prototipo en hoja de cálculo:** el prototipo se construye en la app, empezando por una porción jugable (§17).
- **Módulo independiente** (`lib/sim`, `components/sim`, `app/simulador`): no modifica los casos actuales.

## 2. Qué es el juego

Diriges **Transportes y Almacenes del Turia, S.L. (ficticia)**, un operador logístico de Valencia que empieza con un
camión, un almacén alquilado, un conductor y un mozo. Durante 26 semanas aceptas trabajos, organizas la capacidad,
cobras y pagas. Ganas si llegas al final con la empresa sana; pierdes si te quedas sin caja o sin clientes.

Lo que se aprende **jugando**, no leyendo: que facturar no es cobrar, que la capacidad es limitada (camión, horas de
conducción, personal, palés), que crecer puede costar dinero, y qué responsabilidades tiene un transportista cuando algo
sale mal.

## 3. Principios de diseño

1. **Reglas puras y separadas de la interfaz.** El turno es una función: `(estado, acciones, semilla) → (estado nuevo, sucesos)`.
2. **Determinista con semilla.** Nada de `Math.random` ni de la hora del sistema dentro del motor.
3. **Invariantes contables en cada turno:** la caja es la suma de sus movimientos; activo = pasivo + patrimonio neto.
4. **Normativa solo con fuente primaria leída.** Lo no verificado no se presenta como norma: o se marca «verificar» o no
   entra en el juego.
5. **Todo dato inventado, etiquetado** como simulado (`lib/learning/provenance.ts`).
6. **Pocas mecánicas, bien hechas.** Una mecánica entra si obliga a aplicar un conocimiento del currículo.

## 4. Calendario y bucle de juego

- **Turno = 1 semana** (5 días laborables). **Mes de juego = 4 semanas** (simplificación declarada: nóminas, alquiler e
  informes cada 4 semanas). 26 semanas = 6 meses y 2 semanas.
- **Orden de un turno:**
  1. **Lunes, informe:** caja, cobros y pagos de la semana, ocupación, nivel de servicio, avisos.
  2. **Decisiones:** aceptar o rechazar ofertas, subcontratar, contratar o despedir temporales, financiación (desde la
     fase 3), responder a incidencias pendientes.
  3. **Resolución día a día (lunes a viernes):** las operaciones consumen capacidad del camión, horas de conducción y
     horas del almacén. Si ocurre una incidencia **que exige decisión**, la semana se detiene y se muestra la tarjeta; al
     responder, continúa. Las demás se resuelven solas y van al informe.
  4. **Cierre:** devengo de ingresos y costes, vencimientos de cobros y pagos, indicadores, reputación.
  5. **Cada 4 semanas:** informe mensual con cuenta de resultados, tesorería e indicadores, y una pregunta breve sobre los
     números de la propia empresa (no bloquea el juego).
- **Guardado automático** al cerrar cada semana; se puede salir y continuar.

## 5. Estado de la partida

| Entidad | Contenido |
|---|---|
| Partida | Versión del motor, semilla, semana actual, registro de acciones, sucesos ocurridos |
| Empresa | Nombre, etapa, reputación (nivel de servicio), objetivos |
| Tesorería | Saldo; movimientos (fecha, concepto, importe); póliza de crédito (fase 3) |
| Cuentas a cobrar y a pagar | Cada factura con importe, fecha, vencimiento pactado, estado (pendiente, cobrada o pagada, en mora, impagada) |
| Flota | Camión: capacidad de carga, km de la semana, estado (operativo, en taller), km acumulados y próximo mantenimiento, valor contable |
| Conductores | Horas de conducción del día, de la semana y de las dos últimas semanas |
| Almacén | Capacidad en palés, palés ocupados por cliente, movimientos y líneas de la semana |
| Personal de almacén | Fijos y temporales; productividad (movimientos o líneas por semana); bajas |
| Clientes | Perfil ficticio: sector, volumen, sensibilidad al precio, comportamiento de pago (puntual, se retrasa, riesgo de impago), satisfacción |
| Contratos | Tipo, cliente, duración, volumen semanal, tarifa, plazo de pago, penalizaciones, estado |
| Mercado | Índice de tarifas, estacionalidad, precio del gasóleo |
| Aprendizaje | Por acción: competencias (códigos de resultados de aprendizaje), calificación si la hay, consecuencia |

## 6. Acciones del jugador (lista cerrada)

| Acción | Fase | Competencia que ejercita |
|---|---|---|
| Aceptar o rechazar una oferta (puntual o recurrente) | 1 | 0622 RA1-RA3 (modos, rutas, costes); 0623 RA7 (rentabilidad) |
| Proponer otra tarifa o plazo de pago al aceptar | 2 | 0622 RA3; negociación |
| Subcontratar un servicio a otro transportista | 2 | 0622 RA1 y RA6 |
| Contratar o despedir un mozo temporal | 2 | 0625 RA2 y RA6 (organización y personal del almacén) |
| Programar el mantenimiento del camión | 2 | 0622 RA4 (integridad del servicio) |
| Responder a una incidencia | 1 | Según la incidencia (§10) |
| Disponer o devolver la póliza de crédito; renting de un segundo camión | 3 | 0623 RA3 y RA4 (financiación y activos) |
| Cerrar la semana | 1 | — |

## 7. Tipos de operación

| Tipo | Cómo se factura [S] | Qué consume | Fase |
|---|---|---|---|
| **Distribución regional** (contrato recurrente: X km por semana durante N semanas) | €/km | Km y horas de conducción del camión | 1 |
| **Servicio puntual** (un viaje cerrado) | Precio cerrado | Km, horas; un día concreto | 1 |
| **Almacenaje** | €/palé/semana | Palés de capacidad | 1 |
| **Movimientos y preparación de pedidos** | €/movimiento y €/línea | Horas de mozo | 2 |
| **Servicio subcontratado** | Lo que pague el cliente; coste del subcontratista | Nada propio; margen menor | 2 |

## 8. Capacidad

- **Camión rígido** [S]: hasta 18 palés o 12 t por viaje.
- **Horas de conducción** [N] (Reglamento (CE) 561/2006, arts. 6 y 7; texto de legislation.gov.uk a 31/01/2020 [V],
  falta comprobar el consolidado vigente tras el Reglamento (UE) 2020/1054):
  - máximo 9 h diarias (10 h no más de dos veces por semana);
  - 56 h semanales y 90 h en dos semanas consecutivas;
  - pausa de 45 minutos tras 4 h 30 min de conducción.
- **En el juego** [S]:
  - En distribución regional con paradas, un día normal son unas **4 h 30 min de conducción**, unos 210 km, y el resto de
    la jornada son carga, descarga y esperas.
  - Capacidad normal: **1.050 km/semana**. Se pueden hacer días largos, dentro de los límites anteriores, que cuestan
    horas extra (+40 %).
  - Pasar de los límites legales no es una opción del juego: se presenta como incidencia con su consecuencia (§10).
- **Almacén** [S]: 600 palés. Un mozo hace **400 movimientos o 1.000 líneas por semana** desde las reglas v6. El diseño
  inicial decía 250 y 400, pero con esas cifras un mozo no atendía ni la mitad del almacén (§17 nonies). Por encima de la
  capacidad, horas extra hasta un 20 % más; lo demás no se hace y baja el nivel de servicio.

## 9. Economía

### 9.1 Reglas contables (motor)

- **Devengo:** el ingreso se reconoce la semana en que se presta el servicio y el coste, la semana en que se consume.
- **Caja:** cada factura se cobra o se paga en su vencimiento, salvo que la semilla y el perfil del cliente digan que se
  retrasa o no paga.
- **Inversión frente a gasto:** comprar un vehículo es activo y se amortiza; el renting es gasto (fase 3).
- **Indicadores:** resultado, resultado de explotación antes de amortizaciones, coste e ingreso por km, ocupación del camión
  y del almacén, productividad, nivel de servicio, periodo medio de cobro y de pago, fondo de maniobra.
- **Impuestos:** el MVP no modela el IVA ni el impuesto de sociedades, y lo dice en pantalla. Se puede añadir en fase 3
  como efecto de caja trimestral.

### 9.2 Plazos de cobro y pago [N]

- **Transporte:** quien paga el transporte **incurre en mora a los 30 días** (Ley 15/2009, art. 41.1). El pacto en
  contrario es nulo si es abusivo para el transportista (art. 41.3). En el juego, el transporte se factura **a 30 días**;
  un cliente que paga más tarde es un moroso.
- **Resto de servicios (almacén):** 30 días si no se pacta otro plazo y **nunca más de 60 días** por pacto (Ley 3/2004,
  art. 4.1 y 4.3). Si un cliente pide 90 días, aceptarlo es contrario a la ley (incidencia, §10).
- **Corrección respecto al estudio estratégico:** su ejemplo usaba cobros de transporte a 60 días. Con la Ley 15/2009,
  lo normal son 30 días.

### 9.3 Parámetros iniciales [S]

Hipotéticos, para equilibrar el juego; no son tarifas de mercado.

| Concepto | Valor |
|---|---|
| Caja inicial | 40.000 € |
| Fianza del almacén (semana 1) | 4.000 € |
| Camión rígido propio | Valor contable 48.000 €; amortización 200 €/semana |
| Alquiler del almacén con oficina | 2.000 € cada 4 semanas |
| Conductor (coste empresa) | 2.600 € cada 4 semanas |
| Mozo fijo (coste empresa) | 2.150 € cada 4 semanas |
| Gerente (el jugador) | 1.800 € cada 4 semanas |
| Seguro del camión y responsabilidad civil | 300 € cada 4 semanas |
| Gestoría, software, teléfono y suministros | 900 € cada 4 semanas |
| **Fijos con salida de caja** | **9.750 € cada 4 semanas (2.437,50 €/semana devengados)** |
| Coste variable del camión | 0,42 €/km (gasóleo 0,30 + mantenimiento y neumáticos 0,08 + peajes 0,04); el gasóleo varía con el índice del mercado |
| Tarifa de referencia | 1,20 €/km (índice de mercado 1,00) |
| Almacén | 1,50 €/palé/semana; 2,50 €/movimiento; 0,60 €/línea |
| Subcontratista | 1,05 €/km, pagado a 30 días |
| Mozo temporal | 560 €/semana |
| Avería: reparación | 400–900 € según la semilla; 1–3 días sin camión |

### 9.4 Lo que la economía debe cumplir

Lo comprobarán las pruebas de equilibrio (§15):

- **Rentable, pero ajustada:** con camión y almacén casi llenos, el resultado ronda el equilibrio. Mejorar exige elegir
  contratos, tarifas y plazos, no solo aceptar más.
- **Crecer no siempre compensa:** con estos parámetros, un segundo camión de renting (325 €/semana) con conductor (650 €)
  a 1,20 €/km pierde unos 156 €/semana: (325 + 650) / 1.050 km + 0,42 ≈ **1,35 €/km** es su punto de equilibrio. Solo compensa con mejores tarifas o con menos kilómetros en vacío. (El estudio estratégico daba 1,31 €/km porque usaba 4.400 km al mes.) Es una decisión
  estratégica real.
- **La caja manda:** se puede quebrar con la cuenta de resultados en positivo.
- **El dinero no compra capacidad al instante:** contratar, alquilar o subcontratar tiene plazos y costes.

## 10. Incidencias

Cada incidencia es una plantilla con disparador (semilla y estado), tarjeta, opciones calificadas (adecuada 10,
razonable 6, error importante 0, como en los casos actuales) y consecuencias.

| # | Incidencia | Regla que enseña | Fuente | Fase |
|---|---|---|---|---|
| 1 | **Avería del camión** | Plan de contingencia: subcontratar, retrasar o avisar al cliente | Supuesto | 1 |
| 2 | **Cliente que paga tarde** | Mora a los 30 días en transporte; reclamar, recargo de intereses de demora o cortar el servicio | [N] Ley 15/2009, art. 41; Ley 3/2004 [V: interés de demora aplicable] | 1 |
| 3 | **Mercancía dañada en la entrega** | El destinatario deja reservas por escrito en la entrega (7 días si el daño no es aparente). El transportista responde de las averías desde la recepción hasta la entrega, con un límite de indemnización por kilo | [N] Ley 15/2009, arts. 47, 57.1 y 60.1. El valor del IPREM diario para calcular el límite [V] | 2 |
| 4 | **Retraso en la entrega** | La indemnización por retraso no supera el precio del transporte; requiere reservas escritas en 21 días | [N] Ley 15/2009, arts. 57.2 y 60.3 | 2 |
| 5 | **Almacén saturado** | Capacidad y productividad: temporal, horas extra o rechazar | Supuesto | 2 |
| 6 | **Baja de un mozo** | Sustitución y coste; nivel de servicio | Supuesto (sin detalles de Seguridad Social) | 2 |
| 7 | **Subida del gasóleo** | Coste variable, cláusula de revisión de precios | Supuesto [V: cláusula legal de revisión por combustible] | 2 |
| 8 | **Un cliente pide pagar a 90 días** | Límite legal de 60 días; plazo de 30 en transporte | [N] Ley 3/2004, art. 4.3; Ley 15/2009, art. 41 | 2 |
| 9 | **Te piden un viaje que obliga a pasar del límite de conducción** | Límites de conducción y pausas: aceptar es ilegal; replanificar o subcontratar | [N] Reglamento (CE) 561/2006, arts. 6 y 7 [V: consolidado vigente] | 2 |
| 10 | **Error en la carta de porte** | Datos de la carta de porte y su valor como prueba | [V] Ley 15/2009 (artículos de la carta de porte, pendientes de leer) | 3 |

## 11. Clientes y mercado

- **Generador de ofertas:** cada semana, entre 3 y 6 ofertas a partir de la semilla, la estacionalidad, la reputación y el
  índice de tarifas. Cada oferta trae cliente, tipo, volumen, tarifa propuesta, plazo de pago y perfil de pago.
- **Perfiles de pago** [S]: puntual (85 %), se retrasa entre 1 y 3 semanas (12 %), riesgo de impago (3 %). El perfil se
  insinúa en la oferta (sector, antigüedad), sin revelarse del todo.
- **Reputación** (nivel de servicio en las últimas 8 semanas): por encima del 95 % mejoran las ofertas; por debajo del
  85 % se pierden contratos recurrentes.
- **Estacionalidad** [S]: más demanda en las semanas 10–14 (campaña) y menos en las 20–22.

## 12. Objetivos, victoria y derrota

- **Victoria (semana 26):** cumplir 2 de 3 objetivos: caja positiva sin usar la póliza, ocupación media del almacén
  ≥ 70 % y nivel de servicio ≥ 95 %.
- **Derrota:**
  - caja negativa dos semanas seguidas, o por encima del límite de la póliza cuando exista;
  - o nivel de servicio por debajo del 80 % cuatro semanas seguidas.
- **Resumen final:** tres resultados separados, como en los casos actuales:
  - **nota de decisiones** (incidencias y ofertas calificadas);
  - **resultado empresarial** (indicadores);
  - **mapa de competencias** (resultados de aprendizaje practicados).

## 13. Azar con semilla: cómo se implementa

- **Generador pseudoaleatorio con semilla** (función pura, sin dependencias).
- **Una secuencia independiente por sistema y semana** (ofertas, incidencias, pagos, mercado), derivada de
  `semilla + semana + sistema`. Así, una decisión del jugador no desplaza los sorteos de otros sistemas: si rechazas una
  oferta, la avería de la semana 7 no cambia por eso.
- **Lo que el jugador decide nunca se sortea.**
- **La semilla se puede elegir** («partida 48213») para rejugar exactamente la misma partida con otra estrategia.

## 14. Guardado

- **Se guarda la semilla y el registro de acciones** (no el estado). El estado se reconstruye reproduciendo las acciones;
  así una partida es siempre reproducible y auditable.
- **Versión del motor** en la partida.
  - Si cambian las reglas, la partida antigua se reproduce con aviso de que el resultado puede variar.
  - Si cambia la forma de las acciones, se migra; nunca se descarta en silencio, a diferencia de lo que hacen hoy las
    sesiones de los casos.
- **`localStorage`** por comodidad, más **exportar e importar la partida en un archivo** para no perderla al borrar el
  navegador.

## 15. Pruebas de equilibrio y de motor

- **Invariantes en cada turno de cada partida simulada:** cuadre de caja, balance y no negatividad de las capacidades.
- **Estrategias automáticas, 500 semillas cada una:**

  | Estrategia | Comportamiento | Debe ocurrir |
  |---|---|---|
  | No hacer nada | Ninguna acción | Quiebra en el 100 % |
  | Codiciosa | Acepta todo | Quiebra o pierde clientes en más del 50 % |
  | Prudente | Solo contratos con margen positivo y capacidad | Gana en más del 60 %, sin llegar al 100 % |
  | Aleatoria | Decide al azar (con semilla) | Resultados dispersos |

- **Ninguna estrategia simple gana en el 100 % de las semillas.**
- **Reproducibilidad:** misma semilla y mismas acciones dan un estado idéntico, comparado byte a byte.
- **Normativa:** una prueba por regla [N] (plazo de mora, límite de 60 días, límites de conducción).

## 16. Arquitectura y reutilización

```
lib/sim/
  params.ts        parámetros [S] versionados y etiquetados
  model.ts         tipos del estado y de las acciones
  rng.ts           generador con semilla y secuencias por sistema
  engine/          turno, economía, operaciones, almacén, mercado, incidencias, progreso, aprendizaje
  save.ts          semilla + acciones, versión, migraciones, exportar/importar
  balance/         estrategias automáticas para las pruebas
components/sim/    pantallas, sin reglas
app/simulador/     rutas
```

- **Reutilizar tal cual:** `lib/learning/money.ts`, `order.ts`, `provenance.ts`, los componentes `GradeBadge`,
  `SimulatedNotice` y `StageProgress`.
- **Más adelante:** `lib/learning/logistics/capacity.ts` (paletización y contenedores), `lib/logistics/incoterms.ts` y
  los casos actuales como contratos especiales (fase 4).
- **No importar** los motores de exportación, importación o negociación: son árboles de decisiones, no simulaciones.
- **Las pruebas existentes** (`tests/learning-integrity.test.ts`) siguen prohibiendo `Math.random` y la red en
  `lib/learning`; el simulador tendrá las mismas comprobaciones.

## 17. Fase 1: porción jugable

| Incluye | Queda fuera de la fase 1 |
|---|---|
| Semanas 1–6, con resumen al final | Semanas 7–26, victoria y derrota completas |
| Un camión con capacidad semanal en km | Horas de conducción detalladas por día |
| Almacén solo con almacenaje (palés) | Movimientos, preparación de pedidos y personal variable |
| Ofertas de distribución regional, servicio puntual y almacenaje | Subcontratación, renegociación |
| Tesorería con cobros a 30 días, fijos cada 4 semanas, informe del mes | Póliza, renting |
| 2 incidencias: avería y cliente que paga tarde | El resto |
| Semilla, guardado como acciones, exportar e importar | — |
| Pruebas: invariantes, reproducibilidad, estrategias «no hacer nada» y «codiciosa» | Equilibrio completo |
| 3 pantallas: semana (panel con ofertas), finanzas, informe | Resto |

**Criterio de aceptación:**
- El dueño juega las 6 semanas y decide si el bucle merece completarse.
- Las pruebas pasan y la caja cuadra siempre.

## 17 bis. Fase 1: estado (09/11/2026)

Construida en `lib/sim` (motor), `components/sim` y `/simulador`. Pruebas en `tests/sim.test.ts`.

**Ajustes de equilibrio, medidos con las estrategias automáticas** (resultados de 500 semillas):

| Ajuste | Por qué | Efecto medido |
|---|---|---|
| Almacenaje a **2,40–3,40 €/palé/semana con manipulación incluida** (en lugar de 1,50 €) | Sin cobrar movimientos ni preparación (fase 2), la empresa perdía unos 870 €/semana aun llena: no había forma de jugar bien | El resultado semanal de la estrategia prudente mejora de −1.604 € (semana 1) a −497 € (semana 6) |
| **Un contrato incumplido sin avisar se cancela** desde la semana siguiente | Aceptar por encima de la capacidad no costaba nada más que no facturar: la estrategia de aceptarlo todo ganaba (−5.035 € frente a −6.326 €) con un 42 % de servicio | — |
| **Reputación** (adelantada de la fase 2, §11): por debajo del 90 % de servicio, una oferta menos y tarifas un 5 % más bajas; por debajo del 75 %, dos ofertas menos y un 10 % más bajas | Lo anterior no bastaba: aceptarlo todo seguía ganando (−5.517 € frente a −5.972 €) | La prudente gana a la de aceptarlo todo en 461 de 500 partidas (−5.972 € frente a −7.660 € de media); la otra se queda en un 64 % de servicio |
| Plazos mostrados como **30 y 60 días** (4 y 8 semanas) | «28 días» contradecía la mora a los 30 días que enseña la incidencia | — |

**Resultado de la fase 1:** en 6 semanas ninguna estrategia llega a beneficios (la mejor partida prudente termina en −2.476 €). Es coherente con una empresa que empieza: la tendencia es lo que se valora. El cuadre contable dio 0 de diferencia en todas las partidas simuladas.

## 17 ter. Temporada completa, calculadora y reputación (09/11/2026, tras jugar el dueño la fase 1)

**Lo que pidió el dueño:**
- seguir jugando después de la semana 6;
- una calculadora;
- saber si sirven las referencias de los clientes y si la empresa tiene puntuación de confianza.

**Cambios:**
- **26 semanas.** Estacionalidad: una oferta más en las semanas 10–14 y una menos en las 20–22. Una avería por tramo: semanas 2–5, 10–13 y 18–21.
- **Las semanas 1–6 no cambian:** la primera avería usa el mismo sorteo e identificador, y el resto de efectos empieza en la semana 7. Las partidas de la fase 1 continúan en la semana 7; está comprobado con partidas generadas por el motor anterior.
- **Desde la semana 7:**
  - el mercado conoce a la empresa y llega una oferta más por semana;
  - con un servicio del 95 % o más, los clientes pagan una **prima de fiabilidad del 20 %**;
  - por debajo del 90 % o del 75 % se mantienen las penalizaciones de §17 bis.
  - La reputación (nivel de servicio de las últimas 8 semanas) se explica en pantalla junto a las ofertas.
- **Objetivos (revisión de §12):** se gana con beneficio en las últimas 8 semanas y, además, servicio ≥ 95 % u ocupación ≥ 70 %. El objetivo anterior, «caja positiva», se cumplía solo con el capital inicial: la estrategia prudente «ganaba» 499 de 500 temporadas perdiendo unos 20.000 €.
- **Derrota por servicio:** por debajo del 80 % cuatro semanas seguidas.
- **Referencias de los clientes:**
  - la de terceros es fija por cliente durante toda la partida (antes podía cambiar de una oferta a otra);
  - cuando ya hay facturas vencidas o cobradas, la oferta muestra tu propio historial de cobros.
- **Calculadora básica** (`lib/sim/calc.ts`, sin `eval`) con tus costes de referencia.

**Por qué la prima de fiabilidad.** Medido con 200 semillas: con 3–5 ofertas por semana y las tarifas iniciales, ni eligiendo siempre las mejores ofertas era rentable una sola temporada (1 de 200). La causa es de escala: un solo camión con gerente y gestoría apenas cubre gastos aun al 100 %. Crecer (segundo camión, renting, personal) llega en fases posteriores. El 20 % es una **decisión de diseño**, no una medición del mercado.

**Resultado (500 semillas):**

| Estrategia | Victorias | Quiebras |
|---|---|---|
| Selectiva (elige por margen) | 230 | 0 |
| Prudente | 169 | 0 |
| Aceptarlo todo | 0 | 500 (servicio) |
| No hacer nada | 0 | 500 (caja) |

## 17 quater. Negociación, documentación y beneficio frente a tesorería (09/11/2026, petición del dueño)

**Beneficio y tesorería, separados en todas las vistas.** La cabecera, el resumen de la semana y la pestaña de finanzas
distinguen:
- **lo ganado** (devengo: facturado − gastos);
- **lo cobrado y pagado** (caja al empezar + cobros − pagos = caja al cerrar), con su tabla de tesorería por conceptos.

**Negociación** (`lib/sim/deal.ts`):
- Cada oferta se puede aceptar tal cual o negociar: tarifa, duración y, en almacenaje, plazo de pago (30 o 60 días).
- En el transporte el plazo no se negocia: mora a los 30 días, Ley 15/2009, art. 41.
- **El cliente tiene un límite oculto** por oferta, fijado por la semilla: paga hasta un 0–18 % más y acepta como mucho 0–4 semanas más de duración.
- Si pides dentro del límite, acepta. Si pides hasta un 4 % por encima, hace una contraoferta (dos rondas como máximo). Si pides más, se va con otro transportista.
- Cobrar a 30 días en vez de 60 le cuesta al cliente: lo compensa pagando un 4 % menos.
- Todos los porcentajes son **decisiones de diseño**. Primero se probó con un margen de rechazo del 12 %, pero entonces pedir siempre un 12 % más no tenía riesgo (la estrategia negociadora ganaba 357 de 500 temporadas). Con el 4 %, la negociadora gana 268 de 500 frente a 230 de la selectiva: negociar compensa, pero tiene riesgo.

**Documentación de cada operación** (al aceptarla):
- **Transporte:**
  - documento de control del envío, obligatorio a bordo (Orden FOM/2861/2012, arts. 1, 3, 8 y 9), o una carta de porte que lo incluya (art. 2.2; Ley 15/2009, art. 10);
  - recibo de entrega (Ley 15/2009, art. 12);
  - el CMR (internacional) y el DUA no corresponden.
- **Almacenaje:** albarán de entrada con recuento y estado, condiciones por escrito y registro de existencias. Son **buena práctica**: no se ha verificado una obligación legal concreta.
- **Consecuencias de lo que falta**, una vez por contrato y según la semilla (12 % semanal):
  - inspección en carretera con sanción de 400 € (importe **simulado**: la sanción real depende del régimen sancionador del transporte, no verificado);
  - reclamación de palés de 300 € (simulado).

**Compatibilidad:**
- Las aceptaciones guardadas sin documentación (partidas anteriores) no se califican ni se penalizan.
- La negociación usa sorteos propios.
- Comprobado: 21 partidas generadas por el motor publicado se reproducen idénticas.

**Pendiente de verificar:**
- La Orden TRM/282/2026 modificó en marzo de 2026 la Orden FOM/2861/2012. Solo se ha leído su efecto sobre el art. 7, y una fuente secundaria habla de documento de control electrónico.
- El importe real de las sanciones.

## 17 quinquies. Viajes puntuales con carga de retorno y versiones de reglas (09/11/2026)

**Problema (observado por el dueño jugando):** los viajes puntuales eran «ruido». Medido en 300 partidas, con las reglas v1 solo el 23 % cubría el coste completo del camión, y eso contando la prima de reputación desde la semana 7. Sin esa prima era cerca del 5 %. Casi nunca eran una decisión real.

**Corrección (reglas v2, solo para partidas nuevas):**
- Precio por km de ida entre 1,60 y 3,20 €, es decir, 0,80–1,60 €/km recorrido contando la vuelta.
- En un 40 % de los viajes, el cliente ofrece una **carga de retorno** que paga 0,50–1,00 € por km de vuelta. Al aceptar decides si la traes. Si la dejas pasar, la corrección lo señala: la vuelta se hace igual.

**Resultado medido (300 partidas):**
- El 60 % de los viajes cubre el coste completo (74 % contando la carga de retorno) y ninguno queda por debajo del variable.
- Victorias: prudente 123, selectiva 154 y negociadora 182 (con v1: 105, 139 y 160). Aceptarlo todo y no hacer nada siguen sin ganar nunca.

**Versiones de reglas:**
- `ENGINE_VERSION` = 2. Una partida guardada guarda su versión y se reproduce siempre con ella: tu partida v1 sigue con las reglas v1.
- La v1 genera exactamente las mismas ofertas que antes. Comprobado con 28 partidas generadas por el motor publicado, idénticas incluso en los textos de corrección.

**Fallo corregido en producción:**
- **Qué pasaba:** el guardado no reconocía la acción de negociar, así que una partida en la que se había negociado no se podía cargar y aparecía la pantalla de inicio.
- **Datos:** la partida seguía en el navegador mientras no se empezara otra.
- **Corrección y prueba:** el guardado reconoce ahora la acción y valida sus campos. Una prueba guarda y recupera partidas completas con negociación, documentación y carga de retorno.

## 17 sexies. Herramientas para crecer (10/11/2026, petición del dueño)

**Problema:** con un camión y 600 palés la empresa no podía crecer. Lo que no cabía se rechazaba y la única palanca era elegir y negociar bien.

**Qué se añade.** Cuatro decisiones, cada una una sola vez por partida; las cifras son [S] (`GROWTH` en `lib/sim/params.ts`):
- **Subcontratar al aceptar** un transporte. No ocupa tu camión. El subcontratista cobra 1,40 €/km a 30 días y falla un 3 % de las semanas: ese servicio no se hace y respondes tú ante el cliente [N]. La Ley 15/2009, art. 6.1, dice: «El porteador que contrate con el cargador responderá frente a éste de la realización íntegra del transporte […] aún cuando no la lleve a cabo por sí mismo». Comprobado en el BOE el 10/11/2026. Tus colaboradores tienen como mucho un camión libre: 1.050 km por semana.
- **Segundo camión** desde la semana siguiente: el doble de km.
  - En renting: 1.500 € al mes con seguro y mantenimiento.
  - Comprado: 48.000 € de golpe, que van al activo y se amortizan a 200 € por semana, más 300 € de seguro al mes.
  - Los dos llevan otro conductor (2.600 € al mes).
- **Ampliar el almacén** (nave contigua) desde la semana siguiente: 400 palés más, 1.200 € de alquiler y un mozo más (2.150 €) al mes, y dos mensualidades de fianza [N]. Lo fija la LAU, art. 36.1: «de dos en el arrendamiento para uso distinto del de vivienda». Comprobado en el BOE el 10/11/2026. La ocupación del objetivo se mide sobre los palés que tengas cada semana.
- **Póliza de crédito.** Límite de 20.000 €, comisión de apertura del 0,5 % e interés del 7 % anual sobre lo dispuesto. Con póliza, la quiebra llega cuando la caja pasa del límite dos semanas seguidas, no al bajar de cero.

**Cómo se califican.** Al decidir, con los números de ese momento:
- Segundo camión y nave: «correcta» si lo comprometido en las 4 semanas siguientes llega al 85 % de la capacidad; si no, «razonable» (creces antes de necesitarlo). Comprar el camión dejando menos de 5.000 € de colchón (caja más póliza) es «grave».
- Póliza: «correcta» con menos de 15.000 € en caja o tras invertir; si no, «razonable».
- Subcontratar:
  - Con margen negativo, «grave».
  - Si tenías camión libre, «razonable»: hacerlo tú costaba 0,42 €/km.
  - Con un margen de menos de 0,10 €/km, «razonable».
- Competencias: 0623-RA3 (financiación de inversiones) y RA4 (compra o alquiler de activos), 0623-RA7 y 0625-RA3 (presupuesto del almacén).

**Decisión de equilibrio: reglas v3 (solo partidas nuevas).** Medido con una estrategia automática nueva, «crecedora», en 300 partidas:
- **Con el precio de avería de siempre (1,05 €/km) y sin límite:** subcontratar ganaba 299 de 300 temporadas. Ese precio está por debajo del coste completo de un camión propio (1,30 €/km), así que subcontratar salía más barato que tener camión.
- **Corrección:** el subcontratista cobra 1,40 €/km (su coste completo más su margen), también en las averías desde la v3, y tiene el tope de un camión.
- Las partidas v1 y v2 guardadas conservan los 1,05 €/km en las averías: comprobado con 120 partidas generadas por el motor publicado, idénticas en semanas, contratos, movimientos de caja y correcciones.

**Resultado medido (300 partidas, reglas v3):**
- Victorias: prudente 120, selectiva 160, negociadora 186 y crecedora 234. Con el motor publicado (v2), las tres primeras ganan hoy 125, 166 y 191; la diferencia es el precio de la subcontratación en las averías.
- Por herramientas, la crecedora gana 196 sin subcontratar y 231 solo subcontratando. Subcontratar es lo que más aporta. Cuando el segundo camión se pone, mejora el resultado frente a la negociadora en 7.500 € de media (44 de 44 partidas). La nave queda casi neutra: hay que llenarla.
- Ninguna quiebra y el balance cuadra en cada paso.

## 17 septies. Reclamaciones con base legal (10/11/2026, reglas v4)

**Problema:** las incidencias eran solo la avería del camión y el cliente moroso, y la documentación tenía una sola consecuencia, una sanción al azar. El recibo de entrega no servía para nada en el juego.

**Qué se añade.** Tres reclamaciones, como mucho una de cada por temporada (`lib/sim/claims.ts`). La semilla elige la semana dentro de su ventana; si ese día no hay un contrato al que afecte, la reclamación espera a la primera semana en que lo haya. Normativa leída en el BOE el 10/11/2026 [N]:
- **Mercancía dañada** (semanas 6–17): Ley 15/2009, arts. 47, 57.1, 60.1 y 61.
  - Con reservas escritas al entregar, respondes hasta el límite legal de un tercio del IPREM/día por kilo.
  - Si la reclamación llega pasados 7 días sin reservas, se presume que entregaste bien. Rechazarla es lo correcto si tienes el **recibo de entrega firmado** (art. 12); sin él, pierdes en la Junta Arbitral.
  - Pagar todo lo que pide el cliente nunca es lo correcto: por encima del límite solo se responde si se declaró el valor (art. 61).
- **Retraso** (semanas 12–21): arts. 48.1, 56, 57.2 y 60.3.
  - Se paga el perjuicio, como mucho el precio del transporte.
  - Si la causa era evitable (no planificaste el descanso del conductor), negarse acaba en laudo y pierdes al cliente.
  - Si no lo era (un corte de carretera por el accidente de otro), no respondes.
- **Cliente que quiere pagar a 90 días** al prorrogar un almacenaje (semanas 8–22): Ley 3/2004, art. 4.3, que fija un máximo de 60 días por pacto.
  - Aceptar 90 días es «grave».
  - Proponer 60 es lo correcto. El cliente lo acepta en un 70 % de los casos [S].

**Lo no comprobado:**
- El IPREM de 2026 (600 €/mes) solo lo dan fuentes secundarias, por la prórroga de los Presupuestos; está marcado así en el juego.
- Kilos, valores, costas y probabilidades son [S].

**Versiones:** reglas v4 solo para partidas nuevas. 216 partidas v1, v2 y v3 generadas por el motor publicado se reproducen idénticas.

**Resultado medido (300 partidas, v4):**
- Victorias: prudente 119, selectiva 158, negociadora 185 y crecedora 236. Con la v3 eran 120, 160, 186 y 234: responder bien apenas cuesta, porque lo correcto suele ser pagar dentro del límite.
- La avería y el retraso aparecen en todas las temporadas; el plazo de 90 días, en un 91–93 %.
- La codiciosa, que paga todo lo que le reclaman y no documenta, sigue sin ganar nunca.

## 17 octies. Viajes internacionales por carretera (10/11/2026, reglas v5)

**Problema:** el simulador era solo nacional, en un ciclo de Comercio Internacional. Los casos prácticos ya enseñan CMR, aduanas e Incoterms, pero no desde el lado del transportista.

**Qué se añade (`lib/sim/international.ts`).**
- **Las ofertas.** Desde la semana 5, la mitad de las semanas llega como mucho una oferta de camión completo desde Valencia a Toulouse, Marsella, Lyon (Francia) u Oporto (Portugal). Sale de su propia secuencia de azar, así que las demás ofertas no cambian.
- **Capacidad.** El viaje ocupa días enteros de camión: ida y vuelta a unos 600 km al día, más un día de carga y descarga. Son 4 o 5 días, es decir, casi toda la semana del camión, en competencia con el reparto regional.
- **Coste real del viaje.**
  - Gasóleo y mantenimiento por km.
  - Peajes extranjeros (150–330 € por viaje) [S].
  - Dietas del conductor de 90 € por día [S].
  - La calificación compara el precio con ese coste directo y con el coste completo, que añade 185 € por día de conductor, seguro y amortización.
- **Carga de retorno** en la mitad de los viajes.
- **No se puede subcontratar:** tus colaboradores son nacionales.
- **Negociación:** como un viaje puntual, solo el precio.
- **Reclamaciones de la v4:** no le afectan, porque se rigen por la Ley 15/2009 y este contrato por el CMR.
- **Documentación** [N]. Comprobado el 10/11/2026:
  - Convenio CMR (BOE-A-1974-753): art. 1, se aplica si la carga y la entrega están en dos países; art. 4, la carta de porte prueba el contrato; art. 5, tres originales.
  - Orden FOM/2861/2012, art. 2.2: la carta de porte internacional sirve como documento de control si lleva sus datos.
  - Reglamento (CE) 1072/2009, art. 4: copia certificada de la licencia comunitaria en cada vehículo. Leído en el texto que conserva legislation.gov.uk, porque EUR-Lex no se dejó descargar; hay que confirmarlo en EUR-Lex.
  - El DUA sobra: Francia y Portugal están en la UE.
  - Sin licencia es «grave»: en un 30 % de los viajes hay control con inmovilización y multa de 1.500 € [S].

**Decisiones:**
- **Marruecos fuera:** su régimen de autorizaciones (bilaterales) no está verificado.
- **Reputación:** si es floja, la oferta internacional es la primera que deja de llegar. Es consecuencia de cómo se recortan las ofertas, pero tiene sentido: el cliente internacional exige fiabilidad.

**Versiones:** reglas v5 solo para partidas nuevas. 240 partidas v1–v4 generadas por el motor publicado se reproducen idénticas.

**Resultado medido (300 partidas):**
- Victorias: selectiva 166 (antes 158), negociadora 187 (185) y crecedora 240 (236). Prudente, 119, sin cambios: nunca tiene el camión libre para un viaje así.
- Las estrategias que eligen por margen hacen entre 0,5 y 0,8 viajes internacionales por temporada. Compiten con el reparto: no siempre compensa.
- Ninguna quiebra y el balance cuadra en cada paso.

## 17 nonies. Almacén a fondo (10/11/2026, reglas v6; módulo 0625)

**Problema:** el almacén era solo sitio: palés por semana, con la manipulación incluida en el precio. No había personal que gestionar, ni stocks, ni devoluciones. El módulo 0625 (130 h) estaba casi sin cubrir.

**Qué se añade (`lib/sim/warehouse.ts`, cifras [S] en `WAREHOUSE_V6`).**
- **Movimientos y preparación de pedidos (RA2-RA3).**
  - Cada almacenaje se cobra en tres partes: el sitio (€/palé/semana), los movimientos (€ por entrada o salida de un palé) y las líneas de pedido preparadas (€/línea).
  - El trabajo consume personal: un mozo hace 400 movimientos o 1.000 líneas por semana.
  - Lo que pasa de su capacidad se cubre con horas extra, un 40 % más caras y como mucho un 20 % más. El resto se queda sin hacer: no se cobra y baja el servicio.
  - §8 decía 250 movimientos y 400 líneas. Con esas cifras un mozo no atendía ni la mitad del almacén, así que se revisaron como decisión de diseño.
- **Organizar el almacén (RA2).**
  - Mozo temporal de ETT: 4 semanas a 650 €/semana. Cuesta más que uno de plantilla, pero solo mientras lo necesitas. Es «correcto» cuando ni con horas extra llegarías.
  - Reorganización por rotación (ABC): 900 € una vez, y el personal rinde un 15 % más.
- **Punto de pedido (RA4).** Un cliente te encarga la reposición de un producto. Hay que calcular punto de pedido = demanda diaria × plazo + stock de seguridad.
  - Olvidar el stock de seguridad trae una rotura de stock (400 €).
  - Confundir días con semanas trae sobrestock (300 €).
- **Devoluciones (RA5)** [N]. Las devoluciones son del cliente. Lo correcto es recibirlas en una zona separada, clasificarlas como servicio cobrado (8 €/palé) y entregar lo roto a un gestor autorizado (3 €/palé).
  - Ley 7/2022, art. 20.1: tratamiento por gestor autorizado, acreditado documentalmente. Art. 21.a: zona habilitada e identificada. Art. 8: jerarquía de residuos. Comprobado en el BOE el 10/11/2026.
  - Guardarlas sin más ocupa sitio 4 semanas sin cobrar.
  - Tirar lo roto al contenedor es «grave»: multa simulada de 1.500 €.

**Equilibrio.** Tarifa del sitio: 1,45–2,15 €/palé/semana. Con ella, el almacén factura lo mismo que en la v5 (1.488 € por semana frente a 1.481 €, estrategia selectiva, 100 partidas). Las dos primeras pruebas, medidas, se quedaron cortas:

| Tarifa del sitio | Almacén frente a la v5 | Victorias de la selectiva (300 partidas) |
|---|---|---|
| 1,10–1,80 € | 170 €/semana menos | 31 |
| 1,30–2,00 € | 70 €/semana menos | 95 |

**Resultado medido (300 partidas, v6):**
- Victorias: prudente 92 (v5: 119), selectiva 140 (166), negociadora 155 (187) y crecedora 218 (240). Ninguna quiebra; el balance cuadra en cada paso.
- El resultado semanal casi no cambia (−365 € frente a −352 € en la selectiva). Las victorias bajan más porque ganar exige beneficio en las últimas 8 semanas, que amplifica diferencias pequeñas, y porque las horas extra y los temporales cuestan.
- Se acepta como mayor dificultad del almacén, no como un error.

**Versiones:** reglas v6 solo para partidas nuevas. 240 partidas v1–v5 generadas por el motor publicado se reproducen idénticas.

## 17 decies. Auditoría del 11/11/2026 y reglas v7

**Cómo se auditó:**
- batería completa;
- 840 partidas con decisiones al azar en las 7 versiones (unas 52.000 acciones), comprobando en cada paso el cuadre, la caja, el resultado, que no haya NaN, el determinismo y el guardado: **sin ningún fallo**;
- 80 páginas recorridas en el navegador;
- revisión del código y de la documentación.

**Fallo corregido en las reglas v7 (solo partidas nuevas).** La prima y las rebajas por reputación escalaban el precio principal, pero no la carga de retorno (desde la v2) ni la manipulación del almacén (v6). Por ejemplo, un viaje pasaba de 430 € a 516 € con la prima, y su retorno se quedaba en 157 €. Además, desde la v6 negociar el almacén solo subía el sitio, casi la mitad de su precio.

En la v7:
- la reputación escala todo el precio;
- negociar la tarifa del palé arrastra en la misma proporción movimientos y líneas;
- el sitio vuelve a 1,30–2,00 €/palé para que el almacén siga facturando como en la v5 (1.480,80 € frente a 1.481 € por semana, selectiva, 100 partidas). Con 1,45–2,15 facturaba 76 € más.

**Resultado medido (300 partidas, v7):**

| Estrategia | v5 | v6 | v7 |
|---|---|---|---|
| Prudente | 119 | 92 | 109 |
| Selectiva | 166 | 140 | 152 |
| Negociadora | 187 | 155 | 178 |
| Crecedora | 240 | 218 | 234 |

Ninguna quiebra. Negociar vuelve a compensar frente a solo elegir bien.

**Otras correcciones:**
- El informe final ponía nombre a 7 de las 18 competencias que se registran; ahora a todas (`lib/sim/competences.ts`), y una prueba lo vigila.
- El mozo temporal ya no cuenta como 0625-RA6, que `docs/curriculo.md` da por no cubierto; cuenta como RA2-RA3. Es el único cambio en partidas v6 guardadas: 252 partidas v1–v6 del motor publicado son idénticas salvo esa etiqueta.

**Corregido después, el mismo día:**
- **Devoluciones guardadas (reglas v8).** Las que se guardan sin cobrar se marcan `held`: siguen ocupando sitio y pueden desplazar palés que pagan, pero no cuentan para el objetivo de ocupación. Si no caben, no fallan el servicio ni producen el aviso «el cliente cancela».
  - El equilibrio no cambia: ninguna estrategia automática las guarda.
  - 252 partidas v1–v7 del motor publicado se reproducen idénticas.
- **404 de verdad.** Se quitó el `app/loading.tsx` general: el esqueleto de carga queda solo en `/mercados`, `/comparar` y la ficha de oportunidad.
  - Los casos prácticos se generan al construir (`dynamicParams = false`): un caso inexistente da 404.
  - La ficha valida el identificador antes de cargar.
  - Queda un resto: una ficha con formato válido pero sin datos (`150920-ZZ-2024`) sigue mostrando «no encontrada» con 200 y `noindex`, porque solo se sabe al consultar.

## 18. Ejemplo comentado: primeras 3 semanas [S]

Ilustra la economía completa: incluye movimientos de almacén y subcontratación, que llegan en la fase 2.

| Semana | Actividad | Ingresos devengados | Costes variables | Resultado (con 2.437,50 de fijos y 200 de amortización) | Caja al cierre |
|---|---|---|---|---|---|
| 1 | Distribución 700 km (840 €); almacén 150 palés (225 €) y 60 movimientos (150 €) | 1.215,00 € | 294,00 € | −1.716,50 € | 40.000 − 4.000 de fianza − 294 = **35.706,00 €** |
| 2 | Distribución 900 km (1.080 €); almacén 200 palés (300 €) y 90 movimientos (225 €) | 1.605,00 € | 378,00 € | −1.410,50 € | **35.328,00 €** |
| 3 | **Avería** (650 €, 2 días sin camión): 630 km propios (756 €) y 270 km subcontratados (324 € facturados, 283,50 € de coste); almacén 250 palés (375 €) y 110 movimientos (275 €) | 1.730,00 € | 264,60 + 283,50 + 650 = 1.198,10 € | −2.105,60 € | 35.328 − 264,60 − 650 = **34.413,40 €** (el subcontratista se paga a 30 días) |

**Qué ve el jugador:**
- **Nada se ha cobrado todavía:** las facturas de la semana 1 vencen en la semana 5.
- **La caja todavía parece cómoda** porque el alquiler y las nóminas se pagan al final de la semana 4: 9.750 € de golpe.
  Si en la semana 5 un cliente se retrasa, el margen es estrecho.
- **La avería cuesta dos veces:** la reparación y el margen perdido al subcontratar (1,05 frente a 0,42 €/km propios; 1,40 €/km desde las reglas v3, §17 sexies).

## 19. Pendiente de verificar antes de usarlo

Actualizado el 11/11/2026. Ya comprobado en el BOE (no se repite aquí): Ley 15/2009 (arts. 2, 5, 6, 10-12, 15, 41, 47, 48, 56-62), Ley 3/2004 (art. 4), Orden FOM/2861/2012, Convenio CMR, LAU (art. 36), Ley 7/2022 (arts. 8, 20, 21).

- **Tiempos de conducción:** texto consolidado vigente del Reglamento (CE) 561/2006 tras el Reglamento (UE) 2020/1054.
- **IPREM 2026** (600 €/mes en fuentes secundarias, por la prórroga de los Presupuestos) para el límite de la Ley 15/2009, art. 57.1.
- **Reglamento (CE) 1072/2009, art. 4** (copia certificada de la licencia comunitaria): leído en legislation.gov.uk; falta EUR-Lex.
- **Autorizaciones de transporte con Marruecos**, antes de añadirlo como destino.
- **Importes de las sanciones** (documento de control, licencia, residuos): son simulados.
- **Interés de demora** de la Ley 3/2004 (cálculo y tipo vigente).
- **Cláusula legal de revisión del precio por el combustible** en el transporte por carretera.
