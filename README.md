# SmarTrade (MVP)

**Desde el 09/11/2026 la portada (`/`) es el Modo Aprendizaje**, un simulador educativo para el Grado Superior de Comercio Internacional (exportación, importación y negociación). El análisis de mercados está en `/mercados`; las URLs antiguas de búsqueda (`/?q=…`) redirigen allí con la consulta intacta. El **Business Simulator** (`/simulador`) es una temporada de 26 semanas dirigiendo un operador logístico ficticio; sus reglas están en `docs/simulador.md`.

Diagnóstico descriptivo de mercados de exportación para empresas españolas, a partir de estadísticas oficiales de comercio exterior: por producto, cuánto importa cada mercado, cómo ha evolucionado, qué parte llega desde España y quién más lo abastece. Indicadores en su unidad, sin puntuación ni previsiones (la puntuación se retiró el 06/11/2026: ver `docs/methodology.md`). Ficha por mercado, comparación, gráficos con tabla, trazabilidad de datos y exportación CSV.

**Estado honesto:** funciona de extremo a extremo con datos de **demostración sintéticos** (`demo`) y con **datos reales de Eurostat Comext** (`comext`, verificado el 18/10/2026 con `220421, 150920`: 49 oportunidades en 26 mercados UE). UN Comtrade se probó a mano con una clave real el 25–26/10/2026, pero **no dentro de la aplicación** (requiere clave). Ver `docs/data-sources.md` y `docs/limitations.md`. Es una app Next.js con servidor: **no se ejecuta en GitHub Pages**; hay que ejecutarla en local o desplegarla (p. ej. Vercel).

## Requisitos
Node.js 20+ y npm.

## Instalación y ejecución
```bash
npm install
npm run dev                       # http://localhost:3000
npm test                          # pruebas (Vitest)
npm run typecheck && npm run build
```

## Verla funcionando
Necesita servidor (no sirve GitHub Pages): en local con `npm run dev` o desplegada (Vercel).

## Modos de datos (`SMARTRADE_DATA_MODE`)
| Modo | Fuente | Notas |
|---|---|---|
| `demo` (defecto) | Datos sintéticos deterministas | Siempre etiquetados como DEMO. No son estadísticas. |
| `comext` | Eurostat Comext | Sin clave. Solo mercados UE como declarantes. Introduce códigos HS6 en el buscador. **Verificado con datos reales el 18/10/2026** (`220421, 150920`); verificar de nuevo antes de usar (`npm run verify:comext`). |
| `comtrade` | UN Comtrade | **Opcional.** Requiere `COMTRADE_API_KEY` (solo servidor). Valores en USD. Probado a mano con clave real (25–26/10/2026); no dentro de la app. Sin clave, los demás modos no se ven afectados. |

### Verificar las fuentes (necesita internet) — PASO IMPRESCINDIBLE ANTES DE USAR DATOS REALES
```bash
npm run verify:comext      # Eurostat Comext: red, HTTP, asíncrono (413), errores, dimensiones y códigos
npm run verify:comtrade    # UN Comtrade: vista previa sin clave; con COMTRADE_API_KEY prueba también el endpoint con clave
```
Códigos de salida: `0` coherente · `1` fallo/discrepancia (dice qué corregir) · `2` no concluyente (respuesta asíncrona de Eurostat: repetir). No imprimen claves. Pega la salida completa para corregir los adaptadores. Tras `verify:comext` correcto:
```bash
SMARTRADE_DATA_MODE=comext npm run dev    # en el buscador: 220421, 150920 (códigos HS6 vigentes en HS2022)
```

## Datos guardados (actualización bimensual)
En modos reales, la web usa primero los datos guardados en `data/snapshots/` y solo consulta en vivo lo que falte. Se actualizan cada dos meses con GitHub Actions, que abre un PR para revisarlos (`npm run datos:actualizar` para hacerlo a mano). Detalle y requisitos en `docs/data-sources.md`.

## Variables de entorno
`SMARTRADE_DATA_MODE`, `CACHE_TTL_SECONDS`, `DEFAULT_END_YEAR`, `COMEXT_BASE_URL`, `COMEXT_DATASET`, `COMEXT_WORLD_CODE`, `COMTRADE_API_KEY`, `COMTRADE_KEY_IN_QUERY`. Ninguna se expone al navegador.

## Estructura
`app/` páginas y rutas API · `components/` UI · `lib/schemas` contratos Zod · `lib/sources` adaptadores · `lib/trade` normalización, indicadores por mercado, ordenación, lectura del mercado, revisiones HS, CSV · `lib/scoring/indicators.ts` fórmulas (CAGR, cuota…) · `lib/cache` caché TTL · `tests/` · `docs/`.

## API
`GET /api/opportunities` · `GET /api/opportunities/[id]` · `GET /api/opportunities/export` (CSV) · `GET /api/filters`.
Parámetros: `q, producto, market, year, minSize (millones), minGrowth (%), sort (valor|crecimiento|peso|espana), order, page, pageSize`. Los enlaces antiguos con `sort=score|size|volumen|potencial` se leen como `valor`, y `growth` como `crecimiento`.

## Documentación
`docs/architecture.md`, `docs/data-sources.md`, `docs/methodology.md`, `docs/testing.md`, `docs/limitations.md`, `docs/aprendizaje.md` (Modo Aprendizaje: simulador educativo con datos simulados, portada de la web desde el 09/11/2026), `docs/curriculo.md` (currículo oficial del ciclo y qué cubre el simulador).
