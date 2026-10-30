# Traspaso de SmarTrade

Fecha de redacción: 29/10/2026. Repositorio: `homecaroa/SmartTrade` (único commit en `main`: `fb05840 «Add files via upload»`, así que **no hay historial** del que sacar el porqué de las decisiones).

**Cómo está hecho este documento.** Todo sale de leer el repo (`README.md`, `PROGRESS.md`, `docs/*.md`, código de `lib/` y `app/`) y de ejecutar `npm test` y `tsc --noEmit` en esta sesión. No he hablado con quien desarrolló el proyecto ni he visto la app desplegada. Cada afirmación lleva una etiqueta:

- **Confirmado**: lo comprobé yo en esta sesión.
- **Documentado**: lo dicen los docs del repo; no lo he reproducido.
- **Inferido**: deducción mía a partir del código o los docs.
- **No verificado**: no lo sé o no he podido comprobarlo.

**Supuesto:** «este proyecto» = SmartTrade, el repo que se añadió a la sesión. No he tocado TripPlan ni Farmastock.

---

## 1. Objetivo y stack

**Objetivo (documentado).** Análisis de oportunidades producto–mercado para empresas españolas exportadoras, a partir de estadísticas oficiales de comercio internacional. Da un ranking con puntuación explicable (0–100), ficha de detalle, gráficos, trazabilidad de datos y exportación CSV. Origen fijo: España. Unidad de análisis: producto HS6 × mercado de destino × ventana de 3 años.

Módulos añadidos después del MVP (documentado):
- Sectores y búsqueda por nombre de producto, con catálogo HS (`lib/config/hs-catalog.ts`, `sectors.ts`).
- Comparador de mercados (`/comparar`).
- Acceso al mercado: informativo, solo enlaces (`lib/market-access.ts`).
- Guía de transporte e Incoterms 2020 (`/logistica`).
- Mercados fuera de la UE vía UN Comtrade (`?fuente=fuera`).
- Importadores y compradores (`/compradores`, `lib/buyers/`): piloto.
- Ficha imprimible y lista «qué falta por comprobar».

**Stack (confirmado en `package.json`).** Next.js ^16.4.2 (App Router), React ^19.3.1, TypeScript ^7.0.2 estricto, Tailwind 4, Recharts, Zod 4, Vitest 5. Node 20+ pedido por el README; he usado Node 22.22.0.

**Sin base de datos (documentado).** Consulta a la fuente, cálculo en el servidor y caché TTL en memoria. Las claves de API solo se usan en el servidor.

**Fuentes de datos (`SMARTRADE_DATA_MODE`):**

| Modo | Estado según los docs |
|---|---|
| `demo` (por defecto) | Datos sintéticos deterministas, siempre etiquetados DEMO. |
| `comext` | Eurostat Comext (EUR, solo declarantes UE). Probado de extremo a extremo con datos reales el 18/10/2026 (`220421, 150920` → 49 oportunidades válidas, 1 incompleta). |
| `comtrade` | UN Comtrade (USD). Necesita `COMTRADE_API_KEY`. Probado con clave gratuita a mano el 25–26/10/2026; **no probado con la clave real dentro de la app** (`docs/testing.md`, ronda 10). |

Búsqueda en vivo de compradores: Tavily (`TAVILY_API_KEY`), solo probada con respuestas simuladas.

---

## 2. Decisiones técnicas importantes y por qué

Los «porqués» son los que dan los docs. Quién decidió cada cosa y cuándo: **no verificado** (no hay historial git).

1. **Datos reales solo de fuentes oficiales y siempre etiquetados.** Lo sintético lleva `synthetic=true` y no se mezcla con lo real. Los valores EUR (Comext) y USD (Comtrade) nunca se mezclan, ni se convierten. Cada fuente tiene su propio universo de percentiles y su caché.
2. **Sin puntuación parcial ni redistribución de pesos.** Si falta algún dato (3 años de importaciones, CAGR, cuota, exportaciones españolas, clasificación o moneda homogéneas), la oportunidad es «incompleta» y no puntúa. Motivo: criterio conservador, evitar puntuaciones inventadas.
3. **Ausente ≠ cero.** Una celda sin dato es «no disponible» (`n.d.`), nunca 0. Una consulta vacía de Comext es «sin datos», no ceros. Las celdas confidenciales se omiten, no se imputan.
4. **Puntuación** = `0,35·tamaño + 0,30·crecimiento + 0,20·expansión de cuota + 0,15·exportadora`, cada componente como percentil de rango medio sobre el universo de la búsqueda, calculado **antes** de filtrar, para que filtrar no cambie la puntuación. Pesos en `DEFAULT_WEIGHTS` (`lib/scoring/score.ts`). Documentado: la elección de esos pesos no está justificada en los docs → **no verificado** de dónde salen.
5. **Expansión de cuota rediseñada (2026-10).** La versión inicial usaba el percentil de importaciones no españolas, casi idéntico al tamaño (correlación 0,998 en demo; 55 % del peso medía casi lo mismo). Ahora es una «brecha de penetración» frente a la cuota española media del producto, contraída con `m = 0,1 × mediana del tamaño`. Correlación medida con demo: 0,402. El valor 0,1 es **decisión documentada, no estimada**. Con datos reales no se ha repetido la medición completa.
6. **Año final por defecto 2024 (ventana 2022–2024), y no se combinan revisiones HS.** No hay tabla de correspondencias validada entre HS2017 y HS2022, así que una ventana que cruce revisiones queda incompleta. Se rechazan años posteriores al último año completo.
7. **Códigos HS6 obligatorios en modos reales** (máx. 20 por búsqueda), porque HS2/HS4/HS6 conviven en la misma dimensión de Comext y mezclar niveles daría datos incoherentes. Los códigos deben existir en la nomenclatura del año consultado (150910 ya no existe desde HS2022).
8. **Comext.** Host propio `ec.europa.eu/eurostat/api/comext/dissemination`, dataset `ds-045409`. La descarga sin filtros está deshabilitada, así que se filtra siempre. Respuestas asíncronas (HTTP 413 en el cuerpo): 3 reintentos (5 s, 10 s) y luego error `pending` (503), nunca datos inventados. Todos los supuestos del adaptador están centralizados en el objeto `COMEXT` (`lib/sources/comext.ts`).
9. **Comtrade.** Llamadas serializadas con 1,1 s de separación (límite real observado: 1 llamada/s, cupo de 60 operaciones) y reintento tras un 429. La consulta pide `partner2Code=0&customsCode=C00&motCode=0` para evitar 500+ filas de desgloses. Se identifica por código numérico (`reporterISO` puede venir `null`). Se rechazan respuestas de ≥500 filas por posible truncado. Clave por cabecera `Ocp-Apim-Subscription-Key` (verificado funcionando).
10. **«Fuera de la UE» solo se concede con `SMARTRADE_DATA_MODE=comext` + clave de Comtrade** (`getConfig`, `lib/config/index.ts`). Solo 9 mercados con cobertura verificada, y solo para HS 220421. Riesgo documentado: la web es pública y el cupo de la clave es compartido.
11. **Etiquetas en lenguaje llano con reglas fijas** (`lib/scoring/labels.ts`). No cambian la puntuación. «Crece rápido» exige percentil ≥75 **y** CAGR ≥5 % (corregido el 26/10/2026 porque en un universo en retroceso un +0,2 % se etiquetaba «rápido»). Avisos de precaución: «Crecimiento excepcional» (CAGR ≥30 %) y «Posible efecto precio» (valor supera al peso en ≥15 pp/año). Umbrales: decisiones documentadas, no estimadas.
12. **Acceso al mercado sin integración automática.** No se verificó que Access2Markets ofrezca API pública adecuada; se enlaza a Access2Markets e ICEX y nada se marca «verificado». No entra en la puntuación.
13. **Compradores: la evidencia se deduce, no se escribe a mano.** Niveles: importador confirmado / comprador probable / evidencia insuficiente. La búsqueda automática nunca pasa de «probable». Se respeta robots.txt, se bloquean hosts internos (SSRF), y un correo o teléfono solo se admite con la URL pública donde aparece. No se infieren correos ni se guardan personas sin fuente.
14. **Sin persistencia.** «Guardar» = exportar CSV. Los checks de «qué falta por comprobar» no se guardan.
15. **Servidor, no estático.** GitHub Pages no sirve; se ejecuta en local, en Codespaces o en Vercel.

---

## 3. Convenciones y reglas a mantener

**No hay `CLAUDE.md`** en el repo. Lo siguiente lo he extraído de los docs y del código (documentado salvo indicación):

- **Honestidad sobre el estado de verificación.** Cada doc distingue «verificado con datos reales», «simulado» y «sin probar». Mantenerlo: no escribir «verificado» sin haberlo ejecutado.
- **Nada de datos sintéticos sin etiquetar.** Marca `SI_DEMO_SINTETICO` en el CSV, etiqueta DEMO en la UI.
- **Los fixtures de tests son simulados** (`tests/helpers/mock-comext.ts`, fixtures de Comtrade y Tavily). Prueban nuestro código, no que la API real use esos ids.
- **Las claves nunca llegan al navegador ni a los mensajes de error.** Hay tests que lo comprueban (`comtrade-adapter.test.ts`).
- **Ningún texto debe prometer resultados.** Las etiquetas «no son recomendaciones»; la puntuación «no es probabilidad de éxito». Hay tests contra «promesas» (`labels.test.ts`) y contra tarifas/plazos en la guía de Incoterms (`logistics.test.ts`).
- **Cada vez que se cambia la metodología, se documenta en `docs/methodology.md`** con el problema, la corrección y el resultado medido (patrón visto en la sección «Corrección: redundancia…»).
- **Umbrales:** o salen de una medición, o se declaran «decisión documentada, no estimada».
- **Idioma:** UI, código comentado y docs en español. **Inferido.**
- **Nombres:** la app se llama «SmarTrade» (sin la «t» central de «Smart»), el paquete `smartrade`, el repo `SmartTrade`. Variables `SMARTRADE_*`.
- **Variables de entorno** (README): `SMARTRADE_DATA_MODE`, `CACHE_TTL_SECONDS` (3600 por defecto), `DEFAULT_END_YEAR` (2024; acotado a 2018–2025), `COMEXT_BASE_URL`, `COMEXT_DATASET`, `COMEXT_WORLD_CODE`, `COMTRADE_API_KEY`, `COMTRADE_KEY_IN_QUERY`, y además `TAVILY_API_KEY` (solo en `docs/buyers.md`). `.env`/`.env.local` están en `.gitignore`.
- **Antes de usar datos reales:** `npm run verify:comext` / `verify:comtrade`. Códigos de salida 0 = coherente, 1 = fallo, 2 = no concluyente (respuesta asíncrona).
- **Comprobación mínima antes de entregar:** `npm test`, `npm run typecheck`, `npm run build` (patrón de los docs de pruebas).

---

## 4. Estado actual

### Terminado (con lo que he podido comprobar)

- **Confirmado hoy:** `npm test` → 25 archivos, **223 pruebas, todas correctas**. `tsc --noEmit` → sin errores (salida 0). Node 22.22.0.
- **Documentado:** MVP completo en demo; Comext real de extremo a extremo (18/10/2026); Comtrade probado a mano con clave real (25–26/10/2026: autenticación, campos, límites, cobertura de 9 mercados, peso neto); sectores; comparador; logística/Incoterms; corrección de la expansión de cuota; crecimiento en volumen y avisos; piloto de compradores (HS 220421, Japón: 9 empresas, 2 importadores confirmados con contacto verificable).
- **Comprobación manual en navegador:** `docs/limitations.md` §11 dice «No probado en navegador». Los docs de pruebas hablan de «HTML servido y API». **No verificado** que alguien haya mirado la UI en un navegador real.

### No verificado en esta sesión

- `npm run build` (no lo ejecuté).
- Cualquier llamada real a Eurostat/Comtrade/Tavily (no tengo claves y no probé la red).
- Si existe un despliegue en Vercel o Codespaces funcionando. Los docs lo sugieren como opción; ninguno afirma que esté desplegado.

### A medias

- **Comtrade dentro de la app con clave real:** no probado (ronda 10).
- **Tavily con clave real:** no probado.
- **Posición exportadora poco informativa:** con 2 productos el percentil solo toma los valores 25 y 75 (15 % de la puntuación). Se avisa con menos de 10 productos. La prueba real solo ha usado 2 productos.
- **Medición de la expansión de cuota con datos reales** (sector de 10+ productos): pendiente.
- **Comparación cuantitativa Comext vs Comtrade:** pendiente (hay diferencia sin explicar en exportaciones de España de HS 220421: 1.879,2 M€ en Eurostat 2024 frente a 1.914 M$ en Comtrade; monedas distintas, sin conversión).
- **Cobertura Comtrade:** Emiratos sin 2024; Arabia Saudí sin datos (no se ofrece).
- **Indicadores de estado** (`c`, `e`) de JSON-stat: sin confirmar. (Grecia resuelta el 30/10/2026: Comext usa `GR`.)
- **Peso neto en Comtrade:** no lo publican todos los países (p. ej. Japón 220421, Reino Unido 220421/220429: `n.d.`). Pendiente de cartografiar qué países lo publican.
- **Compradores:** datos curados solo para HS 220421 en Japón; consultas en vivo solo en inglés; faltan ferias (p. ej. Foodex) y asociaciones.
- **Calculadora de coste puesto en destino:** no existe, y solo tendría sentido con datos que aporte el usuario.

### Bugs y riesgos conocidos

- **Alerta de GitGuardian del 19/10/2026** sobre `homecaroa/SmartTrade` (en `PROGRESS.md`): pendiente de revisar. Hice una búsqueda rápida de patrones de claves en `.ts/.mjs/.md` y no encontré nada, pero mi expresión era estrecha: **no la doy por descartada**. Revisar en el panel de GitGuardian qué archivo marca. Por el nombre, «probable falso positivo en claves ficticias de pruebas» es la hipótesis del propio `PROGRESS.md`, no un hecho.
- **Caché en memoria:** se pierde al reiniciar y no se comparte entre instancias serverless; en Vercel puede significar más llamadas y más consumo del cupo de Comtrade. No hay `maxDuration` ni región configurados en Vercel y no se han verificado los límites del plan.
- **Cupo de Comtrade compartido** entre todos los visitantes de una web pública; si se agota, la app muestra error de límite.
- **Efecto Róterdam:** importaciones de Países Bajos/Bélgica incluyen tránsito y sobrevaloran la demanda final.
- **Crecimiento en valor, no en volumen** (los precios pueden explicar mucho; hay avisos pero no corrección). Un caso real: vino en Luxemburgo (CAGR 46 %) llegó al primer puesto.
- **Datos provisionales:** no se detecta provisionalidad; solo se bajan a calidad «media» los datos marcados como estimados.
- **Asimetrías bilaterales** entre lo que declara el exportador y el importador.
- **Percentiles dependen del universo:** puntuaciones de cargas distintas no son comparables.
- **El buscador no pide confirmar la interpretación** del texto del usuario antes de analizar.
- **Servicios de nombres:** proveedores fuera del catálogo llegan en inglés.

### Inconsistencias que he encontrado en el propio repo (a corregir)

1. **`PROGRESS.md` está desfasado:** dice «94/94 pruebas, 9 archivos»; hoy son 223 en 25. Su «Siguiente tarea» y «Bloqueos» no reflejan el trabajo de las rondas 9–14. Además tiene dos puntos numerados «2.» en «Bloqueos».
2. **`README.md` desfasado:** dice que Comtrade está «sin probar» y que Comext tiene «API sin ejecutar con datos reales», cuando `docs/data-sources.md` y `PROGRESS.md` dicen que ambos se probaron. Tampoco menciona los módulos nuevos ni `TAVILY_API_KEY`.
3. **`docs/data-sources.md` se contradice:** la tabla de arriba dice «verificado de principio a fin», y el párrafo siguiente dice «falta comprobar la app completa en modo `comext`».
4. **`docs/limitations.md` §1** dice que Comtrade «no se ha probado» y no recoge la verificación del 25/10.
5. **El repo nombra archivos que ya no existen:** `.env.example` y `.devcontainer/` (README) y `scripts/verify-comtrade-peso.mjs` y `verify-comtrade-detalle.mjs` (`limitations.md`, `testing.md`). **Según el dueño (29/10/2026) eran de una prueba o duplicados y ya se borraron a propósito**, así que no hay nada que recuperar. Lo que queda por hacer es quitar esas referencias de README y docs (y el aviso del `.env.example`), porque hoy apuntan a archivos inexistentes. Solo existen `verify-comext.mjs` y `verify-comtrade.mjs`.
6. **`docs/testing.md`** mezcla en cabecera «94 pruebas» con secciones posteriores hasta 223.

---

## 5. Alternativas descartadas y por qué

Solo las que aparecen como descartadas o no adoptadas en el repo. Las razones son las que dan los docs.

| Alternativa | Por qué no |
|---|---|
| Puntuación parcial / redistribuir pesos si faltan datos | Criterio conservador: se prefiere «incompleta» con motivo antes que una puntuación basada en datos ausentes. |
| Expansión de cuota como percentil de importaciones no españolas | Redundante con el tamaño (correlación 0,998). Sustituida por la brecha de penetración. |
| Combinar ventanas que cruzan revisiones HS | No hay tabla de correspondencias validada; quedan incompletas. |
| Convertir USD↔EUR y mezclar Comtrade con Comext | No se mezcla; universos y percentiles independientes. La conversión con tipo medio anual no se ha hecho. |
| Dataset DS-059341 de Comext para declarantes no UE | Candidato; dimensiones sin verificar. Se usó Comtrade. |
| Integración automática de aranceles (Access2Markets) | No verificado que haya API pública adecuada; solo enlaces. |
| Enlazar TARIC | Regula importaciones a la UE, no la exportación desde España. |
| Brave Search API como proveedor de búsqueda | Las fuentes consultadas se contradicen sobre condiciones y precio. Sin integrar (basta otro adaptador de `SearchProvider`). Se eligió Tavily (1.000 créditos/mes gratis, condiciones leídas el 27/10/2026). |
| Brokers de datos (ZoomInfo, Prospeo, ImportGenius, Panjiva…) como fuente de compradores | Infieren correos y exponen datos personales. |
| Ofertas de empleo como evidencia de compra | No prueban que la empresa importe. |
| Listados de importadores de vino argentino como prueba de importación de vino español | Prueban actividad con vino, no con vino español. |
| Base de datos para guardar resultados | No hay; CSV como mecanismo. Razón explícita: no consta (**inferido:** simplicidad). |
| GitHub Pages | Necesita servidor. |
| Volumen (peso neto) dentro de la puntuación | Solo genera avisos: el peso no distingue cambios de composición y no todos los países lo publican. |
| Imputar celdas confidenciales o ausentes | Nunca; se omiten. |
| Calculadora de coste puesto en destino | Pospuesta: solo sirve con datos del usuario. |

---

## 6. Próximos pasos por prioridad

Orden mío, **inferido** de los pendientes de `PROGRESS.md`, los docs y los riesgos de arriba. La prioridad es una propuesta, no una decisión del proyecto.

1. **Cerrar la alerta de GitGuardian** (seguridad, barato). Ver qué archivo marca; si es una clave real, rotarla; si es de prueba, marcarla falso positivo. Esto ya figuraba como primera tarea en `PROGRESS.md`.
2. **Quitar las referencias a archivos borrados a propósito** (`.env.example`, `.devcontainer/`, `verify-comtrade-peso/detalle.mjs`) en README y docs. Si se quiere Codespaces, habría que crear `.devcontainer` de nuevo; no está decidido.
3. **Actualizar `PROGRESS.md`, `README.md` y las incoherencias de `docs/data-sources.md` y `limitations.md`.** Es poco trabajo y quien herede el proyecto se guiará por ellos.
4. **Ejecutar `npm run build` y arrancar la app** para confirmar el estado real; hoy solo está confirmada la parte de tests y tipos. Mirar la UI en un navegador (limitación nº 11).
5. **Desplegar o confirmar el despliegue** en Vercel con `SMARTRADE_DATA_MODE=comext`. Decidir antes qué hacer con la caché en memoria (en serverless se reinicia) y con el cupo compartido de Comtrade.
6. **Ampliar la prueba real de Comext a 10+ productos / un sector** (el siguiente paso que ya marcaba `PROGRESS.md`). Hasta entonces la «posición exportadora» y los percentiles son poco informativos. Aprovechar para repetir la medición de la expansión de cuota con datos reales.
7. **Probar Comtrade dentro de la app con clave real** y comparar cuantitativamente con Eurostat (resolver la diferencia en exportaciones de HS 220421).
8. **Probar Tavily con clave real en 3 combinaciones producto–país**, añadir términos en el idioma del país y fuentes de ferias/asociaciones; revisión humana antes de ampliar los datos curados.
9. **Confirmar los indicadores de estado** de Comext (`c`, `e`) para poder señalar datos provisionales.
10. **Más mercados/productos fuera de la UE** (cobertura verificada solo para HS 220421 y 9 mercados) y cartografiar qué países publican peso neto.
11. **Pruebas de interfaz** (hoy no hay). Puede esperar si el uso es interno.

---

## Apéndice: arranque rápido

```bash
npm ci
# .env.example ya no existe (borrado a propósito): sin .env.local arranca en modo demo
npm run dev                  # http://localhost:3000
npm test && npm run typecheck && npm run build
SMARTRADE_DATA_MODE=comext npm run dev   # buscar: 220421, 150920
```

Nota: en esta sesión el primer `npm ci` falló sin un error visible y el segundo funcionó. Causa **no verificada** (probablemente un fallo de red puntual).
