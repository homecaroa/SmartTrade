# Importadores y compradores (módulo piloto)

Dado un producto HS6 y un país de destino, muestra empresas con **pruebas enlazadas** de que importan, distribuyen o compran ese tipo de producto, para que una pyme valore contactarlas. Las estadísticas de importación de un país **no son un registro de compradores**: ninguna empresa se presenta como compradora asegurada.

## Niveles de evidencia (se deducen de las pruebas, no se escriben a mano)
- **Importador confirmado:** una página leída de la propia empresa afirma que importa o distribuye el producto.
- **Comprador probable:** solo fuentes secundarias (listado oficial, directorio, prensa) o un extracto de su web.
- **Evidencia insuficiente:** ninguna fuente fiable afirma que trate con el producto, o solo ofertas de empleo.
- «Producto español verificado» exige una fuente primaria u oficial; un directorio no basta.
- Los resultados de **búsqueda automática nunca superan «probable»** (extracción sin revisión humana).

## Arquitectura (`lib/buyers/`)
- `types.ts`: esquemas Zod. Un correo o teléfono solo se admite con la URL pública donde aparece; no se aceptan correos personales; una persona exige fuente.
- `providers/`: proveedores de búsqueda intercambiables (`SearchProvider`). Hoy, Tavily (`tavily.ts`).
- `fetch-page.ts`: descarga de páginas públicas con robots.txt, sin hosts internos (SSRF), con tiempo y tamaño limitados.
- `extract.ts`: señales de una página (producto, importación/distribución, correos genéricos, teléfonos etiquetados, enlace de contacto).
- `rules.ts`: clasificación de evidencia, descarte de brokers de datos (ZoomInfo, Prospeo, ImportGenius, Panjiva…) y ofertas de empleo, deduplicación, filtros.
- `curated/wine-jp.ts`: conjunto curado a mano (datos reales con fuente) del piloto.
- `service.ts`: combina curado + búsqueda en vivo (si hay clave), con caché y límites (3 consultas, 6 páginas leídas por búsqueda).
- Interfaz: `/compradores` (filtros por tipo y evidencia) y `/api/buyers/export` (CSV; es la forma de «guardar» resultados: no hay base de datos).

## Fuentes y condiciones
- **Prioridad:** webs corporativas, listados oficiales (cancillerías, JETRO), ferias, asociaciones y directorios fiables.
- **Descartado:** brokers de datos (infieren correos y exponen datos personales) y ofertas de empleo como prueba.
- Se respeta robots.txt; no se eluden bloqueos. Solo datos empresariales públicos y solo con su fuente.
- Antes de escribir a nadie, revisa la normativa de comunicaciones comerciales y protección de datos aplicable (p. ej. RGPD y leyes antispam). No es asesoramiento legal.

## Búsqueda en vivo: qué falta y coste previsto
- Sin clave, el módulo funciona solo con datos curados. Para activar la búsqueda en vivo: variable de servidor **`TAVILY_API_KEY`** (Vercel → Environment Variables → Redeploy). Nunca se expone al navegador.
- **Tavily** (contrato verificado en su documentación el 27/10/2026): `POST https://api.tavily.com/search`, cabecera `Authorization: Bearer`; plan gratuito declarado de **1.000 créditos al mes sin tarjeta**, una búsqueda básica = 1 crédito. Con 3 consultas por búsqueda no cacheada son unas 330 búsquedas al mes; la caché (1 h) reduce el consumo. Condiciones y precios de pago: comprobar en su web.
- **Alternativa (Brave Search API):** las fuentes consultadas se contradicen (de unos 5 USD por 1.000 consultas con crédito mensual y tarjeta obligatoria, a un plan gratuito ya retirado). No se ha integrado; si se añade, basta con otro adaptador de `SearchProvider`.
- **La integración con Tavily no se ha probado con una clave real**: solo con respuestas simuladas.

## Resultado real del piloto: vino embotellado (HS 220421) en Japón
Investigación manual del 28/10/2026 (unas 10 búsquedas web y lectura de 4 páginas públicas). Resultado:
- **9 empresas** incluidas: **2 importadores confirmados** (Mikuni Wine y Nihon Shurui Hanbai), con web oficial, vinos españoles en su catálogo o comunicados y **formulario de contacto oficial**; Mikuni además con teléfono de ventas publicado en su web.
- **7 compradores probables** (Para Japan, Ornis, Pieroth Japan, Mottox, Enoteca, Yamaya, Kokubu) sin contacto verificado.
- **Con evidencia suficiente y contacto verificable: 2 de 9.** Correos comerciales públicos verificados: **0**. Personas con nombre y cargo con fuente fiable: **0**.
- Los resultados del buscador estaban dominados por portales de empleo, agregadores y brokers de datos (descartados). Dos candidatas más (SARA Corporation, Ole Japan) aparecían solo en un agregador sin URL propia utilizable y se excluyeron.
- El listado oficial de la cancillería argentina es de importadores de vino **argentino**: prueba actividad con vino, no con vino español.
- Mikuni Wine es filial al 100 % del grupo español C.V.N.E. (prensa del sector): puede priorizar la cartera del grupo.
- No es un estudio exhaustivo: no se consultaron directorios de ferias (p. ej. Foodex) ni asociaciones del sector.

## Limitaciones y siguientes pasos
- Datos curados solo para HS 220421 en Japón; los demás productos y países dependen de la búsqueda en vivo (sin probar con clave real).
- Las consultas en vivo usan términos en inglés; faltan términos en el idioma del país.
- Revisar los datos curados periódicamente: las webs cambian.
- Siguientes pasos: probar Tavily con clave real en 3 combinaciones; añadir directorios de ferias y asociaciones como fuentes; revisión humana antes de publicar nuevos conjuntos curados.
