/**
 * Catálogo orientativo de códigos HS6 (nomenclatura HS2022) para buscar por nombre.
 * NO es la nomenclatura oficial completa: es una selección de productos habituales en la exportación española.
 * Los nombres son descripciones simplificadas. Para códigos no incluidos, usar el buscador de Access2Markets.
 * Cada código debe comprobarse con datos reales: si no existe en el periodo, la app avisa «Sin datos para…».
 */
export interface HsEntry { code: string; name: string; keywords: string }

export const HS_CATALOG: HsEntry[] = [
  // Alimentación y bebidas
  { code: "150920", name: "Aceite de oliva virgen extra", keywords: "aceite oliva virgen extra evoo" },
  { code: "150930", name: "Aceite de oliva virgen", keywords: "aceite oliva virgen" },
  { code: "200570", name: "Aceitunas preparadas o conservadas", keywords: "aceitunas olivas conserva" },
  { code: "220421", name: "Vino en envases de hasta 2 l", keywords: "vino botella tinto blanco rosado" },
  { code: "220429", name: "Vino en otros envases (granel)", keywords: "vino granel" },
  { code: "220410", name: "Vino espumoso", keywords: "vino espumoso cava champagne" },
  { code: "220300", name: "Cerveza de malta", keywords: "cerveza malta" },
  { code: "220830", name: "Whisky", keywords: "whisky licor destilado" },
  { code: "080510", name: "Naranjas", keywords: "naranjas citricos fruta" },
  { code: "080520", name: "Mandarinas y clementinas", keywords: "mandarinas clementinas citricos fruta" },
  { code: "080930", name: "Melocotones y nectarinas", keywords: "melocoton nectarina fruta" },
  { code: "081010", name: "Fresas", keywords: "fresas fruta" },
  { code: "070200", name: "Tomates frescos", keywords: "tomates hortalizas verdura" },
  { code: "070960", name: "Pimientos frescos", keywords: "pimientos hortalizas verdura" },
  { code: "160414", name: "Atún en conserva", keywords: "atun conserva pescado" },
  { code: "020329", name: "Carne de cerdo congelada", keywords: "cerdo porcino carne congelada" },
  { code: "021011", name: "Jamones y paletas curados", keywords: "jamon paleta curado embutido cerdo" },
  { code: "040690", name: "Quesos (otros)", keywords: "queso lacteos" },
  { code: "190531", name: "Galletas dulces", keywords: "galletas bollería dulces" },
  { code: "180690", name: "Chocolate y preparaciones con cacao", keywords: "chocolate cacao" },
  { code: "090121", name: "Café tostado sin descafeinar", keywords: "cafe tostado" },
  { code: "100630", name: "Arroz semiblanqueado o blanqueado", keywords: "arroz cereales" },
  // Industria, química y salud
  { code: "300490", name: "Medicamentos dosificados (resto)", keywords: "medicamentos farmacos farmaceutico" },
  { code: "330499", name: "Productos de belleza y cuidado de la piel", keywords: "cosmetica belleza cuidado piel crema" },
  { code: "330300", name: "Perfumes y aguas de colonia", keywords: "perfume colonia fragancia" },
  { code: "392690", name: "Manufacturas de plástico (resto)", keywords: "plastico manufacturas" },
  { code: "310210", name: "Urea (fertilizante)", keywords: "urea fertilizante abono" },
  { code: "401110", name: "Neumáticos nuevos para turismos", keywords: "neumaticos ruedas caucho" },
  // Automoción y maquinaria
  { code: "870323", name: "Turismos de 1.500 a 3.000 cc", keywords: "coches automoviles turismos gasolina" },
  { code: "870324", name: "Turismos de más de 3.000 cc", keywords: "coches automoviles turismos gasolina" },
  { code: "870380", name: "Turismos solo eléctricos", keywords: "coches electricos vehiculos electricos automoviles" },
  { code: "870829", name: "Partes y accesorios de carrocería", keywords: "componentes automocion carroceria" },
  { code: "870899", name: "Otras partes y accesorios de vehículos", keywords: "componentes automocion piezas recambios" },
  { code: "841810", name: "Frigoríficos-congeladores combinados", keywords: "frigorifico electrodomestico" },
  { code: "853710", name: "Cuadros y aparatos de control (hasta 1.000 V)", keywords: "cuadros electricos material electrico" },
  // Tecnología y energía
  { code: "847130", name: "Ordenadores portátiles", keywords: "ordenadores portatiles laptops informatica" },
  { code: "851713", name: "Teléfonos inteligentes (smartphones)", keywords: "moviles smartphones telefonos telecomunicaciones" },
  { code: "850760", name: "Baterías de iones de litio", keywords: "baterias litio acumuladores" },
  { code: "854143", name: "Células fotovoltaicas en módulos", keywords: "paneles solares fotovoltaica energia solar" },
  // Metales y construcción
  { code: "730890", name: "Construcciones y partes de hierro o acero", keywords: "estructuras metalicas acero hierro construccion" },
  { code: "760110", name: "Aluminio sin alear en bruto", keywords: "aluminio metal" },
  { code: "690721", name: "Baldosas cerámicas (absorción de agua ≤ 0,5 %)", keywords: "ceramica azulejos baldosas suelos revestimiento" },
  { code: "690722", name: "Baldosas cerámicas (absorción de agua > 0,5 % y ≤ 10 %)", keywords: "ceramica azulejos baldosas suelos revestimiento" },
  // Hogar, moda y calzado
  { code: "940360", name: "Muebles de madera (resto)", keywords: "muebles madera mobiliario hogar" },
  { code: "940161", name: "Asientos con armazón de madera, tapizados", keywords: "sillas sillones asientos muebles" },
  { code: "640399", name: "Calzado con parte superior de cuero", keywords: "zapatos calzado cuero" },
  { code: "610910", name: "Camisetas de algodón (punto)", keywords: "camisetas ropa textil algodon moda" },
  { code: "620342", name: "Pantalones de hombre de algodón", keywords: "pantalones vaqueros ropa textil algodon moda hombre" },
  { code: "620462", name: "Pantalones de mujer de algodón", keywords: "pantalones vaqueros ropa textil algodon moda mujer" },
];
