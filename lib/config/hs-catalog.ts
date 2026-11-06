/**
 * Catálogo orientativo de códigos HS6 (nomenclatura HS2022) para buscar por nombre.
 * NO es la nomenclatura oficial completa: es una selección de productos habituales en la exportación española.
 * Los nombres son descripciones simplificadas. Para códigos no incluidos, usar el buscador de Access2Markets.
 * Cada código debe comprobarse con datos reales: si no existe en el periodo, la app avisa «Sin datos para…».
 */
export interface HsEntry { code: string; name: string; keywords: string }

export const HS_CATALOG: HsEntry[] = [
  // Alimentación y bebidas
  { code: "150920", name: "Aceite de oliva virgen extra", keywords: "aceite oliva virgen extra evoo extra virgin olive oil" },
  { code: "150930", name: "Aceite de oliva virgen", keywords: "aceite oliva virgen virgin olive oil" },
  { code: "200570", name: "Aceitunas preparadas o conservadas", keywords: "aceitunas olivas conserva olives preserved" },
  { code: "220421", name: "Vino en envases de hasta 2 l", keywords: "vino botella tinto blanco rosado wine bottles" },
  { code: "220429", name: "Vino en otros envases (granel)", keywords: "vino granel wine bulk" },
  { code: "220410", name: "Vino espumoso", keywords: "vino espumoso champagne sparkling wine champagne" /* «cava» lleva a la subcategoría NC8 Cava DOP (o a esta partida fuera de la UE) */ },
  { code: "220300", name: "Cerveza de malta", keywords: "cerveza malta beer" },
  { code: "220830", name: "Whisky", keywords: "whisky licor destilado whisky whiskey spirits" },
  { code: "080510", name: "Naranjas", keywords: "naranjas citricos fruta oranges citrus fruit" },
  // El antiguo 080520 se dividió en 080521, 080522 y 080529 (otros híbridos de cítricos, fuera del catálogo). Hasta el
  // 06/11/2026 este comentario atribuía la división a HS2022; es de HS2017: Comext tiene datos de 080521 y 080522 en
  // 2019–2021 (comprobado el 06/11/2026), así que no cambian entre HS2017 y HS2022 y sus ventanas 2022/2023 se unen.
  { code: "080521", name: "Mandarinas (incl. tangerinas y satsumas)", keywords: "mandarinas tangerinas satsumas citricos fruta mandarins tangerines satsumas citrus" },
  { code: "080522", name: "Clementinas", keywords: "clementinas citricos fruta clementines citrus" },
  { code: "080930", name: "Melocotones y nectarinas", keywords: "melocoton nectarina fruta peaches nectarines fruit" },
  { code: "081010", name: "Fresas", keywords: "fresas fruta strawberries fruit" },
  { code: "070200", name: "Tomates frescos", keywords: "tomates hortalizas verdura tomatoes vegetables" },
  { code: "070960", name: "Pimientos frescos", keywords: "pimientos hortalizas verdura peppers vegetables" },
  { code: "160414", name: "Atún en conserva", keywords: "atun conserva pescado tuna canned fish" },
  { code: "020329", name: "Carne de cerdo congelada", keywords: "cerdo porcino carne congelada pork frozen meat" },
  { code: "021011", name: "Jamones y paletas curados", keywords: "jamon paleta curado embutido cerdo ham cured iberico jamon" },
  { code: "040690", name: "Quesos (otros)", keywords: "queso lacteos cheese dairy" },
  { code: "190531", name: "Galletas dulces", keywords: "galletas bollería dulces biscuits cookies" },
  { code: "180690", name: "Chocolate y preparaciones con cacao", keywords: "chocolate cacao chocolate cocoa" },
  { code: "090121", name: "Café tostado sin descafeinar", keywords: "cafe tostado coffee roasted" },
  { code: "100630", name: "Arroz semiblanqueado o blanqueado", keywords: "arroz cereales rice cereals" },
  // Industria, química y salud
  { code: "300490", name: "Medicamentos dosificados (resto)", keywords: "medicamentos farmacos farmaceutico medicines pharmaceuticals drugs" },
  { code: "330499", name: "Productos de belleza y cuidado de la piel", keywords: "cosmetica belleza cuidado piel crema cosmetics beauty skincare cream" },
  { code: "330300", name: "Perfumes y aguas de colonia", keywords: "perfume colonia fragancia perfume fragrance" },
  { code: "392690", name: "Manufacturas de plástico (resto)", keywords: "plastico manufacturas plastic articles" },
  { code: "310210", name: "Urea (fertilizante)", keywords: "urea fertilizante abono urea fertilizer" },
  { code: "401110", name: "Neumáticos nuevos para turismos", keywords: "neumaticos ruedas caucho tyres tires car" },
  // Automoción y maquinaria
  { code: "870323", name: "Turismos de 1.500 a 3.000 cc", keywords: "coches automoviles turismos gasolina cars passenger vehicles petrol" },
  { code: "870324", name: "Turismos de más de 3.000 cc", keywords: "coches automoviles turismos gasolina cars passenger vehicles petrol large" },
  { code: "870380", name: "Turismos solo eléctricos", keywords: "coches electricos vehiculos electricos automoviles electric cars vehicles" },
  { code: "870829", name: "Partes y accesorios de carrocería", keywords: "componentes automocion carroceria car parts bodywork automotive components" },
  { code: "870899", name: "Otras partes y accesorios de vehículos", keywords: "componentes automocion piezas recambios car parts spare parts automotive components" },
  { code: "841810", name: "Frigoríficos-congeladores combinados", keywords: "frigorifico electrodomestico fridge freezer refrigerator appliance" },
  { code: "853710", name: "Cuadros y aparatos de control (hasta 1.000 V)", keywords: "cuadros electricos material electrico switchgear electrical panels" },
  // Tecnología y energía
  { code: "847130", name: "Ordenadores portátiles", keywords: "ordenadores portatiles laptops informatica laptops computers" },
  { code: "851713", name: "Teléfonos inteligentes (smartphones)", keywords: "moviles smartphones telefonos telecomunicaciones smartphones mobile phones" },
  { code: "850760", name: "Baterías de iones de litio", keywords: "baterias litio acumuladores lithium batteries" },
  { code: "854143", name: "Células fotovoltaicas en módulos", keywords: "paneles solares fotovoltaica energia solar solar panels photovoltaic" },
  // Metales y construcción
  { code: "730890", name: "Construcciones y partes de hierro o acero", keywords: "estructuras metalicas acero hierro construccion steel structures construction" },
  { code: "760110", name: "Aluminio sin alear en bruto", keywords: "aluminio metal aluminium aluminum metal" },
  { code: "690721", name: "Baldosas cerámicas (absorción de agua ≤ 0,5 %)", keywords: "ceramica azulejos baldosas suelos revestimiento ceramic tiles flooring" },
  { code: "690722", name: "Baldosas cerámicas (absorción de agua > 0,5 % y ≤ 10 %)", keywords: "ceramica azulejos baldosas suelos revestimiento ceramic tiles flooring" },
  // Hogar, moda y calzado
  { code: "940360", name: "Muebles de madera (resto)", keywords: "muebles madera mobiliario hogar wooden furniture" },
  { code: "940161", name: "Asientos con armazón de madera, tapizados", keywords: "sillas sillones asientos muebles chairs seats furniture" },
  { code: "640399", name: "Calzado con parte superior de cuero", keywords: "zapatos calzado cuero shoes footwear leather" },
  { code: "610910", name: "Camisetas de algodón (punto)", keywords: "camisetas ropa textil algodon moda t-shirts cotton clothing" },
  { code: "620342", name: "Pantalones de hombre de algodón", keywords: "pantalones vaqueros ropa textil algodon moda hombre trousers jeans cotton men clothing" },
  { code: "620462", name: "Pantalones de mujer de algodón", keywords: "pantalones vaqueros ropa textil algodon moda mujer trousers jeans cotton women clothing" },
];

/**
 * Subcategorías a 8 dígitos de la Nomenclatura Combinada de la UE (NC8), para precisar más que el HS6. Decisión del
 * dueño (04/11/2026): SOLO para mercados de la UE. La NC8 es europea: Eurostat Comext la publica, pero UN Comtrade y la
 * OMC solo llegan a 6 dígitos. Fuera de la UE la búsqueda usa la partida general HS6 y lo dice.
 *
 * Comprobado en vivo el 04/11/2026 (Comext ds-045409, Alemania y Francia, 2022–2025): todos los códigos tienen datos
 * los cuatro años. Lo que NO existe en ninguna estadística oficial y por eso no se ofrece: Ribera del Duero, Rueda,
 * Priorat… (van juntas en «otros vinos con DOP») y «SUV» (la nomenclatura clasifica turismos por motor, no por
 * carrocería). No se aproximan con cifras inventadas.
 *
 * `spanishOrigin`: la denominación solo se produce en España (Rioja, Navarra…). Su cuota española es casi el 100 % por
 * definición (medido: 98 % en Alemania), así que el ranking «Potencial de cuota» no informa en esos productos; la app lo
 * avisa. Sirven para ver dónde se vende la denominación y cómo evoluciona.
 *
 * Ojo: un subcódigo es más sensible que su partida a cambios en cómo declaran los importadores (p. ej. Cava en
 * Alemania: de 42,7 M€ en 2023 a 6,7 M€ en 2025 mientras crecían los espumosos «varietales sin DOP»).
 */
export interface Nc8Entry extends HsEntry { spanishOrigin?: true }

export const NC8_CATALOG: Nc8Entry[] = [
  { code: "22042176", name: "Vino tinto o rosado DOP Rioja (hasta 2 l)", keywords: "vino tinto rosado rioja denominacion origen dop wine red", spanishOrigin: true },
  { code: "22042136", name: "Vino blanco DOP Rioja (hasta 2 l)", keywords: "vino blanco rioja denominacion origen dop wine white", spanishOrigin: true },
  { code: "22042171", name: "Vino tinto o rosado DOP Navarra (hasta 2 l)", keywords: "vino tinto rosado navarra denominacion origen dop wine red", spanishOrigin: true },
  { code: "22042174", name: "Vino tinto o rosado DOP Penedés (hasta 2 l)", keywords: "vino tinto rosado penedes denominacion origen dop wine red", spanishOrigin: true },
  { code: "22042134", name: "Vino blanco DOP Penedés (hasta 2 l)", keywords: "vino blanco penedes denominacion origen dop wine white", spanishOrigin: true },
  { code: "22042177", name: "Vino tinto o rosado DOP Valdepeñas (hasta 2 l)", keywords: "vino tinto rosado valdepenas denominacion origen dop wine red", spanishOrigin: true },
  { code: "22042137", name: "Vino blanco DOP Valencia (hasta 2 l)", keywords: "vino blanco valencia denominacion origen dop wine white", spanishOrigin: true },
  { code: "22042178", name: "Vino tinto o rosado con otras DOP de la UE (incl. Ribera del Duero, Priorat, Toro…; hasta 2 l)", keywords: "vino tinto rosado otras denominacion origen dop ribera duero priorat toro jumilla bierzo wine red" },
  { code: "22042138", name: "Vino blanco con otras DOP de la UE (incl. Rueda, Rías Baixas…; hasta 2 l)", keywords: "vino blanco otras denominacion origen dop rueda rias baixas albarino wine white" },
  { code: "22041013", name: "Cava DOP", keywords: "cava espumoso vino denominacion origen dop sparkling wine", spanishOrigin: true },
  { code: "08051022", name: "Naranjas navel", keywords: "naranjas navel citricos fruta oranges navel citrus fruit" },
  { code: "08051024", name: "Naranjas blancas", keywords: "naranjas blancas citricos fruta oranges white citrus fruit" },
  { code: "08051028", name: "Naranjas dulces (otras: sanguinas, Valencia late…)", keywords: "naranjas dulces sanguinas otras citricos fruta oranges sweet blood citrus fruit" },
  { code: "87038010", name: "Turismos solo eléctricos nuevos", keywords: "coches electricos nuevos vehiculos automoviles turismos electric cars new vehicles" },
  { code: "87038090", name: "Turismos solo eléctricos usados", keywords: "coches electricos usados segunda mano vehiculos automoviles turismos electric cars used vehicles" },
];

export const isNc8 = (code: string) => /^\d{8}$/.test(code);
/** Partida HS6 de un código (el propio código si ya es HS6). */
export const hs6Of = (code: string) => code.slice(0, 6);
/** «HS 220421» o «NC 22042176»: la nomenclatura a la que pertenece el código, para no presentar un NC8 como HS. */
export const codeLabel = (code: string) => `${isNc8(code) ? "NC" : "HS"} ${code}`;
export const nc8Entry = (code: string) => NC8_CATALOG.find((e) => e.code === code);

/** Título en español para mostrar (del catálogo, si el código está) y descripción de la fuente si difiere. */
export function productLabel(code: string, sourceName: string): { title: string; sourceDescription: string | null } {
  const entry = HS_CATALOG.find((e) => e.code === code) ?? nc8Entry(code);
  if (!entry) return { title: sourceName, sourceDescription: null };
  return { title: entry.name, sourceDescription: sourceName && sourceName !== entry.name ? sourceName : null };
}
