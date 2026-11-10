# Currículo oficial del CFGS Comercio Internacional y cobertura del Modo Aprendizaje

Leído el 09/11/2026 en el BOE (XML oficial de cada norma). Sirve para decidir qué casos añadir: cada caso nuevo debe decir qué resultados de aprendizaje (RA) trabaja.

## Normativa (confirmado)
- **Título:** Real Decreto 1574/2011, de 4 de noviembre (BOE-A-2011-19439). Los RA y criterios de evaluación de cada módulo están en su anexo I y son comunes a todo el Estado.
- **Modificación:** Real Decreto 500/2024, de 21 de mayo (BOE-A-2024-10685), adaptación a la Ley Orgánica 3/2022. Para este título cambia las cualificaciones (art. 6), créditos ECTS, profesorado (anexo III) y convalidaciones (anexo V). **No cambia los RA de los módulos propios**: todas las menciones del RD 500/2024 a este título y a sus módulos son de cualificaciones, convalidaciones, profesorado y créditos ECTS; ninguna da nueva redacción a un resultado de aprendizaje. La Orden EFD/659/2024 (art. 3.3) remite igualmente a los RA del anexo I de cada real decreto.
- **Currículo del Ministerio:** Orden EFD/659/2024, de 25 de junio (BOE-A-2024-13181), anexo XVI; deroga la Orden ECD/319/2012. Solo rige en el ámbito de gestión del Ministerio (Ceuta y Melilla, centros en el exterior); cada comunidad autónoma tiene su propio currículo y distribución horaria (por ejemplo, Comunidad Valenciana, Decreto 114/2025, no leído). Los RA son los mismos en todas.

## Módulos y horas (Orden EFD/659/2024, anexo XVI)
| Curso | Módulo | Horas |
|---|---|---|
| 1.º | 0625 Logística de almacenamiento | 130 |
| 1.º | 0622 Transporte internacional de mercancías | 160 |
| 1.º | 0623 Gestión económica y financiera de la empresa | 160 |
| 1.º | 0627 Gestión administrativa del comercio internacional | 190 |
| 1.º | 0825 Financiación internacional | 130 |
| 1.º | 1709 Itinerario personal para la empleabilidad I · 1708 Sostenibilidad aplicada · 0179 Inglés profesional | 100 · 35 · 70 |
| 2.º | 0827 Comercio digital internacional | 100 |
| 2.º | 0822 Sistema de información de mercados | 140 |
| 2.º | 0826 Medios de pago internacionales | 140 |
| 2.º | 0824 Negociación internacional | 130 |
| 2.º | 0823 Marketing internacional | 190 |
| 2.º | 1710 Itinerario II · 1665 Digitalización aplicada · Optativa · 1712 Inglés profesional II · 0828 Proyecto intermodular | 100 · 35 · 80 · 60 · 50 |

Total: 2.000 horas. Los módulos comunes a todos los ciclos (itinerario, sostenibilidad, digitalización, inglés, optativa) quedan **fuera del alcance** del simulador.

## Cobertura actual, por resultado de aprendizaje
Valoración propia a partir del código de los casos (`lib/learning`), no de un profesor: **Sí** = se practica con decisiones y consecuencias; **Parcial** = aparece pero sin trabajarse a fondo; **No** = no aparece. RA resumidos; el texto literal está en el anexo I del RD 1574/2011.

### 0622 Transporte internacional de mercancías (160 h) — cobertura alta
| RA | Contenido | Cobertura |
|---|---|---|
| 1 | Conveniencia de modos y medios de transporte | Sí (elección de ruta en los 6 casos) |
| 2 | Selección de modos, medios y rutas óptimas | Sí (mejor ruta = la más barata que llega a tiempo) |
| 3 | Contratos de transporte y cálculo de costes | Parcial: costes sí (presupuesto por conceptos, peso tasable, W/M); el contrato de transporte en sí, no |
| 4 | Integridad y tránsito de la mercancía | Sí (embalaje, mercancía peligrosa ADR/IMDG/IATA) |
| 5 | Documentación del transporte | Sí (CMR, B/L, AWB, documentos de mercancía peligrosa) |
| 6 | Fases e incidencias | Sí (variantes de daño, retraso y retirada tardía) |
| 7 | Seguro de la mercancía | Sí (CIP/CIF, cláusulas A/C, 110 %) |

### 0627 Gestión administrativa del comercio internacional (190 h) — cobertura media (caso de importación desde el 09/11/2026)
| RA | Contenido | Cobertura |
|---|---|---|
| 1 | Organismos e instituciones del comercio internacional | No |
| 2 | Sistema de información para la compraventa internacional | No |
| 3 | Barreras al comercio | Sí: aranceles, defensa comercial (antidumping y su elusión), requisitos de producto (RD 339/2014, FDA) |
| 4 | Procedimientos de importación/exportación e introducción/expedición | Parcial: exportación, expedición e importación sí (clasificación, origen, valor en aduana, representación, IVA diferido, canal rojo); **introducción intracomunitaria, no** |
| 5 | Documentación de importación/exportación | Parcial (DUA, EORI, EUR.1, factura, B/L, certificado de origen; sin Intrastat ni rellenar el DUA). En el simulador (v5), CMR y licencia comunitaria en un transporte dentro de la UE, sin DUA |

### 0826 Medios de pago internacionales (140 h) — cobertura parcial
| RA | Contenido | Cobertura |
|---|---|---|
| 1 | Normativa (reglas de la CCI, leyes uniformes) | Parcial (se citan; no se trabajan) |
| 2 | Medios de cobro y pago: procedimientos, costes, operativa | Parcial (anticipo, cobro documentario, carta de crédito como elección) |
| 3 | Garantías y avales | No |
| 4 | Documentación para el cobro: discrepancias, impagos, protesto | No |
| 5 | Cobros y pagos por Internet y sistemas digitales | No |

### 0825 Financiación internacional (130 h) — cobertura parcial
| RA | Contenido | Cobertura |
|---|---|---|
| 1 | Sistema de información para la financiación | No |
| 2 | Mercado de divisas | Parcial (casos de Japón y Nueva York, tipos simulados) |
| 3 | Riesgo de cambio y de interés | Parcial: cambio sí (seguro de cambio); interés, no |
| 4 | Modalidades de financiación de la compraventa | Parcial (coste del aplazamiento en negociación; sin prefinanciación, factoring ni forfaiting) |
| 5 | Financiación con apoyo oficial a la exportación | No |
| 6 | Concursos y licitaciones internacionales | No |
| 7 | Seguro de crédito a la exportación | Parcial (opción de negociación) |

### 0824 Negociación internacional (130 h) — cobertura media
| RA | Contenido | Cobertura |
|---|---|---|
| 1 | Selección de clientes y proveedores | Parcial (proveedor por coste puesto en almacén en el caso de importación) |
| 2 | Comunicación según protocolos y costumbres del país | No |
| 3 | Diseño del proceso de negociación | Sí (punto de retirada, concesiones con contrapartida) |
| 4 | Normativa y usos de la contratación internacional | Parcial (Incoterms; sin Convención de Viena ni ley aplicable) |
| 5 | Elaboración de contratos | No |
| 6 | Control de los acuerdos contractuales | No |

### 0823 Marketing internacional (190 h) — sin cobertura
RA1 oportunidad de entrada de un producto · RA2 políticas de precios en un mercado exterior · RA3 forma de entrada y canales · RA4 comunicación comercial internacional · RA5 plan de marketing internacional. Ninguno se trabaja (el escandallo de precios solo aparece de pasada).

### 0822 Sistema de información de mercados (140 h) — sin cobertura en el simulador
RA1 variables del mercado y entorno · RA2 sistema de información de marketing · RA3 planes de obtención de información · RA4 muestreo · RA5 tratamiento de datos e informe. La herramienta de mercados de SmarTrade (datos reales de Eurostat) encaja con RA1 y RA5, pero hoy no está conectada al Modo Aprendizaje.

### 0625 Logística de almacenamiento (130 h) — sin cobertura
RA1 normativa del almacenaje · RA2 organización del almacén · RA3 presupuesto del almacén · RA4 gestión de stocks · RA5 logística inversa · RA6 supervisión y calidad.
En el Business Simulator (10/11/2026): RA3 en parte. Ampliar el almacén obliga a comparar su coste, alquiler, mozo y fianza, con la ocupación prevista (`docs/simulador.md` §17 sexies).

### 0623 Gestión económica y financiera de la empresa (160 h) — casi sin cobertura
RA1 iniciativas emprendedoras · RA2 forma jurídica · RA3 financiación de inversiones · RA4 compraventa o alquiler de activos · RA5 facturas y documentos de cobro y pago (parcial) · RA6 contabilidad y fiscalidad · RA7 rentabilidad y solvencia. Es el módulo menos específico del comercio internacional.
En el Business Simulator (10/11/2026): RA3, RA4, RA5 y RA7 en parte (RA5: plazos legales de pago ante un cliente que pide 90 días, §17 septies).
- RA3: póliza de crédito, con comisión, interés sobre lo dispuesto y límite.
- RA4: segundo camión en renting o comprado, con amortización y caja.
- RA7: resultado frente a tesorería y rentabilidad de cada operación.

Detalle en `docs/simulador.md` §17 sexies.

### 0827 Comercio digital internacional (100 h) — sin cobertura
RA1 plan de marketing digital internacional · RA2 Internet como canal de promoción · RA3 servicios y protocolos de Internet · RA4 política de comercio electrónico (ventas internacionales en línea) · RA5 facturación electrónica y trámites telemáticos.

### 0828 Proyecto intermodular (50 h)
Proyecto del alumno que integra los módulos. Un simulador no lo sustituye; una operación completa de principio a fin puede servir de ejemplo.

## Huecos ordenados (propuesta)
Criterio: horas del módulo × lo que falta × lo bien que se presta a una simulación con decisiones y consecuencias.

1. ~~**Importación**~~ — hecho el 09/11/2026 (caso de las bicicletas). Queda: introducción intracomunitaria e Intrastat, organismos (RA1). Texto original: (0627 RA1, RA3–RA5, 190 h): todos los casos eran de exportación. Un caso de importación (clasificación arancelaria con TARIC, valor en aduana, DUA de importación, IVA a la importación, defensa comercial o requisitos técnicos, introducción intracomunitaria e Intrastat) cubre la mitad del módulo más largo del ciclo.
2. **Marketing internacional y sistema de información de mercados** (0823 + 0822, 330 h, sin cobertura): selección de mercado con los datos reales de la herramienta de mercados, forma de entrada y canal, precio de exportación (escandallo) y un plan de marketing breve.
3. **Medios de pago a fondo** (0826 RA3–RA5): crédito documentario con discrepancias en los documentos, garantías y avales (garantía a primer requerimiento, stand-by), impago y sus costes.
4. **Financiación** (0825 RA4–RA7): prefinanciación, factoring, forfaiting, seguro de crédito, apoyo oficial (CESCE, FIEM, CARI) y una licitación internacional.
5. **Almacén** (0625): organización, stocks (punto de pedido, stock de seguridad), presupuesto del almacén y logística inversa.
6. **Comercio digital** (0827 RA4–RA5): venta en línea a consumidores de otros países (IVA en destino, ventanilla única), canales y factura electrónica.
7. **Contratos y negociación** (0824 RA1, RA2, RA5, RA6): selección de clientes, protocolo del país, cláusulas de un contrato de compraventa internacional (Convención de Viena, ley aplicable, arbitraje) y su seguimiento.
8. **Gestión económica** (0623): solo la parte ligada a la operación (factura, rentabilidad de la operación); el resto es general y queda fuera.

Cada afirmación normativa de un caso nuevo debe comprobarse en fuente oficial antes de publicarlo, como en los casos actuales.
