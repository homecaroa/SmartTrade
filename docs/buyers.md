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

## Pistas con IA (Gemini) — añadido el 29/10/2026
Para ampliar a más productos y países sin curar a mano, un script pide a Gemini empresas candidatas y **nuestro código las comprueba**. La web nunca llama a Gemini: las listas se generan en lote desde tu equipo y se guardan como ficheros (`lib/buyers/ia-data/<HS6>-<PAIS>.json`, registrados en `index.ts`, ambos generados por el script).

```bash
GEMINI_API_KEY=... npm run buyers:generar -- --hs 220421 --pais DE [--max 15] [--dry]
```
Variables: `GEMINI_API_KEY` (obligatoria, solo en tu equipo), `GEMINI_MODEL` (opcional; por defecto `gemini-3.8-flash`, el que recomienda Google), `GEMINI_FALLBACK_MODEL` (opcional; por defecto `gemini-3.5-flash-lite`; `ninguno` lo desactiva), `GEMINI_TIMEOUT_S` (por intento; 90 por defecto), `GEMINI_BASE_URL` (para pruebas). Ante un fallo pasajero (429, 5xx, tiempo de espera) se reintenta una vez y, si persiste, se pasa al modelo de respaldo; el modelo realmente usado queda guardado en la lista. Los errores de clave o de modelo inexistente no se reintentan. El script muestra avances mientras trabaja. Se ejecuta con `npx tsx`, que **no** es dependencia del proyecto. Salida 0 correcto, 1 error, 2 uso incorrecto. Revisa la lista antes de commitearla.

### Qué hace
1. `ia/prompt.ts` construye el prompt (producto, país, idioma, reglas: no inventar, solo dominios conocidos con seguridad, nada de personas ni correos) y pide JSON con esquema.
2. `ia/gemini.ts` llama a la API **sin herramientas**.
3. `ia/audit.ts` lee la portada de cada web sugerida (con `fetchPageSafe`: robots.txt, sin hosts internos, límites). **Verificada** = la web responde, nombra a la empresa y menciona el producto. Si no, **pista sin verificar**: sin enlace a la web, sin pruebas y con el motivo. Una web que no nombra a la empresa nunca se enlaza; un dominio atribuido a varias empresas se detecta. Nombres 100 % genéricos («Wein & Vinos GmbH») exigen la frase completa en la página.
4. El nivel de evidencia sigue deduciéndose de las pruebas: una verificada es como mucho «comprador probable»; una pista es «evidencia insuficiente». **Nunca «confirmado»** (eso exige revisión humana, solo en datos curados).
5. El vínculo con España **no es un filtro**: se anota como señal (`en_web` si la web leída menciona España; `segun_ia` es la afirmación del modelo, sin comprobar).
6. Todo el informe y el CSV marcan el origen IA, el modelo, la fecha y la auditoría.

### Por qué SIN la búsqueda de Google (decisión)
Los [términos adicionales de la API de Gemini](https://ai.google.dev/gemini-api/terms) (leídos el 29/10/2026 con una herramienta que resume la página; **no** se ha leído el texto legal íntegro) dicen, para «Grounding with Google Search», que los resultados solo pueden mostrarse al usuario que envió el prompt, almacenarse hasta 2 años solo para fines concretos (no incluye publicar una lista curada), y no se pueden usar sus enlaces de forma programática para rastrear. Una lista generada en lote y publicada a todos los visitantes, con nuestro rastreador leyendo esos enlaces, **no encaja**. Sin esa herramienta no hay resultados de búsqueda que almacenar. Contrapartida: el modelo puede inventar, y por eso existe la auditoría. No hay ninguna vía para saltarse esos términos y no se busca.

### Riesgos abiertos (no resueltos, aceptados por el dueño el 29/10/2026)
- **Cláusula del EEE:** los términos indican que solo se usen «Paid Services» al poner un cliente de API a disposición de usuarios del EEE, Suiza o Reino Unido. Aquí los visitantes no usan la API y no hay clave en la web; la interpretación de que no aplica **no está confirmada con Google**. Pasar a nivel de pago lo cerraría (coste sin calcular).
- **Nivel gratuito:** Google puede usar lo enviado y revisores humanos pueden leerlo. Solo se envían producto y país, nunca datos personales.
- **Calidad sin búsqueda:** sin medir. La tasa real de empresas verificadas se conocerá con la primera ejecución real. Una lista generada por IA para vino en Alemania, comprobada a mano contra la web (6 de 10 empresas): varias existían, otras no se encontraron y el mismo dominio aparecía para cuatro empresas.
- **Forma de la respuesta de la API:** comprobada con la API real el 29/10/2026 (`steps[]` → paso `model_output` → `content[].text`), con una petición mínima y `gemini-3.5-flash-lite`. **Aún no** se ha ejecutado una generación completa con el prompt y el esquema reales.
- **Disponibilidad de modelos (observada el 29/10/2026 con una clave nueva, desde Windows):** `gemini-2.5-flash` → 404 «no longer available to new users»; `gemini-3.8-flash` → tiempos de espera y 503 repetidos, incluso con una petición mínima; `gemini-3.5-flash-lite` → respuesta en 3 s. Un modelo «lite» puede conocer menos empresas e inventar más: la auditoría lo contiene, pero conviene repetir con `gemini-3.8-flash` cuando responda y comparar.
- **Tavily** no se usa en esta parte. Sus términos (leídos el 29/10/2026) no prohíben guardar resultados, pero limitan el uso a «internal business purposes»: no está claro que cubra mostrarlos al público.

### Primera ejecución real (29/10/2026, vino HS 220421 en Alemania, `--dry`, desde Windows)
`gemini-3.8-flash` no respondió (503) y se usó el respaldo `gemini-3.5-flash-lite`. Pedidas hasta 15 empresas, **sugirió 5**:
- **Tesdorpf** → web verificada (la web la nombra, menciona el producto y España).
- **Hawesko** y **Wein & Vinos** → empresas reales, pero sus webs responden **403 a lecturas automáticas** (comprobado con nuestra identidad declarada). Quedan «sin verificar». **No se elude** la protección (ni cambiando la identidad del lector): una persona puede abrirlas. Desde ese día el motivo lo dice así en vez de «no respondió correctamente».
- **Meridian Wine** y **Gutmann Wein** → sin web; una búsqueda no encontró ninguna empresa alemana con esos nombres (sí una distribuidora sudafricana «Meridian Wine Merchants»). Muy probablemente **inventadas**; la auditoría las dejó como pistas sin verificar, que es lo previsto.
Lectura: con el modelo ligero, rendimiento bajo (1 verificada de 5). Las 2 sin web resultaron inventadas, pero con 2 casos no es una regla. Pendiente: repetir con `gemini-3.8-flash` cuando responda y comparar.
