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
- **Almacén** [S]: 600 palés. Un mozo hace **250 movimientos o 400 líneas por semana**. Por encima de la capacidad, el
  trabajo se retrasa y baja el nivel de servicio.

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
- **La avería cuesta dos veces:** la reparación y el margen perdido al subcontratar (1,05 frente a 0,42 €/km propios).

## 19. Pendiente de verificar antes de usarlo

- **Tiempos de conducción:** texto consolidado vigente del Reglamento (CE) 561/2006 tras el Reglamento (UE) 2020/1054.
- **IPREM diario** para el límite de indemnización de la Ley 15/2009, art. 57.1.
- **Interés de demora** de la Ley 3/2004 (cálculo y tipo vigente).
- **Artículos de la Ley 15/2009 sobre la carta de porte.**
- **Cláusula legal de revisión del precio por el combustible** en el transporte por carretera.
