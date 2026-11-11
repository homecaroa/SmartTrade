# SmarTrade — cómo se trabaja aquí

Alcance: esta sesión trabaja **solo** sobre el repo `homecaroa/SmartTrade`. Otros repos de la cuenta no se tocan salvo orden expresa. Contexto completo, estado y pendientes: `HANDOFF.md`.

## Reglas del proyecto (extraídas de los docs; ver HANDOFF.md §3)

- **Honestidad sobre la verificación.** Nada se escribe como «verificado» sin haberlo ejecutado. Los fixtures de tests son simulados y no prueban que la API real use esos ids.
- **Lo sintético siempre etiquetado** (DEMO en UI, `SI_DEMO_SINTETICO` en CSV). EUR (Comext) y USD (Comtrade) no se mezclan ni se convierten.
- **Ausente ≠ cero.** Dato ausente = `n.d.` con su motivo. Desde el 06/11/2026 no hay puntuación: indicadores descriptivos en su unidad, ordenados solo dentro de un producto (ver `docs/methodology.md`).
- **Claves de API solo en servidor**; nunca en el navegador ni en mensajes de error.
- **Sin base de datos**: caché TTL en memoria; «guardar» = CSV.
- **Cambios de metodología** se documentan en `docs/methodology.md` (problema, corrección, resultado medido). Los umbrales salen de una medición o se declaran «decisión documentada, no estimada».
- **Sin promesas** en textos de la app: los indicadores y avisos no son recomendaciones ni previsiones.
- **Gemini siempre SIN la herramienta de búsqueda de Google** y nunca se publican sus resultados de búsqueda: los términos lo restringen (ver `docs/buyers.md`). Las listas de IA llevan siempre origen, modelo, fecha y «sin verificar» si no se comprobó.
- **Modo Aprendizaje** (portada `/` desde el 09/11/2026; casos en `/aprendizaje/…`; `lib/learning`): separado del análisis (que está en `/mercados`), sin red y sin azar no reproducible (azar solo con semilla: misma semilla y mismas decisiones → mismo resultado; decisión del dueño, 09/11/2026), todo dato inventado etiquetado como simulado. El Business Simulator (`/simulador`, `lib/sim`; temporada de 26 semanas jugable) sigue las reglas de `docs/simulador.md`. Ver `docs/aprendizaje.md` y, para el currículo oficial que cubre, `docs/curriculo.md`.
- **Datos guardados** (`data/snapshots`): los genera `npm run datos:actualizar` (cada dos meses vía GitHub Actions → PR). No se editan a mano. Ver `docs/data-sources.md`.
- **No instalar dependencias** sin justificación técnica clara.
- Español en UI, código comentado y docs.

## Verificar antes de dar algo por terminado

```bash
npm test && npm run typecheck && npm run build
```

Estado confirmado el 11/11/2026: 559 pruebas correctas (44 archivos), `tsc` y `build` sin errores. Antes de usar datos reales: `npm run verify:comext` / `verify:comtrade` (salida 0 coherente, 1 fallo, 2 no concluyente).

## Ritmo

Diagnosticar antes de arreglar; cambios mínimos; commit en español explicando la decisión; actualizar `PROGRESS.md` al terminar un encargo.

Al terminar y verificar un encargo: commit, push, **PR y fusión a `main` sin preguntar** (decisión del dueño, 04/11/2026: quiere ver los cambios en cuanto acaban). Si el encargo dice «no fusiones» o «espera mi revisión», eso manda.

## Archivos borrados a propósito

`.env.example`, `.devcontainer/` y `scripts/verify-comtrade-peso.mjs` / `verify-comtrade-detalle.mjs` se eliminaron (pruebas o duplicados, según el dueño). No recrearlos; si README o docs los citan, la referencia es la que sobra.
