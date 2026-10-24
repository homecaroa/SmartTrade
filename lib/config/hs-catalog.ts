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
  { code: "220410", name: "Vino espumoso", keywords: "vino espumoso cava champagne sparkling wine cava champagne" },
  { code: "220300", name: "Cerveza de malta", keywords: "cerveza malta beer" },
  { code: "220830", name: "Whisky", keywords: "whisky licor destilado whisky whiskey spirits" },
  { code: "080510", name: "Naranjas", keywords: "naranjas citricos fruta oranges citrus fruit" },
  { code: "080520", name: "Mandarinas y clementinas", keywords: "mandarinas clementinas citricos fruta mandarins clementines citrus" },
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

/** Título en español para mostrar (del catálogo, si el código está) y descripción de la fuente si difiere. */
export function productLabel(code: string, sourceName: string): { title: string; sourceDescription: string | null } {
  const entry = HS_CATALOG.find((e) => e.code === code);
  if (!entry) return { title: sourceName, sourceDescription: null };
  return { title: entry.name, sourceDescription: sourceName && sourceName !== entry.name ? sourceName : null };
}
