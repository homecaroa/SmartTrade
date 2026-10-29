# SmarTrade (MVP)

Análisis de oportunidades comerciales producto-mercado para empresas españolas exportadoras, a partir de estadísticas de comercio internacional. Ranking con puntuación explicable, ficha de detalle, gráficos, trazabilidad de datos y exportación CSV.

**Estado honesto:** funciona de extremo a extremo con datos de **demostración sintéticos** (`demo`) y con **datos reales de Eurostat Comext** (`comext`, verificado el 18/10/2026 con `220421, 150920`: 49 oportunidades en 26 mercados UE). UN Comtrade está implementado pero **sin probar** (requiere clave). Ver `docs/data-sources.md` y `docs/limitations.md`. Es una app Next.js con servidor: **no se ejecuta en GitHub Pages**; hay que ejecutarla en local o desplegarla (p. ej. Vercel).

## Requisitos
Node.js 20+ y npm.

## Instalación y ejecución
```bash
npm install
cp .env.example .env.local        # opcional; por defecto SMARTRADE_DATA_MODE=demo
npm run dev                       # http://localhost:3000
npm test                          # pruebas (Vitest)
npm run typecheck && npm run build
```

## Verla funcionando desde GitHub (Codespaces)
GitHub Pages solo sirve páginas estáticas y SmarTrade necesita servidor, pero puedes ejecutarla en la nube desde tu repositorio:
1. Sube el proyecto a GitHub (incluida la carpeta oculta `.devcontainer`).
2. En el repositorio: botón verde **Code → Codespaces → Create codespace on main**.
3. Espera a que se instale y compile (1–3 min). Se abre sola una pestaña con la web; si no, pestaña **Ports → puerto 3000 → icono del globo**.
4. Arranca en modo `comext` (datos reales de Eurostat): escribe `220421, 150920` en el buscador.
La URL del puerto es privada para tu cuenta. Codespaces tiene una cuota gratuita mensual limitada; **detén el codespace** cuando termines (Code → Codespaces → ⋯ → Stop).
Para una URL pública permanente haría falta desplegarla (p. ej. Vercel).

## Modos de datos (`SMARTRADE_DATA_MODE`)
| Modo | Fuente | Notas |
|---|---|---|
| `demo` (defecto) | Datos sintéticos deterministas | Siempre etiquetados como DEMO. No son estadísticas. |
| `comext` | Eurostat Comext | Sin clave. Solo mercados UE como declarantes. Introduce códigos HS6 en el buscador. **Documentación contrastada, API sin ejecutar con datos reales: verificar antes de usar.** |
| `comtrade` | UN Comtrade | **Opcional.** Requiere `COMTRADE_API_KEY` (solo servidor). Valores en USD. No verificado. Sin clave, los demás modos no se ven afectados. |

### Verificar las fuentes (necesita internet) — PASO IMPRESCINDIBLE ANTES DE USAR DATOS REALES
```bash
npm run verify:comext      # Eurostat Comext: red, HTTP, asíncrono (413), errores, dimensiones y códigos
npm run verify:comtrade    # UN Comtrade: vista previa sin clave; con COMTRADE_API_KEY prueba también el endpoint con clave
```
Códigos de salida: `0` coherente · `1` fallo/discrepancia (dice qué corregir) · `2` no concluyente (respuesta asíncrona de Eurostat: repetir). No imprimen claves. Pega la salida completa para corregir los adaptadores. Tras `verify:comext` correcto:
```bash
SMARTRADE_DATA_MODE=comext npm run dev    # en el buscador: 220421, 150920 (códigos HS6 vigentes en HS2022)
```

## Variables de entorno
Ver `.env.example`: `SMARTRADE_DATA_MODE`, `CACHE_TTL_SECONDS`, `DEFAULT_END_YEAR`, `COMEXT_BASE_URL`, `COMEXT_DATASET`, `COMEXT_WORLD_CODE`, `COMTRADE_API_KEY`, `COMTRADE_KEY_IN_QUERY`. Ninguna se expone al navegador.

## Estructura
`app/` páginas y rutas API · `components/` UI · `lib/schemas` contratos Zod · `lib/sources` adaptadores · `lib/trade` normalización, oportunidades, ranking, CSV · `lib/scoring` indicadores y puntuación · `lib/cache` caché TTL · `tests/` · `docs/`.

## API
`GET /api/opportunities` · `GET /api/opportunities/[id]` · `GET /api/opportunities/export` (CSV) · `GET /api/filters`.
Parámetros: `q, market, year, minSize (millones), minGrowth (%), sort (score|size|growth), order, page, pageSize`.

## Documentación
`docs/architecture.md`, `docs/data-sources.md`, `docs/methodology.md`, `docs/testing.md`, `docs/limitations.md`, `docs/aprendizaje.md` (Modo Aprendizaje: simulador educativo con datos simulados, en `/aprendizaje`).
