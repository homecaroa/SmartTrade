# SmarTrade — cómo se trabaja aquí

Alcance: esta sesión trabaja **solo** sobre el repo `homecaroa/SmartTrade`. Otros repos de la cuenta no se tocan salvo orden expresa. Contexto completo, estado y pendientes: `HANDOFF.md`.

## Reglas del proyecto (extraídas de los docs; ver HANDOFF.md §3)

- **Honestidad sobre la verificación.** Nada se escribe como «verificado» sin haberlo ejecutado. Los fixtures de tests son simulados y no prueban que la API real use esos ids.
- **Lo sintético siempre etiquetado** (DEMO en UI, `SI_DEMO_SINTETICO` en CSV). EUR (Comext) y USD (Comtrade) no se mezclan ni se convierten.
- **Ausente ≠ cero.** Dato ausente = `n.d.`; la oportunidad con datos faltantes es «incompleta» y no puntúa. Sin puntuación parcial ni redistribución de pesos.
- **Claves de API solo en servidor**; nunca en el navegador ni en mensajes de error.
- **Sin base de datos**: caché TTL en memoria; «guardar» = CSV.
- **Cambios de metodología** se documentan en `docs/methodology.md` (problema, corrección, resultado medido). Los umbrales salen de una medición o se declaran «decisión documentada, no estimada».
- **Sin promesas** en textos de la app: las etiquetas y la puntuación no son recomendaciones.
- **Gemini siempre SIN la herramienta de búsqueda de Google** y nunca se publican sus resultados de búsqueda: los términos lo restringen (ver `docs/buyers.md`). Las listas de IA llevan siempre origen, modelo, fecha y «sin verificar» si no se comprobó.
- **Modo Aprendizaje** (`/aprendizaje`, `lib/learning`): separado del análisis, sin red ni azar, todo dato inventado etiquetado como simulado. Ver `docs/aprendizaje.md`.
- **Datos guardados** (`data/snapshots`): los genera `npm run datos:actualizar` (cada dos meses vía GitHub Actions → PR). No se editan a mano. Ver `docs/data-sources.md`.
- **No instalar dependencias** sin justificación técnica clara.
- Español en UI, código comentado y docs.

## Verificar antes de dar algo por terminado

```bash
npm test && npm run typecheck && npm run build
```

Estado confirmado el 30/10/2026: 354 pruebas correctas, `tsc` y `build` sin errores. Antes de usar datos reales: `npm run verify:comext` / `verify:comtrade` (salida 0 coherente, 1 fallo, 2 no concluyente).

## Ritmo

Diagnosticar antes de arreglar; cambios mínimos; commit en español explicando la decisión; actualizar `PROGRESS.md` al terminar un encargo.

## Archivos borrados a propósito

`.env.example`, `.devcontainer/` y `scripts/verify-comtrade-peso.mjs` / `verify-comtrade-detalle.mjs` se eliminaron (pruebas o duplicados, según el dueño). No recrearlos; si README o docs los citan, la referencia es la que sobra.
