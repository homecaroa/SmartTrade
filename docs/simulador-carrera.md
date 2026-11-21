# Business Simulator · Carrera

La Carrera es un modo de varios años del Business Simulator. La Temporada de 26 semanas (`docs/simulador.md`) se queda como está: es el modo corto y el tutorial. La propuesta de diseño completa (operaciones profundas, etapas de la empresa, personal, financiación, expansión) se presentó en el chat el 21/11/2026 y aquí se resume en el §4. Cada fase se publica jugable y con lo suyo medido.

## 1. Fase A: fundamentos (21/11/2026)

### Lo que hay

- **`/simulador/carrera`**: 5 años de 52 semanas, es decir, 260 semanas. Se guarda aparte de la Temporada (`smartrade:simulador:carrera`), así que empezar una no borra la otra. Un archivo exportado de un modo no se importa en el otro.
- **Calendario** (`lib/sim/calendar.ts`):
  - año de juego = 52 semanas = 13 meses de 4 semanas; trimestre = 13 semanas;
  - el mes de 4 semanas ya existía (alquiler, nóminas e informe), así que es un calendario de 13 periodos: una simplificación declarada.
- **Los sucesos se repiten cada semestre de 26 semanas**: averías, reclamaciones, incidencias de almacén y de reparto, aviso de mora por cliente, y campaña y valle de las ofertas.
  - Cada semestre tiene su semilla (`semesterSeed`) y su clave de respuesta (`semesterKey`: `dano@2`, `averia-2@3`…).
  - En el semestre 1, la semilla y las claves son las de siempre.
- **Preguntas mensuales**: las de concepto no se repiten dentro de un año y vuelven a salir al año siguiente. En la Temporada, que cae entera en el año 1, son exactamente las de antes.
- **Avanzar hasta la próxima decisión** (solo Carrera):
  - Cierra semanas seguidas sin aceptar trabajo nuevo. Las ofertas de esas semanas se pierden, y lo dice.
  - Se para con cualquiera de estas cosas:
    - una incidencia;
    - un informe mensual nuevo;
    - un contrato que termina;
    - un aviso de caja;
    - el tope de 13 semanas por vez.
  - No arranca si no hay trabajo comprometido esa semana. En la primera prueba con el navegador, avanzar sin trabajo llevó a la quiebra en la semana 17.
  - Son acciones «cerrar» normales: guardado y reproducción no cambian.
- **Estados financieros** (`lib/sim/statements.ts`, pestaña Finanzas de la Carrera): cuenta de resultados con EBITDA, balance al cierre y flujos de caja por trimestre o año, al lado del periodo anterior.
  - No se guardan: se calculan con lo que la partida ya registra.
  - El balance de una semana pasada se reconstruye a partir de:
    - facturas y pagos pendientes en esa semana;
    - fianzas;
    - valor de los camiones menos la amortización;
    - fijos devengados desde el último pago mensual.
- **Final**: no hay objetivos de temporada. Se pierde como en la Temporada (dos semanas sin caja, o servicio por debajo del 80 % cuatro semanas seguidas), y el resumen final muestra el resultado de cada año.

### Decisiones y su porqué

| Decisión | Por qué | Lo que cuesta |
|---|---|---|
| Mismo motor, `mode: "carrera"` en el estado | Una Temporada es exactamente el primer semestre de una Carrera, así que nada de la Temporada cambia. Comprobado: 783 partidas de `main` (v1–v9, seis estrategias más partidas al azar) se reproducen con el estado completo idéntico. | La Carrera hereda los techos de la Temporada (ver §2). |
| Repetir los sucesos cada semestre | Es lo mínimo para que 5 años no se queden sin sucesos. **Decisión documentada, no medida.** | Se repite el patrón de la temporada. La variedad real llega con la fase B. |
| **Sin instantáneas mensuales** (se habían propuesto) | Medido: reproducir una Carrera de 5 años clonando el estado en cada acción tardaba de 2,6 a 4,7 s; la nueva reproducción sobre una sola copia (`replayFrom`) tarda de 140 a 200 ms. Con eso, guardar instantáneas solo añadiría complejidad. | Si la partida crece mucho más (fase B y siguientes), habrá que volver a medir. |
| Preguntas mensuales en una sola pasada | Cada mes recalculaba todos los anteriores, con un coste que crecía con el cubo de los meses (65 meses en una Carrera). | — |
| Sin IVA ni impuesto de sociedades | Pendiente de decisión del dueño (§3). Los estados lo dicen en pantalla. | — |
| Inversión = compra de camión y fianzas; financiación = variación de la póliza dispuesta; intereses y comisiones, en explotación | En el juego la póliza es la única deuda y sus gastos son un coste más de la semana. Simplificación declarada. | — |

### Medido con estrategias automáticas (21/11/2026)

**Supervivencia en 5 años** (10 semillas por estrategia):

| Estrategia | Supervivencia |
|---|---|
| nada | 0 de 10 |
| codiciosa | 0 de 10 |
| prudente | 8 de 10 |
| selectiva | 9 de 10 |
| negociadora | 10 de 10 |
| crecedora | 10 de 10 |

**Resultado medio por año** (6 semillas por estrategia):

| Estrategia | Año 1 | Año 2 | Año 3 | Año 4 | Año 5 |
|---|---|---|---|---|---|
| prudente | −16,4 k€ | −11,1 k€ | −0,7 k€ | −9,8 k€ | −13,3 k€ |
| crecedora | −0,1 k€ | +14,3 k€ | +16,8 k€ | +14,1 k€ | +11,4 k€ |

**Lectura:** con el contenido actual la empresa no crece en 5 años: se estanca o empeora. Es lo esperado, porque las herramientas de crecimiento son las de la Temporada (un segundo camión, una nave y una póliza). Este hecho justifica las fases B a E y la pantalla de inicio lo avisa («en construcción»).

**En la app** (`next start`, Chromium):

| Operación | Tiempo |
|---|---|
| Cargar una partida en la semana 250 | 0,56 s |
| Cerrar una semana | 0,22 s |
| Abrir Informe | 0,47 s |

No hay errores de consola ni desplazamiento horizontal en el móvil.

## 1 bis. Fase B1: operaciones profundas (21/11/2026, reglas v11)

Esta es la petición del dueño: «menos ofertas de trabajos y más profundidad en cada una». Solo cambian las Carreras **nuevas** (v11). La Temporada v11 se juega exactamente igual que la v10, y las Carreras v10 siguen con el mercado de la fase A.

**Una operación pasa por estas fases** (`lib/sim/deep.ts`):

1. **Solicitud (ficha):**
   - mercancía, palés y toneladas, y su valor por kg;
   - en distribución, el destino (distancias aproximadas, simuladas) y los viajes por semana;
   - contrato de 8 a 26 semanas.
2. **Informe comercial** (opcional, 90 €): revela cómo paga de verdad el cliente. Su coste se registra como «Informes comerciales» en la cuenta de resultados y en el reparto por líneas.
3. **Escandallo** (obligatorio antes de negociar o aceptar):
   - El jugador calcula el coste completo con los costes de su empresa, que tiene a mano en el formulario.
   - Coste completo = costes directos + la parte de los fijos de la línea (conductor, seguro y amortización; alquiler y mozo). No incluye la estructura. Es una convención declarada.
   - Se corrige así: a menos del 10 %, bien; a menos del 25 %, razonable; más lejos, error importante. La corrección explica cada partida y el margen.
   - Si el precio no cubre el coste completo, la corrección cita la Ley 15/2009, art. 10 bis.1.g (desde el 02/08/2022, el precio pactado con el porteador efectivo debe cubrir sus costes efectivos; comprobado en el BOE el 21/11/2026).
4. **Negociación y documentación:** las de siempre.
5. **Evaluación** (Informe → «Contratos terminados»): margen previsto con tu escandallo frente al real. El real es lo facturado de verdad menos el coste completo de lo que se hizo. Cada contrato explica sus diferencias: cancelación, servicio no hecho o escandallo alejado.

**Mercado.** Las ofertas salen de la lista de siempre de esa semana, pero llegan de 0 a 3 (1,55 de media, un tercio que en la Temporada). Son más grandes (×1,2–1,8), duran de 2 a 6 meses y se pagan un 20 % mejor. La semana 1 trae una distribución y un almacenaje.

**Calibrado con estrategias automáticas, no con datos de mercado:**

1. **Primer intento: 1 oferta de media.** Todas las estrategias quebraban. El camión solo es rentable casi lleno (1,30 €/km a 1.050 km por semana, 1,96 €/km a 600), los contratos llegaban a trozos y el almacén pasaba años medio vacío.
2. **Siguiente intento: 1,55 de media con precio +10 %.** Seguía quebrando la mitad.
3. **Resultado final** (10 carreras por estrategia):

| Estrategia | Terminan los 5 años | Resultado por año |
|---|---|---|
| crecedora | 10 | +19 a +34 k€ |
| prudente | 7 | entre −10 y +2 k€ |
| selectiva | 8 | entre −12 y +2 k€ |
| negociadora | 8 | entre −12 y −1 k€ |
| nada | 0 | quiebra |
| codiciosa | 0 | quiebra |

**Lectura:** una empresa de un camión y con gerente no es rentable sin crecer. Crecer (segundo camión, nave y subcontratación) es lo que funciona.

**Verificación:**
- 14 pruebas nuevas (`tests/sim-deep.test.ts`).
- 726 partidas de `main` (Temporadas v1–v10 y Carreras v10) se reproducen idénticas.
- 10 mutaciones en rojo. Una estuvo en verde en la primera pasada («la evaluación ignora lo facturado»): en la partida de prueba todos los contratos se cumplían enteros. Se añadió un contrato cancelado a medias y ya se pone en rojo.
- La app se ha abierto en escritorio y móvil.

**Pendiente (B2):**
- Gasóleo variable con la revisión **obligatoria** del art. 38 (no se negocia).
- Paralizaciones (art. 22) y valor declarado (art. 61) como condiciones de la operación.

## 2. Límites conocidos de la fase A

- El crecimiento tiene techo, como se mide en el §1.
- La reputación, los precios y los clientes son los de la Temporada. No hay ciclo económico, competencia ni gasóleo variable.
- Las preguntas de concepto (25) cubren unos 8 meses por año. Los meses restantes de cada año solo traen las de tus números.
- En la Carrera, la tabla «Todo» de Finanzas se limita a las últimas 13 semanas. Los años están en los estados financieros.

## 3. Decisiones pendientes del dueño

1. **IVA**: incluirlo (repercutido, soportado y liquidación trimestral) enseña tesorería, pero añade complejidad. Hay que leer la normativa antes.
2. **Detalle del personal**: la recomendación es tratar como individuos solo los puestos clave y los mandos, y al resto como equipos.
3. **Duración objetivo**: 5 años de juego; las horas reales están por definir.

## 4. Fases siguientes (propuesta del 21/11/2026)

| Fase | Contenido | Antes hay que verificar |
|---|---|---|
| B. Operaciones profundas | Menos oportunidades y más profundas: ficha, escandallo, negociación de varias condiciones, planificación, ejecución causa-efecto y evaluación; encargos y contratos recurrentes | Ley 15/2009, revisión del precio por el gasóleo |
| C. Flota y personal | Tipos de vehículo, mantenimiento y reventa; contratación, despido y absentismo; jefe de tráfico | Estatuto de los Trabajadores, cotizaciones, convenio, ITV |
| D. Financiación y licitaciones | Préstamos, leasing, hipoteca, factoring y avales; un banco que mira los ratios; licitaciones con competencia | — |
| E. Expansión y mercado | Delegaciones, nuevas actividades, internacional con aduana y divisa, ciclos, competencia, crisis | Tiempos de conducción (Reglamento 561/2006), mercancías peligrosas, Ley Concursal |
| F. Longevidad | Objetivos, escenarios, situaciones escritas, IA redactora (de pago) | Términos de Gemini |

## 5. Pruebas

- `tests/sim-career.test.ts` cubre:
  - el calendario;
  - una carrera completa con el cuadre en cada paso;
  - los sucesos por semestre, cada uno con su semilla;
  - las preguntas por año;
  - que la reproducción rápida sea igual a la lenta y que tarde menos de 1,5 s;
  - el estado limpio cuando una acción falla a mitad;
  - los estados financieros: balance cuadrado en todas las semanas, flujos que explican la tesorería y cuenta de resultados igual a la suma de semanas, también en una quiebra a mitad de trimestre y en temporadas con crecimiento.
- **Mutaciones** del 21/11/2026, 10 en total: 9 en rojo y una equivalente.
  - La equivalente: poner `cashAt` a la caja inicial no cambia nada, porque `balanceAt` recorta antes a la última semana cerrada.
  - Dos estaban en verde en la primera pasada, el flujo de financiación a cero y el balance sin recortar, y dejaron ver dos huecos: ninguna partida de las pruebas disponía de la póliza, y nadie pedía el balance de una semana sin cerrar. Se añadieron las dos pruebas (temporada «crecedora», semilla 126705, que cierra tres semanas con la póliza dispuesta) y ya se ponen en rojo.
  - La de reproducir clonando en cada acción la caza la prueba de tiempo: 5,4 s frente al límite de 1,5 s.
