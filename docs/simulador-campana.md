# Business Simulator · Campaña

Es el modo principal del Business Simulator desde el 23/11/2026. Es una campaña de gestión tipo *tycoon* con misiones: la empresa pasa de un autónomo con una furgoneta a un grupo empresarial en **18 niveles y 5 actos**. Diseño aprobado por el dueño el 23/11/2026, con estas decisiones:

- tipo *tycoon* con misiones y elementos de campaña de estrategia;
- motor nuevo;
- la Carrera, visible desde el principio como modo libre;
- personas con nombre solo en los puestos clave;
- sin IVA.

## 1. Por qué un modo nuevo

Al jugar la Temporada, el dueño la veía repetitiva: casi siempre consistía en calcular viajes y capacidad, y había que dejar pasar muchos trabajos desde el principio.

La campaña cambia el planteamiento:
- cada nivel introduce **una** mecánica;
- las misiones son de **naturaleza distinta**: construir, contratar, negociar, invertir, financiarse, competir, expandirse y operar;
- la empresa **persiste** de un nivel a otro;
- cada nivel admite **varias estrategias válidas**.

## 2. Los tres bucles

1. **Semana** (1–3 minutos): la cartera de clientes trabaja sola y al jugador le llegan 1–3 decisiones con peso. Las decisiones importantes (★) traen una **pista antes** y la **explicación de sus consecuencias después**.
2. **Nivel** (10–20 minutos, 4–8 semanas): un objetivo principal y dos secundarios. Al terminar, un informe con las estrellas, «¿qué habría pasado si…?» para cada decisión importante y como mucho 2–3 preguntas.
3. **Campaña:** la empresa sigue de un nivel a otro: caja, deudas, nave, clientes, reputación, mejoras y **memoria de las decisiones**. Por ejemplo, quien pagó tarde a un proveedor sin pactarlo queda marcado como «mal pagador». Entre niveles está la **sede**, donde se compran mejoras.

## 3. Los 18 niveles

| Acto | Niveles |
|---|---|
| **I. Arranque** | 1 El primer encargo (operación) · 2 Montar la base (construcción) · 3 El cliente que paga tarde (tesorería) · 4 Tu primer equipo (contratación) |
| **II. Consolidación** | 5 El gran cliente (negociación) · 6 Calidad o nada (operaciones) · 7 Llega la competencia · 8 Segundo vehículo (inversión) |
| **III. Crecimiento** | 9 El banco (financiación) · 10 Almacén de verdad · 11 La licitación · 12 Nueva delegación (expansión) |
| **IV. Internacional** | 13 Primera ruta europea · 14 Fuera de la UE (aduanas) · 15 Comprar y vender (comercio por cuenta propia) |
| **V. Grupo empresarial** | 16 Tormenta perfecta (crisis) · 17 Comprar un competidor · 18 El grupo |

Al final, el **Modo libre** (la Carrera).

**Antes de programar** hay que leer en la fuente oficial:
- nivel 4: Estatuto de los Trabajadores, cotizaciones y convenio;
- nivel 14: aduanas fuera de la UE;
- nivel 16: Ley Concursal;
- nivel 18: mercancías peligrosas.

## 4. Primera entrega (23/11/2026): motor y niveles 1–3

**Código:** `lib/sim/campaign/` (independiente del motor de la Temporada y la Carrera, `lib/sim/engine.ts`).

| Archivo | Contenido |
|---|---|
| `model.ts` | Empresa, estado, decisiones y acciones |
| `engine.ts` | Bucle semanal: cartera, capacidad, facturas y cobros, costes, quiebra, cuadre contable. También estrellas, dominio, guardado y «qué habría pasado si» |
| `helpers.ts`, `spot.ts` | Utilidades comunes y encargos urgentes |
| `levels/l1.ts`, `l2.ts`, `l3.ts` | Los tres niveles |
| `upgrades.ts`, `manual.ts` | Mejoras y Manual |
| `strategies.ts` | Estrategias automáticas para comprobar el diseño |

**Interfaz:** `components/sim/campaign/*`, en `/simulador/campana`.

### Los tres niveles

| Nivel | Mecánica nueva | Estrategias válidas | La mala |
|---|---|---|---|
| **1 · El primer encargo** (6 semanas) | Precio, volumen y capacidad: una tarifa por cliente; encargos urgentes si hay capacidad libre; un cliente pide rebaja | Premium (capacidad libre para los urgentes) · equilibrio · volumen | Tarifa económica a todos: no cabe, falla y pierde clientes |
| **2 · Montar la base** (8 semanas) | Elegir nave, pagar la fianza (LAU, art. 36.1), obra con plazo, cómo pagarla, retrasos, trámites y un segundo cliente | Nave urbana al contado · nave compartida renegociando el espacio · polígono a plazos llenándolo con un segundo cliente | Polígono al contado sin caja |
| **3 · El cliente que paga tarde** (8 semanas) | Ciclo de caja, Ley 3/2004 (plazos, mora, 40 €), póliza, pronto pago, adelanto de facturas, subarriendo de espacio | Póliza · cobrar antes · austeridad. En la ruta del polígono con poca caja: póliza (deuda) o socio (capital) | Aceptar 90 días, pagar tarde sin pactar y descontarlo todo: como mucho ★ |

**Normativa comprobada en el BOE:**
- **Ley 3/2004**, leída el 23/11/2026 (texto consolidado, actualización del 01/10/2014):
  - plazo de 30 días, y como mucho 60 por pacto (art. 4);
  - mora automática (art. 5);
  - interés de demora: tipo del BCE + 8 puntos (art. 7; **el tipo de cada semestre no se ha comprobado**, el del juego es simulado);
  - 40 € de costes de cobro (art. 8);
  - nulidad de las cláusulas que excluyan esos intereses o la indemnización (art. 9).
- **LAU, art. 36.1**, comprobado el 10/11/2026: fianza de dos mensualidades.
- **Ley 15/2009, art. 41**, comprobado el 09/11/2026.

Los trámites con el ayuntamiento del nivel 2 son **simulados**: dependen de cada municipio.

### Calibrado con estrategias (12 semillas por combinación)

| Ajuste | Por qué |
|---|---|
| Ahorros iniciales de 15.000 € (no 8.000) | Con 8.000 €, ninguna estrategia razonable superaba el nivel 2: la fianza y la obra se comían la caja mientras los cobros del nivel 1 seguían pendientes |
| Reparto de Bazar de 250 km a 0,85 €/km (no 400 km a 0,75) | No cabía en la furgoneta, y subcontratarlo perdía dinero cada semana |
| Nivel 3: subarriendo de espacio y calendario adelantado (adelanto de facturas en la semana 2, pronto pago en la 3, avería en la 4) | Con el polígono, solo la póliza permitía superarlo: las demás salidas llegaban tarde |
| Nivel 3: la ★★★ también exige no pagar tarde a ningún proveedor; la ★★ pide no pasar de 150 € de coste financiero | Antes, hasta la estrategia mala conseguía tres estrellas |

**Resultado** (comprobado en `tests/campaign.test.ts`):
- cada nivel lo superan al menos dos estrategias distintas con ★★;
- la mala falla en los niveles 1 y 2 y se queda en ★ en el 3.

### Evaluación

- **Estrellas (gestión):** se mide el resultado, no el método.
- **Dominio (aprendizaje):** por competencia del currículo (`lib/sim/competences.ts`). Sale de la calidad de las decisiones y de las preguntas finales, **no del dinero**. Se puede tener tres estrellas y poco dominio, o al revés.
- **«Qué habría pasado si»:** rejuega el nivel cambiando una sola decisión (el motor es determinista). Las acciones que ya no tengan sentido se saltan.

### Rescate y repetición

- **Repetir un nivel:** la empresa vuelve a como estaba al empezarlo.
- **Socio:** si al empezar un nivel la caja baja de 3.000 €, puede entrar un socio que aporta 10.000 € a cambio del 20 % de la empresa (financiarse con capital).
- **Para pasar de nivel hay que superar el anterior.**

## 4 bis. Segunda entrega (23/11/2026): niveles 4–6, dibujos y animaciones

### Niveles nuevos

| Nivel | Mecánica nueva | Estrategias válidas | La mala |
|---|---|---|---|
| **4 · Tu primer equipo** (contratación) | Plantilla con personas con nombre (puestos clave), coste para la empresa con cotizaciones, periodo de prueba, horas extra y temporal para un pico. Clientes nuevos que llegan por tu reputación y llenan el segundo turno | Conductora con experiencia · junior indefinido con formación · junior temporal con horas extra | No contratar a nadie |
| **5 · El gran cliente** (negociación) | Acuerdo marco negociado por paquetes: precio, plazo, penalización, exclusividad y volumen garantizado. Una alternativa a la vista. Decidir la capacidad al firmar (subcontratar, espacio externo o renegociar). Lo firmado se cumple después: penalizaciones, recorte de pedidos, exclusividad sin clientes nuevos | Paquete equilibrado · concesiones cruzadas · irse a la alternativa | Aceptar su primera oferta: se califica como error grave y nunca consigue ★★★, aunque con capacidad de sobra puede superar el nivel |
| **6 · Calidad o nada** (operaciones) | Prevención (formación, procedimiento de entrega, revisión, seguro), incidencias reales de reparto con la Ley 15/2009 vigente y auditorías en las semanas 4 y 8 | Prevención completa · selectiva · asegurar y responder bien | No prevenir y responder mal |

**Normativa leída en el BOE el 23/11/2026, texto literal:**
- **Estatuto de los Trabajadores** (consolidado, actualización del 18/11/2026):
  - art. 14.1: periodo de prueba;
  - art. 15.2: contrato por circunstancias de la producción, 6 meses (y 90 días al año para situaciones ocasionales);
  - art. 34.1: jornada;
  - art. 35.2: 80 horas extra al año;
  - art. 49.1.c: 12 días al acabar un contrato temporal;
  - art. 53.1.b: 20 días por despido objetivo;
  - art. 56.1: 33 días por despido improcedente.
- **Orden PJC/297/2026** (cotización de la empresa): 23,60 % de contingencias comunes, 5,50 % o 6,70 % de desempleo, 0,20 % de FOGASA, 0,60 % de formación y 0,75 % de MEI (art. 16).
- **Real Decreto 126/2026:** salario mínimo de 1.221 € al mes.

**Lo que no se ha encontrado ni comprobado:**
- No se ha encontrado publicado el **convenio de transporte de mercancías de Valencia**: los sueldos son simulados y quedan por encima del salario mínimo.
- La prima de **accidentes de trabajo** depende de la actividad: el 1,5 % del juego es simulado.

**Calibrado** (estrategias automáticas, 10–12 semillas por combinación):

| Problema medido | Ajuste |
|---|---|
| Al aceptar clientes nuevos con la capacidad prestada del pico (horas extra, temporal), luego se les fallaba | El pico se cubre aparte y no cuenta como capacidad permanente |
| Firmar el acuerdo grande hacía perder dinero a quien tenía la nave urbana: los palés no cabían | Decisión de capacidad al firmar, con almacenaje externo que no ocupa la nave |

**Resultado:**
- Cuatro rutas muy distintas completan los seis niveles en todas las semillas.
- Una ruta que no previene y responde mal falla el nivel 6.

### Dibujos y animaciones (petición del dueño: «dosis de videojuego»)

**Dibujo de la empresa** (`components/sim/campaign/scene.tsx`): la nave que alquilaste (en obras si lo está, con los palés que guardas), tus vehículos y tu plantilla con nombre. Desde el 25/11/2026 (petición del dueño) «Tu empresa» ya no es una pestaña: va dentro de la misión. En escritorio ocupa una columna fija junto a las decisiones, con el dibujo y un resumen (fiabilidad, capacidad, nave, fijos, contratos, lo que te deben y el equipo). En el móvil va arriba. En los dos casos, el detalle de equipo, medios, cuentas y clientes queda en desplegables.

**Las once animaciones de la página de muestras** (`fx.tsx` y `app/globals.css`):

| # | Animación |
|---|---|
| 1 | Estrellas que saltan |
| 2 | Caja y resultado que cuentan, con «+X €» o «−X €» |
| 3 | Confeti al superar un nivel con ★★ o más |
| 4 | Mejoras que aparecen girando con un reflejo |
| 5 | Barras de capacidad que se llenan y parpadean en rojo si te pasas |
| 6 | Furgoneta que cruza al cerrar la semana |
| 7 | Sello sobre la decisión recién tomada |
| 8 | Logros (`achievements.ts`: diez hitos que se calculan del estado, sin guardarse) |
| 9 | El concepto nuevo vuela al Manual |
| 10 | Temblor y destello si la caja baja del límite |
| 11 | Medidor de reputación |

Todas **sin dependencias nuevas**. Hay un interruptor «Animaciones: sí/no», que se recuerda en el navegador, y se respeta la preferencia del sistema de reducir el movimiento.

### Verificación de la segunda entrega

- **Campañas guardadas:** las 384 de la primera entrega (12 combinaciones de rutas en 6 semillas, con y sin socio) se reproducen idénticas. Los campos nuevos (plantilla, subcontratación propia, almacenaje externo) solo aparecen cuando se usan.
- **Pruebas:** 27 en `tests/campaign.test.ts`.
- **Mutaciones:** 15 sobre lo nuevo, todas en rojo. Cuatro estaban huecas en la primera pasada y se reforzaron sus pruebas: el almacén externo dentro de la nave, el seguro que no cubre, la prevención sin efecto y la prevención que el nivel no usa (con una prueba estadística).
- **App:** abierta en escritorio y móvil, con el informe del nivel 5, el nivel 4 a medias y la sede del nivel 6. Sin errores y sin desplazamiento horizontal.

## 4 ter. Tercera entrega (24/11/2026): niveles 7–9

### Niveles nuevos

| Nivel | Mecánica nueva | Estrategias válidas | La mala |
|---|---|---|---|
| **7 · Llega la competencia** (estrategia comercial) | Un rival entra un 15 % más barato. Cada cliente puede irse cada semana, con una probabilidad que sube con la diferencia de precio y baja con la relación y el servicio. El rival va a por tu cliente más grande. Si no le declaras la guerra de precios, sube sus precios en la semana 4 y los clientes perdidos te llaman para volver | Servicio diferenciado · contratos de permanencia con descuento · bajar precios y salir a tiempo | Pactar precios con el rival: se descubre, multa y el nivel no se supera |
| **8 · Segundo vehículo** (inversión) | Dos clientes nuevos que no caben. Furgoneta o camión, al contado, en leasing o en renting, con un conductor con nombre. Se mide el coste por km del vehículo nuevo frente al subcontratista. Hay avería si es tuyo, un posible recorte de un cliente y un tercer cliente que solo llena el camión | Furgoneta en renting · furgoneta en leasing · camión en leasing | Camión al contado sin caja: quiebra |
| **9 · El banco** (financiación) | Una cámara de frío de 45.000 € para un contrato de 3 años. Antes de pedir el préstamo, autónomo o SL (con 1 € o 3.000 € de capital). Después, préstamo fijo o variable, socio, caja o renunciar. El banco pide aval personal o cobra 1,5 puntos más sin él. En la semana 5 sube el Euríbor y en la 6 el cliente paga tarde: pagar la cuota, pedir carencia o impagar | SL y préstamo fijo sin aval · SL y variable con aval · socio | Autónomo, variable e impago de la cuota |

Además, en el nivel 7, si un conductor temporal del nivel 4 termina su contrato, hay que decidir: pasarlo a indefinido o dejar que acabe pagando los 12 días por año. Antes se iba sin avisar y la empresa perdía capacidad (lo destapó el calibrado).

**Motor:**
- Préstamos y leasing (`Company.loans`) con cuota constante cada 4 semanas. Los intereses son gasto financiero y el resto devuelve deuda.
- La deuda entra en el cuadre del balance.
- Vehículos con tipo y forma de pago, permanencia de los contratos (`Deal.lockedUntilAbs`) y forma jurídica (`Company.legal`).
- Todos los campos son opcionales y solo aparecen cuando se usan.

**Normativa leída en el BOE el 24/11/2026, texto literal:**
- **Ley 15/2007, de Defensa de la Competencia** (actualización del 28/12/2023):
  - art. 1.1 a) y c): prohibidos los acuerdos para fijar precios y repartirse el mercado;
  - art. 63.1.c: infracciones muy graves, multa de hasta el 10 % del volumen de negocios. La multa del juego (4.000 €) es simulada.
- **Ley 3/1991, de Competencia Desleal** (actualización del 27/12/2025):
  - art. 17.1: la fijación de precios es libre;
  - art. 17.2: casos en que la venta bajo coste es desleal; el c) es eliminar a un competidor.
- **Plan General de Contabilidad**, norma de registro y valoración 8.ª (actualización del 21/12/2024):
  - 1.2: el leasing financiero se registra como activo y pasivo por el mismo importe;
  - 2: las cuotas del arrendamiento operativo son gasto del ejercicio.
- **Ley de Sociedades de Capital** (actualización del 03/01/2025):
  - art. 1.2: los socios de la SL no responden personalmente de las deudas sociales;
  - art. 4: capital mínimo de 1 €; por debajo de 3.000 €, reserva legal del 20 % y responsabilidad solidaria de la diferencia.

**No comprobado:**
- **Código Civil, art. 1911** (responsabilidad con todos los bienes): no se pudo leer en el BOE, así que no se cita. Del autónomo solo se dice que no tiene la separación del art. 1.2 de la Ley de Sociedades de Capital.
- Precios, tipos, el umbral del banco (3 veces el EBITDA), la caja mínima de la ★★ del nivel 9 (5.000 €) y el socio son simulados o decisiones documentadas.

**Calibrado** (estrategias automáticas en 3 rutas de los niveles 1–6 y 12 semillas):

| Problema medido | Ajuste |
|---|---|
| Nivel 8: la ★★★ («resultado ≥ 2.000 €») se cumplía siempre (resultado entre 4.300 y 7.600 €) | ★★★ = vehículo nuevo a 0,80 €/km o menos, sacado de lo medido: la furgoneta en renting sale entre 0,77 y 0,86 €/km, y el camión lleno entre 0,67 y 0,81 €/km |
| Nivel 9: las empresas llegaban con 10.000–23.000 € de caja y una deuda de 0,4–0,7 veces el EBITDA, así que una cámara de 20.000 € se pagaba con la caja sin decidir nada | Cámara de 45.000 €; aval personal o tipo más alto; ★★ con caja mínima |
| Nivel 8: renting o leasing quebraban en la ruta con menos caja, porque se subcontrataba al tercer cliente perdiendo 0,03 €/km y pagando cada semana lo que se cobraba a 30 días. La explicación decía «ganas poco» | Explicación corregida (pierdes en cada km) y aviso de caja en la pista |

**Resultado medido** (36 partidas por estrategia en el nivel 7 y unas 30 en los niveles 8 y 9):

| Nivel | Estrategia | Resultado |
|---|---|---|
| 7 | Servicio | 24 superan, con ★★★ en 22 |
| 7 | Contratos | 24 superan |
| 7 | Guerra de precios | 28 superan, pero ganando de media 78 € frente a 775 y 2.171 € |
| 7 | Pacto | 0 superan |
| 8 | Renting y leasing | todas con ★★ o más |
| 8 | Camión | 3 quiebran (es su riesgo) |
| 8 | La mala | quiebra siempre |
| 9 | Fijo y socio | ★★★ |
| 9 | Variable con aval | ★★ |
| 9 | La mala | no lo supera |

**Pendiente, anterior a esta entrega:**
- El temporal del pico del nivel 4 se va sin cobrar los 12 días por año del art. 49.1.c. Son unos 90 €. Corregirlo cambiaría las campañas guardadas, así que queda anotado.
- Dos clientes nuevos pueden salir con el mismo nombre ficticio.

### Verificación de la tercera entrega

- **Campañas guardadas:** se reproducen idénticas las 784 guardadas con el motor anterior: las 384 de la primera entrega y 400 nuevas de seis niveles.
- **Pruebas:** 40 en `tests/campaign.test.ts`; 660 en total.
- **Mutaciones:** 16 sobre lo nuevo. Dos estaban huecas:
  - los intereses fuera del gasto: la prueba se conformaba con el gasto de la póliza;
  - rechazar a los clientes nuevos: la condición era redundante y se quitó.

  Las pruebas también cazaron dos fallos: la multa del cártel se cargaba una semana tarde, y `round2` convertía un 8,5 % en un 9 %.
- **App:** abierta en escritorio y móvil con el nivel 7, el 8 a medias y el final del 9. Se ven el camión y la segunda furgoneta, los préstamos, la SL y «qué habría pasado si» con las decisiones nuevas. Sin errores y sin desplazamiento horizontal.

## 4 quater. Reglas 2 (24/11/2026): menos rechazos, más oficio

**Problema medido** (pedido por el dueño, «se vuelve monótono»): en 12 campañas completas con las reglas 1, la mitad de las semanas (402 de 808) solo traían encargos urgentes o clientes nuevos, y el 84 % de esas decisiones (859 de 1.023) eran ofertas que no cabían: la única respuesta era rechazar.

**Opciones presentadas y elegidas por el dueño:**
- **A** (más opciones al coger trabajo) y **B** (lo que no cabe no interrumpe): ahora.
- **C** (mazo de eventos variados): después.
- Además: más aprendizaje de los módulos, con más preguntas, documentación y trámites.

**Qué cambia** (`lib/sim/campaign/offers.ts` y `quiz.ts`; solo en las campañas nuevas):

| | Antes | Ahora |
|---|---|---|
| Oferta que no cabe | Carta de aceptar o rechazar | Si subcontratar deja al menos 0,05 €/km, carta con subcontratar (respondes tú: Ley 15/2009, art. 6.1), proponer la semana siguiente (acepta la mitad) o rechazar. Si no, pasa de largo y el informe de la semana dice cuánto no facturaste |
| Urgente que cabe | Aceptar o rechazar | Aceptar, pedir un 10 % más (el cliente tiene un límite oculto) o rechazar |
| Cliente fijo que cabe | Aceptar o rechazar | Aceptar, contrapropuesta del +5 % o rechazar. Si no cabe, pasa de largo |
| Casos (la mitad de las ofertas que caben) | — | Sin documentos: documento de control (Orden FOM/2861/2012; Ley 15/2009, art. 10). Estiba: art. 20. Mercancía de valor: declaración de valor, art. 61. Pago a 90 días: Ley 3/2004, art. 4.3, y Ley 15/2009, art. 41. Precio cerrado sin revisión por gasóleo: art. 38.3 |
| Almacenaje suelto | — | 40 palés durante 3 semanas, si la nave tiene sitio, con o sin albarán de entrada (buena práctica, sin norma). El sitio cuenta lo ya firmado y se vuelve a comprobar al decidir |
| Semanas tranquilas | Vacías o solo con rechazos | Una pregunta del oficio (24, sin repetir): transporte (0622), almacén (0625) y gestión (0623). Cuenta para el dominio, no para el dinero |

**Normativa nueva leída en el BOE el 24/11/2026:**
- LOTT, art. 42.1: el transporte público necesita autorización.
- ROTT, art. 33.2.d: exentos los vehículos de hasta 2 t (2,5 t algunos N1 de combustibles alternativos).
- LOTT, art. 103.2.e: la exención de 3,5 t es solo del transporte privado complementario. Corrige la idea común de que una furgoneta de 3,5 t no necesita autorización.

**No comprobado:**
- **Tiempos de conducción** (Reglamento 561/2006): EUR-Lex no devolvió el texto, así que ese caso no entra.
- **Sanciones, daños y suplementos:** los importes son simulados.

**Calibrado** (10 semillas por estrategia y nivel):

| Hallazgo | Corrección |
|---|---|
| El almacenaje suelto decía «te caben» sin contar lo firmado que aún no había empezado; en el nivel 2, Bazar se iba | El sitio cuenta todas las semanas del encargo y se vuelve a comprobar al decidir |
| La estrategia automática aceptaba cartas con caso que ya no cabían | Vuelve a comprobar el sitio al decidir |

Con las reglas 2, todas las estrategias buenas quedan igual o mejor que con las reglas 1, y la mala sigue fallando en los nueve niveles.

**Resultado** (las mismas 12 campañas):

| | Reglas 1 | Reglas 2 |
|---|---|---|
| Semanas en las que solo se podía rechazar | 325 | 0 |
| Rechazos | 859 | 42 |
| Ofertas con caso | 0 | 150 |
| Preguntas del oficio | 0 | 223 |
| Ofertas que pasaron de largo (al informe) | — | 528 |

**Compatibilidad:** cada campaña guarda su versión de reglas. Se reproducen idénticas 928 campañas guardadas con las reglas 1: las de las tres entregas, más 144 de nueve niveles.

**Verificación:**
- 9 pruebas nuevas.
- 13 mutaciones, todas en rojo. Una estaba hueca y se cubrió: el sitio que no contaba lo firmado.
- App abierta en escritorio y móvil con las cartas nuevas, sin errores.

## 5. Conservación de los modos actuales

- **`/simulador`** es ahora el menú. La **Temporada** se ha movido a `/simulador/temporada` y lee **la misma clave** de siempre (`smartrade:simulador:partida`). La **Carrera** sigue en `/simulador/carrera` con su clave.
- **La campaña tiene su propio guardado** (`smartrade:simulador:campana`): semilla y acciones de cada nivel. **No se migra nada:** convertir una Temporada en una campaña sería inventar una historia que no se jugó.
- **No se ha tocado el motor de la Temporada ni el de la Carrera.** Comprobado: 650 partidas de `main` (Temporadas v1–v11 y Carreras v10–v11) se reproducen idénticas.

## 6. Verificación de la primera entrega

- **Pruebas:** 18 nuevas (`tests/campaign.test.ts`) sobre:
  - cuadre contable en cada acción;
  - reproducción idéntica;
  - reglas del bucle y continuidad entre niveles;
  - mejoras y socio;
  - varias estrategias válidas por nivel;
  - dominio separado de las estrellas y base legal;
  - Manual, pistas y «qué habría pasado si»;
  - urgentes, pérdida de clientes y los 40 €.
- **Mutaciones:** 15, todas en rojo. Tres estaban huecas en la primera pasada (el urgente que no ocupa km, el cliente que no se va y el signo de los 40 €) y se cubrieron.
- **App:** abierta en escritorio y móvil. Se jugó el nivel 1 entero desde la interfaz: informe, «qué habría pasado si», preguntas, sede del nivel 2 con compra de una mejora y recarga. Además, el menú con la Temporada guardada, sin errores de consola y sin desplazamiento horizontal en el móvil.

## 7. Siguiente entrega

- **Mazo de eventos variados** (opción C, aprobada por el dueño para después): un conductor de baja, un cliente que cambia el horario, una subida del gasóleo, un cliente que pide rebaja, una oportunidad de compra o un cliente que paga tarde.

Niveles 10–12 (acto III):
- **Almacén de verdad**;
- **La licitación**;
- **Nueva delegación** (expansión).

Antes de programar la licitación hay que leer en el BOE la normativa de contratación pública que aplique.
