# Pruebas

Ejecutadas realmente en el entorno de desarrollo (Node 22, Vitest 5): `npm test` → **9 archivos, 94 pruebas, todas correctas**. `npm run typecheck` y `npm run build` sin errores.

| Archivo | Pruebas | Cubre |
|---|---|---|
| `indicators.test.ts` | 8 | CAGR (y valor inicial cero), variaciones, cuota, concentración, valor unitario |
| `score.test.ts` | 9 | percentiles, winsorización, ponderación, crecimiento negativo, sin exportación española, reproducibilidad |
| `normalize.test.ts` | 6 | duplicados, compatibilidad (clasificación, moneda, producto, sintético/real), esquema |
| `opportunities.test.ts` | 13 | no hay puntuación con datos faltantes, filtros, ordenación, CSV |
| `quality.test.ts` | 14 | casos límite: valor final cero, España > total, cuota 0 observada, exportación 0, `unavailable`, estimados, monedas, series de 2 años, cambio de revisión HS, sin cobertura, empates, valores negativos |
| `sources.test.ts` | 11 | JSON-stat controlado, Comtrade controlado, errores HTTP/red/JSON, caché obsoleta, separación real/sintético |
| `comext-adapter.test.ts` | 12 | clasificación de respuestas oficiales (datos/vacío/413/errores), reintentos asíncronos, URLs filtradas con el formato documentado, GR→EL, celdas ausentes ≠ 0, proveedores, **scripts `verify:comext` contra servidor simulado** (códigos 0/1/2) |
| `comtrade-adapter.test.ts` | 5 | sin clave no llama a la red, clave por cabecera/query y nunca en errores, truncado, troceo, filas ignoradas |
| `integration.test.ts` | 13 | flujo completo en demo, filtros, paginación, detalle, errores en modos reales, aviso de universo pequeño, año incompleto |

**Importante:** los servidores y fixtures de `tests/helpers/mock-comext.ts` son **simulados** (valores sintéticos y los supuestos del adaptador). Prueban nuestro código, no que la API real use esos ids.

## Comprobaciones manuales (modo demo, app compilada)
`/`, `/oportunidad/{id}`, `/metodologia` → 200; `/api/opportunities` → ranking; parámetros inválidos → 400; CSV filtrado con marca `SI_DEMO_SINTETICO`; estado vacío. `npm run verify:comext` sin red → diagnóstico «DNS: no se resuelve el host», código 1 (ejecutado aquí).

## No cubierto
Llamadas reales a Comext/Comtrade, pruebas de interfaz en navegador, pruebas de carga.

## Ejecución real de `verify:comext` (PC del usuario, 18/10/2026)
HTTP 200 y JSON-stat reales; dimensiones, `WORLD`, `ES`, flujos 1/2 e indicadores confirmados. Con 150910 y 2022–2023 devolvió `value:{}` porque el código ya no existe en HS2022 (con 2021 sí devolvió valores). Con 220421 (2023) devolvió valores. El script se amplió para probar códigos vigentes y eliminados.

## Ejecución real de la app en modo `comext` (PC del usuario, 18/10/2026)
`SMARTRADE_DATA_MODE=comext`, búsqueda `220421, 150920`: `/api/opportunities` devolvió `validCount: 49`, `incompleteCount: 1`, `pairsWithoutData: 2`, `synthetic: false`, fuente «Eurostat Comext». Auditoría de los resultados: valores y cuotas plausibles; hallazgos corregidos (peso con error de coma flotante, aviso de pocos productos, lista de pares sin datos, nombres largos en la tabla).

## Búsqueda por nombre (`tests/product-search.test.ts`)
Valida el catálogo (códigos HS6 únicos), la búsqueda por nombre (acentos, plurales, todas las palabras), la mezcla de códigos, prefijos y nombres, y el límite de 20 códigos. Total actual: 101 pruebas en 10 archivos.
