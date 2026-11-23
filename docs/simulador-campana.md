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

Niveles 4–6:
- **Contratación:** antes hay que leer en el BOE el Estatuto de los Trabajadores, las cotizaciones y el convenio.
- **Negociación de un acuerdo marco.**
- **Calidad y operaciones.**

También, más mejoras en el árbol.
