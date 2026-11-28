# Tests de estudio (`/practica`)

Añadido el 28/11/2026. Banco de preguntas tipo test de los cuatro módulos de 1.º cuyo libro de texto tiene índice propio:
0622 Transporte internacional, 0623 Gestión económica y financiera, 0625 Logística de almacenamiento y 0627 Gestión
administrativa. 117 tests, 1.887 preguntas.

## Origen y por qué los datos viven aquí

Se escribieron y auditaron en la web estática `tests-comercio-internacional` (repositorio aparte del dueño, que sigue
siendo la fuente de verdad del contenido). Aquí se **copian** tal cual a `data/practica/` (catálogo `modulos.json` y un
JSON por test). Si se corrige una pregunta, se corrige allí y se vuelve a copiar; editarla solo aquí la dejaría
desincronizada. Los ejercicios de cálculo de esa web (solo 0622) **no** se han portado.

## Decisiones

- **Sección propia, sin red y sin base de datos**, como el Modo Aprendizaje: ficheros estáticos validados con zod al
  cargarse (`lib/practica/schema.ts`); un fichero mal formado da un error con su nombre, nunca una pregunta rota.
- **Azar solo con semilla**: el orden de preguntas y de opciones sale de `semillaDe(clave, intento)`. «Repetir» sube el nº de
  intento; el mismo intento se reproduce igual. Una prueba vigila que `lib/practica` no use `Math.random` ni la hora.
- **Progreso en localStorage** (intento y mejor resultado), clave versionada `smartrade:practica:v1:…`. Es una comodidad:
  sin almacenamiento todo funciona igual.
- **Dos modos**: estudio (corrige cada pregunta, con explicación, criterio y fuente) y test final de 60 preguntas
  repartidas por peso de cada unidad (resto mayor, mínimo 1 por unidad), sin corrección hasta entregar.
- **Nota del test final** = (aciertos − 0,5 · fallos) / total · 10, mínimo 0; blancos no puntúan. Es una convención
  didáctica del proyecto, no la norma de ningún examen concreto, y la pantalla lo dice.

## Honestidad sobre la fiabilidad del contenido

Cada pregunta lleva `verificacion`, que la interfaz muestra al corregir:
- `oficial`: contrastada con el texto oficial leído (BOE, convenio, reglamento).
- `secundaria`: basada en libro o guía, sin el texto oficial leído.
- `general`: conocimiento del sector sin fuente oficial leída. **No es «falso»**, pero tampoco está verificado.

En el momento de la copia: 592 oficial, 249 secundaria, 1.046 general (≈ 62 % sin fuente oficial leída). Las normas
cambian (p. ej. el interés de mora del art. 20 de la Ley 50/1980 estaba mal por usar el texto de 1980). El currículo de
Madrid posterior a 2012 no se ha localizado: las horas y apartados de 0623, 0625 y 0627 siguen el índice del libro.

## Calidad del banco (qué vigila la prueba)

`tests/practica.test.ts` repite aquí las comprobaciones que lo hacen servir para estudiar:
- ids y enunciados únicos en todo el banco, opciones distintas, `oficial` incompatible con «no leída» en la fuente;
- **sesgo de longitud**: la correcta no puede ser la opción más larga ni la más corta en más del 40 % de un módulo. Medido el
  27/11/2026: era 79 % en 0622, 81 % en 0625, 84 % en 0627 y 76 % en 0623 (bastaba elegir la más larga para aprobar);
  tras reescribir distractores, 31 %, 21 %, 37 % y 37 %. El umbral sale de lo esperable con longitud independiente (~25 %).

## Pendiente (no hecho)
- Ejercicios de cálculo y su comprobación en `scripts/calculos.mjs` de la web de origen.
- Módulos restantes de 1.º y 2.º (0825, 0826, 0824…) y el test final con ejercicios.
- Enlazar cada test con el caso práctico del Modo Aprendizaje que trabaja el mismo RA (`docs/curriculo.md`).
