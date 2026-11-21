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
