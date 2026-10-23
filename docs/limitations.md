# Limitaciones conocidas

1. **Datos oficiales reales parcialmente verificados.** La API de Comext responde con valores reales y las dimensiones, `WORLD`, flujos e indicadores están confirmados; la app completa en modo `comext` se ejecutó con datos reales (49 oportunidades, 2 productos). Faltan más productos, Grecia (`EL`) sin confirmar y los indicadores de estado. Comtrade (opcional) no se ha probado: necesita clave.
2. **Comext solo cubre mercados UE.** Mercados no UE requieren Comtrade (USD).
3. **Catálogo de productos:** no hay catálogo HS ni categorías agregadas. En modos reales hay que introducir códigos HS6 (máx. 20). Los nombres vienen de la etiqueta de la fuente.
4. **Cambios de revisión HS:** ventanas que cruzan 2017/2022 quedan incompletas (no hay tabla de correspondencias validada).
5. **Origen único:** solo España; el selector está desactivado.
6. **Caché en memoria:** se pierde al reiniciar y no se comparte entre instancias serverless.
7. **Sin puntuación parcial.**
8. **Proveedores:** en Comtrade solo se muestran proveedores presentes en el catálogo de mercados.
9. **Sin costes logísticos, aranceles ni barreras:** solo enlaces a Access2Markets/ICEX.
10. **Percentiles sobre universos pequeños** (p. ej. un solo producto consultado) son poco informativos; la aplicación avisa cuando hay menos de 10 oportunidades completas.
11. **No probado en navegador:** la interfaz se ha comprobado vía HTML servido y API, no con pruebas de UI ni inspección visual.
12. **Demo:** los valores sintéticos no reflejan la realidad; los nombres de producto son descriptores abreviados.
13. **Ausente ≠ cero, pero también ≠ comercio nulo:** si España no figura como socio de un mercado en un producto, la cuota queda *no disponible* y la oportunidad *incompleta* (criterio conservador). En estadísticas aduaneras una ausencia puede significar comercio nulo o confidencial; no se distingue todavía.
14. **Valoración:** exportaciones (FOB) e importaciones (CIF) no son comparables; la cuota usa solo importaciones declaradas por el mercado de destino (CIF) frente a su total (CIF), y la posición exportadora usa exportaciones españolas (FOB) solo como señal relativa por percentil.
15. **Datos provisionales:** Eurostat/Comtrade pueden revisar los últimos años; el año máximo permitido es el último año natural completo, sin detectar indicadores de provisionalidad.
16. **Asimetrías bilaterales** (documentadas por Comtrade): lo que España declara exportar no coincide con lo que el mercado declara importar de España.
17. **Datos confidenciales:** celdas con indicador de confidencialidad se omiten (no se imputan).
18. **Códigos HS y revisiones:** los códigos deben existir en la nomenclatura del año consultado (HS2022 desde 2022). No hay tabla de correspondencias entre revisiones: un código eliminado (p. ej. 150910) devuelve vacío y la app avisa «Sin datos para…». Series largas que crucen revisiones quedan como incompletas.
19. **Pocos productos ⇒ posición exportadora poco informativa:** con 2 productos el percentil exportador solo toma los valores 25 y 75 (15 % de la puntuación). La app lo avisa con menos de 10 productos.
20. **Efecto Róterdam:** las importaciones de Países Bajos, Bélgica y otros puntos de entrada incluyen mercancía en tránsito que se reexporta; el tamaño de esos mercados puede estar sobrevalorado como demanda final.
21. **Crecimiento en valor, no en volumen:** el CAGR se calcula sobre valor en euros; los precios (p. ej. aceite de oliva 2023–2024) pueden explicar buena parte del crecimiento. El peso neto está disponible pero no se usa aún para un CAGR en volumen.
22. **Cuota con España ausente:** si Eurostat no publica el flujo desde España en el último año (p. ej. aceite 150920 en Chipre 2024) la oportunidad queda incompleta aunque el mercado sea pequeño; es el criterio conservador del punto 13.

- Acceso al mercado: sin datos arancelarios automáticos; solo reglas generales (UE) y enlaces oficiales. Aranceles, impuestos, requisitos y logística no entran en la puntuación.

- Redundancia tamaño/expansión de cuota en la puntuación (ver docs/methodology.md). Pendiente de decisión.
- Vercel: no hay `maxDuration` ni región configurados; no se han verificado los límites de ejecución del plan. La caché es en memoria y no se comparte entre instancias.
- UN Comtrade: adaptador solo probado con respuestas simuladas; sin validación real ni comparación con Eurostat.
- El buscador muestra la interpretación de la búsqueda como aviso, pero no pide confirmar el producto antes de analizar.
- Los datos marcados como estimados por Eurostat bajan la calidad a «media»; no se distinguen años provisionales.
- La ficha imprimible usa la impresión del navegador (sin PDF propio); los checks de «qué falta por comprobar» no se guardan.
