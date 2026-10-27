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

## Sectores y puntos de entrada
- `lib/config/sectors.ts` agrupa códigos del catálogo en sectores (`sector:<id>` en la consulta). Para añadir un sector basta con un objeto nuevo; las pruebas exigen que sus códigos existan en el catálogo, no se repitan y no superen el máximo por búsqueda.
- La portada ofrece dos caminos: «Tengo un producto» (búsqueda por nombre o código) y «Quiero descubrir sectores». La puntuación de un sector compara solo entre sus productos.

## Comparador de mercados
- `/comparar?id=<id>&id=<id>[&q=<búsqueda>]`: la tabla del ranking es un formulario GET con casillas (sin JavaScript ni almacenamiento); la comparación se recalcula con el mismo universo de percentiles de la búsqueda (`getComparison` en `lib/service.ts`). La lógica de validación y filas está en `lib/compare.ts` (2–5 resultados, mismo año final, datos ausentes como «n.d.»).

## Selector de fuente (UE / fuera de la UE)
`?fuente=fuera` se resuelve en `getConfig(env, fuente)` (`lib/config/index.ts`): concede el modo `comtrade` solo con `SMARTRADE_DATA_MODE=comext` y clave de Comtrade (`outsideAvailable`). Las páginas y rutas `/api` construyen su configuración con ese parámetro y lo propagan en enlaces y formularios. Cada fuente tiene su caché (clave con el modo) y su universo de percentiles.

## Guía de transporte e Incoterms
`/logistica` (`lib/logistics/incoterms.ts`, `app/logistica/page.tsx`): modos de transporte descritos cualitativamente y tabla de las 11 reglas Incoterms® 2020 (entrega, riesgo, transporte, seguro y despacho de exportación e importación). Es un resumen parafraseado, sin tarifas, plazos ni costes, enlazado desde el paso «Transporte, seguro y plazos» de cada ficha. Una calculadora de coste puesto en destino queda pendiente: solo tendría sentido con datos aportados por el usuario.
