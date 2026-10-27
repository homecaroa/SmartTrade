/**
 * Guía orientativa de transporte e Incoterms® 2020. Resumen parafraseado, NO el texto oficial de la ICC (Cámara de Comercio
 * Internacional). Sin tarifas, plazos ni costes: SmarTrade no dispone de datos verificados de transporte.
 * Comprobar siempre el texto oficial y si existe una versión posterior a 2020.
 */
export type Party = "vendedor" | "comprador";
export type Insurance = "no obligatorio" | "vendedor (cobertura mínima C)" | "vendedor (cobertura amplia A)";

export interface Incoterm {
  code: string;
  name: string;
  modes: "cualquier modo" | "solo marítimo y fluvial";
  delivery: string;
  risk: string;
  carriage: Party; // quién contrata y paga el transporte principal
  insurance: Insurance;
  exportClearance: Party;
  importClearance: Party;
  note?: string;
}

export const INCOTERMS: Incoterm[] = [
  { code: "EXW", name: "Ex Works (en fábrica)", modes: "cualquier modo", delivery: "El vendedor pone la mercancía a disposición del comprador en sus instalaciones, sin cargarla.", risk: "Pasa al comprador en ese punto.", carriage: "comprador", insurance: "no obligatorio", exportClearance: "comprador", importClearance: "comprador", note: "Incluso el despacho de exportación lo hace el comprador: suele ser poco práctico; FCA es una alternativa habitual." },
  { code: "FCA", name: "Free Carrier (franco transportista)", modes: "cualquier modo", delivery: "El vendedor entrega la mercancía, despachada para exportación, al transportista que designa el comprador en el lugar convenido.", risk: "Pasa al comprador al entregar.", carriage: "comprador", insurance: "no obligatorio", exportClearance: "vendedor", importClearance: "comprador", note: "Si el lugar es del vendedor, él carga; en otro lugar, no descarga." },
  { code: "CPT", name: "Carriage Paid To (transporte pagado hasta)", modes: "cualquier modo", delivery: "El vendedor entrega al primer transportista que contrata él mismo.", risk: "Pasa al comprador al entregar al primer transportista, aunque el vendedor pague el transporte hasta el destino.", carriage: "vendedor", insurance: "no obligatorio", exportClearance: "vendedor", importClearance: "comprador", note: "El coste y el riesgo se transmiten en puntos distintos." },
  { code: "CIP", name: "Carriage and Insurance Paid To (transporte y seguro pagados hasta)", modes: "cualquier modo", delivery: "Como CPT, y además el vendedor contrata un seguro de la mercancía a favor del comprador.", risk: "Pasa al comprador al entregar al primer transportista.", carriage: "vendedor", insurance: "vendedor (cobertura amplia A)", exportClearance: "vendedor", importClearance: "comprador", note: "En la versión 2020 la cobertura mínima exigida es la más amplia." },
  { code: "DAP", name: "Delivered at Place (entregada en lugar)", modes: "cualquier modo", delivery: "El vendedor pone la mercancía a disposición del comprador en el medio de transporte de llegada, lista para descargar, en el destino convenido.", risk: "Pasa al comprador en ese punto.", carriage: "vendedor", insurance: "no obligatorio", exportClearance: "vendedor", importClearance: "comprador", note: "La descarga y el despacho de importación corren a cargo del comprador." },
  { code: "DPU", name: "Delivered at Place Unloaded (entregada y descargada)", modes: "cualquier modo", delivery: "El vendedor entrega la mercancía ya descargada en el lugar de destino convenido.", risk: "Pasa al comprador una vez descargada.", carriage: "vendedor", insurance: "no obligatorio", exportClearance: "vendedor", importClearance: "comprador", note: "Es la única regla en la que el vendedor se encarga de la descarga." },
  { code: "DDP", name: "Delivered Duty Paid (entregada derechos pagados)", modes: "cualquier modo", delivery: "Como DAP, pero con la mercancía despachada para la importación: el vendedor asume los trámites, aranceles e impuestos de importación.", risk: "Pasa al comprador en el destino, lista para descargar.", carriage: "vendedor", insurance: "no obligatorio", exportClearance: "vendedor", importClearance: "vendedor", note: "Máxima obligación del vendedor: exige poder cumplir trámites e impuestos en el país de destino." },
  { code: "FAS", name: "Free Alongside Ship (franco al costado del buque)", modes: "solo marítimo y fluvial", delivery: "El vendedor coloca la mercancía junto al buque designado por el comprador, en el puerto de embarque.", risk: "Pasa al comprador en ese punto.", carriage: "comprador", insurance: "no obligatorio", exportClearance: "vendedor", importClearance: "comprador" },
  { code: "FOB", name: "Free On Board (franco a bordo)", modes: "solo marítimo y fluvial", delivery: "El vendedor entrega la mercancía a bordo del buque designado por el comprador, en el puerto de embarque.", risk: "Pasa al comprador cuando está a bordo.", carriage: "comprador", insurance: "no obligatorio", exportClearance: "vendedor", importClearance: "comprador", note: "Para contenedores que se entregan en una terminal antes de embarcar suele ser más adecuado FCA." },
  { code: "CFR", name: "Cost and Freight (coste y flete)", modes: "solo marítimo y fluvial", delivery: "El vendedor entrega a bordo del buque en el puerto de embarque y contrata el transporte hasta el puerto de destino.", risk: "Pasa al comprador cuando la mercancía está a bordo, en origen.", carriage: "vendedor", insurance: "no obligatorio", exportClearance: "vendedor", importClearance: "comprador", note: "El coste llega hasta el destino, pero el riesgo se transmite en el embarque." },
  { code: "CIF", name: "Cost, Insurance and Freight (coste, seguro y flete)", modes: "solo marítimo y fluvial", delivery: "Como CFR, y además el vendedor contrata un seguro de la mercancía a favor del comprador.", risk: "Pasa al comprador cuando la mercancía está a bordo, en origen.", carriage: "vendedor", insurance: "vendedor (cobertura mínima C)", exportClearance: "vendedor", importClearance: "comprador" },
];

export interface TransportMode { id: string; name: string; strengths: string[]; limits: string[] }

/** Descripción cualitativa: sin costes, tarifas ni plazos concretos. */
export const TRANSPORT_MODES: TransportMode[] = [
  { id: "maritimo", name: "Marítimo (contenedor o granel)", strengths: ["Suele ser el más económico por unidad en grandes volúmenes.", "Gran capacidad y rutas a casi cualquier continente."], limits: ["Plazos más largos y menos predecibles.", "Depende de puertos, escalas y disponibilidad de contenedores."] },
  { id: "aereo", name: "Aéreo", strengths: ["El más rápido.", "Adecuado para mercancía de alto valor, perecedera o urgente."], limits: ["Coste por kilo muy superior al de otros modos.", "Restricciones de peso, tamaño y tipo de mercancía."] },
  { id: "carretera", name: "Carretera", strengths: ["Flexible y puerta a puerta.", "Modo habitual dentro de Europa."], limits: ["Pierde competitividad en distancias muy largas.", "Sujeto a tiempos de conducción, congestión y fronteras."] },
  { id: "ferrocarril", name: "Ferrocarril", strengths: ["Alternativa en rutas terrestres largas."], limits: ["Red y terminales limitadas.", "Suele requerir transporte previo y posterior."] },
  { id: "multimodal", name: "Multimodal", strengths: ["Combina varios modos bajo un único contrato de transporte."], limits: ["Exige coordinar los puntos de transbordo."] },
];

export const QUOTE_CHECKLIST: string[] = [
  "Origen y destino exactos (dirección o puerto/aeropuerto) y el Incoterm de la oferta.",
  "Descripción de la mercancía y su código HS.",
  "Peso, volumen, número de bultos y cómo se embalan (palés, cajas, contenedor completo o grupaje).",
  "Valor de la mercancía, para dimensionar el seguro.",
  "Condiciones especiales: temperatura controlada, mercancía frágil o peligrosa, requisitos sanitarios del destino (importante en alimentos y bebidas).",
  "Fechas de recogida y de entrega deseadas.",
  "Qué incluye el presupuesto y qué no: recogida, carga, despacho de exportación, transporte principal, descarga, despacho de importación, seguro y posibles recargos.",
];
