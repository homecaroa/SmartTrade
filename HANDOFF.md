# Traspaso de SmarTrade

Actualizado el 11/11/2026, tras la auditoría completa de ese día. Sustituye a la versión del 29/10/2026, que describía un
repositorio con un único commit, 223 pruebas y pendientes ya resueltos. Repositorio: `homecaroa/SmartTrade`; despliegue en
Vercel (smart-trade-self.vercel.app) con cada fusión a `main`.

Etiquetas: **confirmado** (lo comprobé ese día), **documentado** (lo dicen los docs; no lo reproduje), **no verificado**.

---

## 0. El proyecto en una página (11/11/2026)

- **Tres partes:**
  - **Modo Aprendizaje** (portada `/`; `lib/learning`): casos prácticos de exportación, importación y negociación para el CFGS de Comercio Internacional.
  - **Business Simulator** (`/simulador`; `lib/sim`): temporada de 26 semanas dirigiendo un operador logístico ficticio de Valencia.
  - **Análisis de mercados** (`/mercados`): diagnóstico descriptivo con datos de Eurostat y Comtrade. Está en mantenimiento por decisión del dueño (09/11/2026).
- **Público:** el propio dueño, alumno de 1.º del CFGS de Comercio Internacional (familia Comercio y Marketing). No hay profesor ni modo de clase.
- **Estado confirmado el 11/11/2026:**
  - `npm test`: 44 archivos, todas las pruebas correctas. La cifra exacta está en `CLAUDE.md`.
  - `tsc` y `next build` sin errores.
  - Navegador: 80 páginas recorridas con Playwright, sin errores ni desbordamiento a 390 px.
  - Producción sirve la última versión; `/api/filters` responde en modo `comext`.
- **Reglas de trabajo:** están en `CLAUDE.md`, que ahora sí existe y manda. Las más importantes:
  - commit, push, PR y fusión al terminar cada encargo, sin preguntar;
  - verificar con pruebas, mutaciones y abriendo la app;
  - nada escrito como «verificado» sin haberlo ejecutado.

### Business Simulator: lo esencial para continuarlo

- **Motor puro y determinista.** El estado sale de reproducir las acciones sobre `newGame(semilla, versión)`. Nada de `Math.random`, hora ni red (hay una prueba que lo vigila).
- **Guardado.** Se guardan la semilla, la versión de reglas y las acciones. Cada partida se reproduce siempre con su propia versión.
- **Versiones de reglas.** Todo cambio que altere una partida va en una versión nueva (`ENGINE_VERSION`, `lib/sim/params.ts`):

  | Versión | Qué añade |
  |---|---|
  | v1 | Base |
  | v2 | Viajes puntuales con carga de retorno |
  | v3 | Precio de subcontratación de mercado |
  | v4 | Reclamaciones con base legal |
  | v5 | Viajes internacionales |
  | v6 | Almacén a fondo |
  | v7 | La reputación escala todo el precio y la negociación del almacén arrastra la manipulación |

  Detalle y mediciones en `docs/simulador.md` §17 bis–decies.
- **Comprobaciones antes de fusionar un cambio del motor:**
  1. **Compatibilidad:** generar partidas con el motor publicado (un `git worktree` de `origin/main`), reproducirlas con el nuevo y comparar semanas, contratos, movimientos de caja y correcciones.
  2. **Equilibrio:** estrategias automáticas en 300 semillas (`lib/sim/strategies.ts`: nada, codiciosa, prudente, selectiva, negociadora, crecedora). Ninguna debe ganar siempre, y aceptarlo todo no debe ganar nunca.
  3. **Invariantes:** el balance cuadra en cada paso (`balanceGap`). La auditoría añadió pruebas aleatorias: 840 partidas con decisiones al azar en las 7 versiones, sin ningún fallo.
- **Todas las cifras de juego son [S] (simuladas).** La normativa está marcada [N] y comprobada en el BOE (lista en `docs/simulador.md` §19).

### Pendientes conocidos (11/11/2026)

- **Sin comprobar en la fuente oficial:**
  - IPREM 2026 (solo en fuentes secundarias);
  - Reglamento 1072/2009, art. 4, en EUR-Lex (leído en legislation.gov.uk);
  - texto vigente del Reglamento 561/2006;
  - importes de sanciones (simulados);
  - autorizaciones para Marruecos.
- **Defectos menores aceptados** (auditoría del 11/11/2026):
  - las rutas inexistentes devuelven 200 con la página de «no encontrada» y `noindex`, por el `loading.tsx` raíz;
  - las devoluciones «guardadas» cuentan para la ocupación del almacén.
- **Alerta de GitGuardian del 19/10/2026:** sigue sin revisar en el panel de GitGuardian (**no verificado**). Una búsqueda de patrones de claves en todo el repo el 11/11/2026 no encontró nada.
- **Análisis de mercados:** los pendientes de las secciones 1 y 4 siguen como estaban. No se han trabajado desde el 09/11/2026.

---

## 1. Objetivo y stack

**Objetivo (documentado).** Análisis de oportunidades producto–mercado para empresas españolas exportadoras, a partir de estadísticas oficiales de comercio internacional. Desde el 06/11/2026 es un diagnóstico descriptivo sin puntuación (antes: dos rankings por percentiles y, hasta el 03/11/2026, una puntuación única; ver `docs/methodology.md`): indicadores por mercado en su unidad, ficha de detalle, gráficos, trazabilidad de datos y exportación CSV. Origen fijo: España. Unidad de análisis: producto HS6 × mercado de destino × ventana de 3 años.

Módulos añadidos después del MVP (documentado):
- Sectores y búsqueda por nombre de producto, con catálogo HS (`lib/config/hs-catalog.ts`, `sectors.ts`).
- Comparador de mercados (`/comparar`).
- Acceso al mercado: informativo, solo enlaces (`lib/market-access.ts`).
- Guía de transporte e Incoterms 2020 (`/logistica`).
- Mercados fuera de la UE vía UN Comtrade (`?fuente=fuera`).
- Importadores y compradores (`/compradores`, `lib/buyers/`): piloto, retirado de la interfaz el 06/11/2026 (`/compradores` es un aviso; `lib/buyers` se conserva).
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

1. **Datos reales solo de fuentes oficiales y siempre etiquetados.** Lo sintético lleva `synthetic=true` y no se mezcla con lo real. Los valores EUR (Comext) y USD (Comtrade) nunca se mezclan, ni se convierten. Cada fuente tiene su caché.
2. **Ausente ≠ cero.** Un indicador no calculable es «n.d.» con su motivo; el CAGR exige la serie completa y comparable. (Hasta el 06/11/2026: sin puntuación parcial.)
3. **Ausente ≠ cero.** Una celda sin dato es «no disponible» (`n.d.`), nunca 0. Una consulta vacía de Comext es «sin datos», no ceros. Las celdas confidenciales se omiten, no se imputan.
4. **Sin puntuación desde el 06/11/2026** (no superaba a reglas triviales; `docs/methodology.md`, «Historial»). Antes, **dos rankings (03–06/11/2026)**: «Mercados grandes» = percentil del tamaño; «Potencial de cuota» = percentil de la expansión de cuota. Percentiles sobre el universo de la búsqueda, calculados **antes** de filtrar. Sustituyen a la puntuación `0,35·tamaño + 0,30·crecimiento + 0,20·expansión + 0,15·exportadora`, cuyos pesos no estaban justificados: la validación histórica (`docs/methodology.md`, `docs/backtest-ranking.md`) mostró que el crecimiento pasado no anticipaba nada y que la mezcla rendía menos que sus componentes por separado.
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

Las reglas vigentes están en `CLAUDE.md` (cargado en cada sesión). Además:

- **Nombres:**
  - la app se llama «SmarTrade», el paquete `smartrade` y el repo `SmartTrade`;
  - las variables de entorno empiezan por `SMARTRADE_*`.
- **Variables de entorno** (README):
  - `SMARTRADE_DATA_MODE`
  - `CACHE_TTL_SECONDS` (3600 por defecto)
  - `DEFAULT_END_YEAR` (2024)
  - `COMEXT_BASE_URL`, `COMEXT_DATASET`, `COMEXT_WORLD_CODE`
  - `COMTRADE_API_KEY`, `COMTRADE_KEY_IN_QUERY`
  - `TAVILY_API_KEY`

  `.env` y `.env.local` están en `.gitignore`. `.env.example` y `.devcontainer/` se borraron a propósito.
- **Antes de usar datos reales:** `npm run verify:comext` / `verify:comtrade`. Códigos de salida: 0 coherente, 1 fallo, 2 no concluyente.

---

## 4. Riesgos conocidos del análisis de mercados

- **Caché en memoria:** se pierde al reiniciar y no se comparte entre instancias serverless; en Vercel puede significar más llamadas y más consumo del cupo de Comtrade. No hay `maxDuration` ni región configurados en Vercel y no se han verificado los límites del plan.
- **Cupo de Comtrade compartido** entre todos los visitantes de una web pública; si se agota, la app muestra error de límite.
- **Efecto Róterdam:** importaciones de Países Bajos/Bélgica incluyen tránsito y sobrevaloran la demanda final.
- **Crecimiento en valor, no en volumen** (los precios pueden explicar mucho; hay avisos pero no corrección). Un caso real: vino en Luxemburgo (CAGR 46 %) llegó al primer puesto.
- **Datos provisionales:** no se detecta provisionalidad; solo se bajan a calidad «media» los datos marcados como estimados.
- **Asimetrías bilaterales** entre lo que declara el exportador y el importador.
- **Percentiles dependen del universo:** puntuaciones de cargas distintas no son comparables.
- **El buscador no pide confirmar la interpretación** del texto del usuario antes de analizar.
- **Servicios de nombres:** proveedores fuera del catálogo llegan en inglés.


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

## 6. Próximos pasos posibles (propuesta, no decisión)

1. **Simulador, módulo 0625:**
   - RA6, supervisión y calidad (inventarios, exactitud del stock);
   - o el destino Marruecos con aduana, después de verificar sus autorizaciones.
2. **Normativa pendiente** (sección 0).
3. **Revisar la alerta de GitGuardian** en su panel.
4. **Actualizar dependencias de parche** (next 16.4.6, vitest 5.1.0), con la verificación completa.
5. **Análisis de mercados** (en mantenimiento):
   - Comtrade dentro de la app con clave real;
   - prueba de Comext con un sector de más de 10 productos.

---

## Apéndice: arranque rápido

```bash
npm ci
npm run dev                  # http://localhost:3000 (sin .env.local arranca en modo demo)
npm test && npm run typecheck && npm run build
SMARTRADE_DATA_MODE=comext npm run dev   # buscar: 220421, 150920
```
