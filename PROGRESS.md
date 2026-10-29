# PROGRESS — SmarTrade

## Estado real de la integración de datos
| Fuente | Estado |
|---|---|
| DEMO (sintético) | Funciona; siempre etiquetado. |
| Eurostat Comext | **Verificado de principio a fin con datos reales** (18/10/2026): `verify:comext` y la app en modo `comext` con `220421, 150920` → 49 oportunidades válidas, 1 incompleta. Los códigos HS6 siguen la nomenclatura de cada año (150910 no existe desde HS2022). Pendiente: más productos, Grecia (`EL`), indicadores de estado. |
| UN Comtrade | Opcional, sin clave ni llamadas reales. |

## Añadido el 29/10/2026 (pendiente de la primera ejecución real)
- **Pistas de empresas con IA** (`lib/buyers/ia/`, `npm run buyers:generar`): Gemini sin búsqueda de Google + auditoría que lee cada web. Dos niveles en la web y el CSV: «web verificada» y «pista sin verificar». Detalle, decisiones y riesgos en `docs/buyers.md`. **Falta:** ejecutarlo con una clave real, medir la tasa de verificadas con la lista de vino en Alemania y revisar los términos del EEE.

## Completado
- MVP completo en modo demo (buscador, ranking explicable, filtros, detalle, gráficos, trazabilidad, CSV, errores/carga/vacío, caché, avisos).
- Comext: manejo de respuesta asíncrona (reintentos) y de consultas vacías («No results»), errores con la etiqueta de Eurostat, supuestos centralizados en `COMEXT` (`lib/sources/comext.ts`).
- Comtrade: troceo de consultas, límite `maxrecords`, rechazo de respuestas truncadas, clave por cabecera (o query opcional), nunca en errores.
- `verify:comext` y `verify:comtrade`: diagnóstico de DNS/red/HTTP/asíncrono/formato, códigos de salida 0/1/2, sin secretos.
- Calidad de datos: validación de esquema de entrada (negativos descartados), año posterior al último año completo rechazado, casos límite probados.
- Renombrado a SmarTrade.

## Pruebas (ejecutadas)
- `npm test`: 9 archivos, 94/94 correctas · `typecheck` y `build` sin errores.
- App compilada en modo demo: `/` → 200; `/api/opportunities` → 76 oportunidades válidas.
- `verify:comext` y `verify:comtrade` sin red → «DNS: no se resuelve el host» (diagnóstico correcto). `verify:comext` contra servidor simulado → códigos 0/1/2 según el caso (en `tests/comext-adapter.test.ts`).
- Detalle en `docs/testing.md`. Los servidores/fixtures de Comext son **simulados**.

## Bloqueos reales
1. Mi entorno de desarrollo no tiene red: las comprobaciones reales las ejecuta el usuario en su PC.
2. Alerta de GitGuardian (19/10/2026) sobre el repo `homecaroa/SmartTrade`: pendiente de revisar qué archivo marca (probable falso positivo en claves ficticias de pruebas).
2. UN Comtrade requiere clave propia (opcional).

## Siguiente tarea
1. Revisar la alerta de GitGuardian (archivo marcado; si es un valor de prueba, marcarlo como falso positivo).
2. Ver la web: Codespaces (configuración `.devcontainer` incluida, sin probar en GitHub), en local (`npm run dev`) o desplegar en Vercel con `SMARTRADE_DATA_MODE=comext`.
3. Ampliar la prueba real a 10+ productos para que la posición exportadora sea informativa; añadir un catálogo de productos o categorías HS2/HS4.
