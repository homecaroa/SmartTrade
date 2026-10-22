# Arquitectura

Next.js (App Router) + TypeScript estricto + Tailwind 4 + Recharts + Zod + Vitest. Sin base de datos: consulta a fuente, procesamiento en servidor y caché en memoria.

## Flujo de datos
```
Página / API  →  lib/service.ts
                   ├─ getOrLoad (lib/cache, TTL)  →  TradeSource.fetchData (demo | comext | comtrade)
                   │      └─ safeFetchJson: timeout 25 s, límite 20 MB, errores tipificados (SourceError)
                   ├─ buildOpportunities (lib/trade): dedupe → índice → compatibilidad → indicadores → puntuación
                   └─ rankOpportunities: filtros + orden (desempate por id)  →  paginación / CSV
```
- Todas las llamadas externas ocurren en el servidor; las claves nunca llegan al cliente.
- Contrato interno: `TradeObservation` (`lib/schemas/trade.ts`) con `currency` y `synthetic` además de los campos de la spec.
- Las páginas son componentes de servidor (búsqueda por GET); solo los gráficos son cliente.
- Caché: clave por modo+años+códigos. Si la fuente falla y hay entrada caducada se sirve marcada como obsoleta, con su antigüedad; sin entrada se muestra el error.
- La caché es en memoria por proceso: en despliegues serverless se reinicia con frecuencia (ver limitaciones).
