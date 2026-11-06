# Limitaciones conocidas

1. **Datos oficiales reales parcialmente verificados.** La API de Comext responde con valores reales y las dimensiones, `WORLD`, flujos e indicadores están confirmados; la app completa en modo `comext` se ejecutó con datos reales (49 oportunidades, 2 productos). Faltan más productos y los indicadores de estado. Grecia resuelta el 30/10/2026: Comext la publica como `GR`, no `EL`. Comtrade (opcional) no se ha probado: necesita clave.
2. **Comext solo cubre mercados UE.** Mercados no UE requieren Comtrade (USD).
3. **Catálogo de productos:** no hay catálogo HS ni categorías agregadas. En modos reales hay que introducir códigos HS6 (máx. 20). Los nombres vienen de la etiqueta de la fuente.
4. **Cambios de revisión HS:** desde el 06/11/2026 las ventanas que cruzan 2017/2022 se unen solo para los códigos HS6 del catálogo que no cambiaron según la tabla de correlación de la OMA (`lib/trade/hs-revisions.ts`); los que cambiaron y los NC8 quedan incompletos, con explicación. Los códigos que no están en el catálogo tampoco se unen.
5. **Origen único:** solo España.
6. **Caché en memoria:** se pierde al reiniciar y no se comparte entre instancias serverless.
7. **Sin puntuación** (retirada el 06/11/2026; ver docs/methodology.md). Los indicadores son descriptivos y no recomiendan mercados.
8. **Proveedores:** en Comtrade solo se muestran proveedores presentes en el catálogo de mercados.
9. **Sin costes logísticos, aranceles ni barreras:** solo enlaces a Access2Markets/ICEX.
10. **(Resuelto el 06/11/2026)** Los percentiles dependían del universo de la búsqueda; ya no existen y cada indicador se calcula con los datos de su producto y mercado.
11. **Navegador:** se comprueba con Playwright contra `next start` en cada encargo grande (ver docs/testing.md); no hay pruebas de UI automáticas en `npm test`.
12. **Demo:** los valores sintéticos no reflejan la realidad; los nombres de producto son descriptores abreviados.
13. **Ausente ≠ cero, pero también ≠ comercio nulo:** si España no figura como socio de un mercado en un producto, la participación queda *no disponible* («n.d.») y se explica; el resto de indicadores del mercado se muestran. En estadísticas aduaneras una ausencia puede significar comercio nulo o confidencial; no se distingue todavía.
14. **Valoración:** exportaciones (FOB) e importaciones (CIF) no son comparables; la cuota usa solo importaciones declaradas por el mercado de destino (CIF) frente a su total (CIF), y las exportaciones españolas (FOB) se muestran solo como dato informativo, sin compararlas.
15. **Datos provisionales:** Eurostat/Comtrade pueden revisar los últimos años; el año máximo permitido es el último año natural completo, sin detectar indicadores de provisionalidad.
16. **Asimetrías bilaterales** (documentadas por Comtrade): lo que España declara exportar no coincide con lo que el mercado declara importar de España.
17. **Datos confidenciales:** celdas con indicador de confidencialidad se omiten (no se imputan).
18. **Códigos HS y revisiones:** los códigos deben existir en la nomenclatura del año consultado (HS2022 desde 2022). No hay tabla de correspondencias entre revisiones: un código eliminado (p. ej. 150910) devuelve vacío y la app avisa «Sin datos para…». Las ventanas que cruzan HS2017/HS2022 se unen solo para códigos sin cambios (punto 4).
19. **(Resuelto el 06/11/2026)** El percentil exportador desapareció con la puntuación.
20. **Efecto Róterdam:** las importaciones de Países Bajos, Bélgica y otros puntos de entrada incluyen mercancía en tránsito que se reexporta; el tamaño de esos mercados puede estar sobrevalorado como demanda final.
21. **Crecimiento en valor y en volumen:** el CAGR principal es en valor; los precios (p. ej. aceite de oliva 2023–2024) pueden explicar buena parte. Se muestra también el CAGR del peso neto y un aviso de «posible efecto precio».
22. **España como país de expedición:** en los mercados de la UE, Comext atribuye las importaciones intra-UE al país de expedición, no al de origen. La «presencia española» es lo expedido desde España; no se corrige y se avisa en la interfaz y el CSV.

- Acceso al mercado: sin datos arancelarios automáticos; solo reglas generales (UE) y enlaces oficiales. Aranceles, impuestos, requisitos y logística no se calculan.

- Vercel: no hay `maxDuration` ni región configurados; no se han verificado los límites de ejecución del plan. La caché es en memoria y no se comparte entre instancias.
- UN Comtrade: adaptador solo probado con respuestas simuladas; sin validación real ni comparación con Eurostat.
- El buscador muestra la interpretación de la búsqueda como aviso, pero no pide confirmar el producto antes de analizar.
- Los datos marcados como estimados por Eurostat bajan la calidad a «media»; no se distinguen años provisionales.
- La ficha imprimible usa la impresión del navegador (sin PDF propio); los checks de «qué falta por comprobar» no se guardan.

- El crecimiento en volumen se aproxima con el peso neto; no distingue cambios de composición del producto. Solo genera avisos.

- Fuera de la UE: solo 9 mercados, con cobertura verificada para un único producto (HS 220421); otros productos pueden tener huecos. Sin comparación cuantitativa con Eurostat todavía. Cupo gratuito de la API compartido por todos los visitantes.

- Valor unitario y crecimiento en volumen: con UN Comtrade dependen de que cada país publique peso neto; en la ficha de Japón (HS 220421) salen «n.d.». Pendiente de comprobar qué países lo publican.
- Nombres de proveedores fuera del catálogo: llegan en inglés (el que da la fuente); `Intl` no resuelve los códigos numéricos de Comtrade.

- Importadores y compradores: retirado de la interfaz el 06/11/2026 (solo cubría HS 220421 en Japón y la búsqueda en vivo no se había probado). El código se conserva; ver docs/buyers.md.
