import { fmtEur } from "../../money";
import { ESTIMACION, SUPUESTO, VERIFICAR, type Provenance } from "../../provenance";
import { computeImport, landedUnitFor, supplierOf } from "../costs";
import type { ImportCtx, ImportScenario } from "../types";

/**
 * Caso de importación: bicicletas urbanas de Asia para una distribuidora de Valencia (09/11/2026).
 * Normativa comprobada en fuente primaria ese día (el detalle está en los comentarios de ../costs.ts y en docs/curriculo.md):
 * - Valor en aduana y representación: Reglamento (UE) 952/2013, arts. 9, 18, 19, 70-72 y 77 (texto de legislation.gov.uk
 *   a 31/01/2020; EUR-Lex no sirvió el consolidado a peticiones automáticas).
 * - Antidumping: Reglamento de Ejecución (UE) 2019/1379, art. 1 (48,5 % para «todas las demás empresas» de China;
 *   extendido a lo ENVIADO desde Indonesia, Malasia, Sri Lanka, Túnez, Camboya, Pakistán y Filipinas, se declare o no
 *   originario de allí). Revisado por el Reglamento de Ejecución (UE) 2025/2146, cuyo texto no se pudo leer: el tipo
 *   vigente se presenta como «verificar en TARIC».
 * - IVA: Ley 37/1992, art. 83 (base) y Reglamento del IVA, art. 74.1 (IVA diferido con liquidación mensual).
 * - Producto: Real Decreto 339/2014, art. 3 y anexos I y II (documentación de conformidad, manual en castellano, placa).
 * Todo lo demás (empresas, precios, fletes, tipos de arancel convencional, primas, comisiones) es SIMULADO.
 */
const LEGAL = (source: string): Provenance => ({ kind: "real", source });
const UCC = LEGAL("Reglamento (UE) 952/2013, Código Aduanero de la Unión");

const per = (ctx: ImportCtx) => (id: string) => fmtEur(landedUnitFor(ctx.scenario, id));

export const bicicletasValencia: ImportScenario = {
  id: "bicicletas-valencia",
  title: "Bicicletas urbanas de Asia para una distribuidora de Valencia",
  difficulty: "media",
  summary: "Importas 400 bicicletas de ciudad desde Asia en un contenedor: eliges proveedor, cierras la compra, clasificas la mercancía, calculas el valor en aduana y el IVA, y despachas.",
  learningGoal: "Calcular el coste real de una importación (aranceles, antidumping, IVA) y despacharla correctamente: clasificación, origen, valor en aduana, representación y documentos.",
  instructions: [
    "Eres el responsable de compras de una distribuidora española. Cada decisión tiene consecuencias económicas o legales.",
    "Compara proveedores por el COSTE PUESTO EN ALMACÉN, no por el precio en origen.",
    "Al final verás la nota de conocimientos y, aparte, el margen de la operación.",
  ],
  cnCode: "8712 00 30",
  importer: { name: "Ciclos del Turia, S.L. (ficticia)", city: "Paterna (Valencia)", description: "Distribuye bicicletas a tiendas de la Comunidad Valenciana. Liquida el IVA por meses (está en el SII) y optó en noviembre por el IVA diferido a la importación." },
  quantity: { units: 400, unit: "bicicleta", detail: "400 bicicletas urbanas sin motor, desmontadas parcialmente en caja (manillar y pedales sueltos), en un contenedor de 40 pies" },
  suppliers: [
    { id: "taiwan", label: "Fabricante de Taiwán", origin: "Taiwán", consignedFrom: "Taiwán", port: "Kaohsiung", fobUnit: 88, freight: 3000, antidumping: false, note: "Fabrica en Taiwán con cuadros propios; aporta certificado de origen no preferencial." },
    { id: "china", label: "Fabricante de China", origin: "China", consignedFrom: "China", port: "Ningbo", fobUnit: 68, freight: 2800, antidumping: true, note: "No figura entre las empresas con tipo individual: le corresponde el tipo antidumping general." },
    { id: "china_malasia", label: "El fabricante chino, enviando el contenedor desde Malasia", origin: "China", consignedFrom: "Malasia", port: "Port Klang", fobUnit: 70, freight: 3100, antidumping: true, evasion: true, note: "Propone enviarlas desde Malasia «para no pagar el antidumping»." },
  ],
  resaleUnitPrice: 150,
  targetMarginPct: 15,
  rates: { conventionalDutyPct: 14, antidumpingPct: 48.5, vatPct: 21, insuranceA: 0.35, insuranceC: 0.15, supplierFreightMarkupPct: 15 },
  royaltyUnit: 3,
  buyingCommissionPct: 2,
  destinationHandling: 380,
  inlandTransport: 350,
  customsBrokerDirect: 180,
  customsBrokerIndirect: 260,
  vatAdvance: { annualRatePct: 4, days: 45 },
  facts: [
    { label: "Código de la nomenclatura combinada", value: "8712 00 30 (bicicletas sin motor con rodamientos de bolas)", prov: LEGAL("Reglamento de Ejecución (UE) 2019/1379, art. 1") },
    { label: "Arancel convencional", value: "14 % (simulado: consulta el real en TARIC)", prov: VERIFICAR },
    { label: "Antidumping a bicicletas de China", value: "48,5 % para «todas las demás empresas» según el Reglamento 2019/1379; revisado en 2025: el tipo vigente se consulta en TARIC", prov: LEGAL("Reglamento de Ejecución (UE) 2019/1379, art. 1.2") },
    { label: "Extensión del antidumping", value: "También a las bicicletas enviadas desde Indonesia, Malasia, Sri Lanka, Túnez, Camboya, Pakistán y Filipinas, se declaren o no originarias de esos países", prov: LEGAL("Reglamento de Ejecución (UE) 2019/1379, art. 1.3 y 1.4") },
    { label: "Tipo de IVA", value: "21 % (tipo general en España; verificar)", prov: VERIFICAR },
    { label: "Canon de la marca", value: "3 € por bicicleta, que pagas al titular de la marca como condición para que el fabricante te venda", prov: SUPUESTO },
    { label: "Agente de compras en Asia", value: "Te cobra un 2 % del precio FOB por buscar y controlar proveedores", prov: SUPUESTO },
    { label: "Precio de venta a tiendas", value: "150 € por bicicleta; margen objetivo 15 %", prov: SUPUESTO },
    { label: "Fletes, gastos portuarios, transporte y agente de aduanas", value: "Flete 2.800–3.100 € por contenedor; descarga en Valencia 380 €; camión al almacén 350 €; agente 180 € (directa) o 260 € (indirecta)", prov: ESTIMACION },
    { label: "Documento de transporte", value: "El conocimiento de embarque indica como destino final el almacén de Paterna", prov: SUPUESTO },
  ],
  decisions: [
    {
      id: "proveedor", stage: "proveedor", kind: "single", title: "¿A qué proveedor compras?",
      prompt: "Tienes tres ofertas FOB por bicicleta: Taiwán 88 € (flete del contenedor 3.000 €), China 68 € (flete 2.800 €) y el mismo fabricante chino enviando el contenedor desde Malasia, a 70 € (flete 3.100 €). El arancel es del 14 % del valor en aduana y el antidumping de las bicicletas chinas, del 48,5 %. Vendes a 150 € a las tiendas. Haz la cuenta por bicicleta antes de decidir.",
      concept: "Los proveedores se comparan por el coste puesto en almacén (precio + transporte + seguro + aranceles + gastos), no por el precio en origen. Una medida antidumping es un derecho adicional sobre productos vendidos en la UE por debajo de su valor normal.",
      options: [
        { id: "taiwan", label: "El fabricante de Taiwán, aunque sea más caro en origen", grade: "correcta", feedback: (ctx) => `Más caro en origen, pero sin antidumping: ${per(ctx)("taiwan")} puestas en almacén frente a ${per(ctx)("china")} de China.` },
        { id: "china", label: "El fabricante de China: es el más barato", grade: "razonable", feedback: (ctx) => `Legal, pero el antidumping del 48,5 % sobre el valor en aduana convierte el más barato en origen en el más caro puesto en almacén (${per(ctx)("china")} por bicicleta).` },
        { id: "china_malasia", label: "El fabricante chino enviando desde Malasia, para evitar el antidumping", grade: "grave", feedback: "Es elusión de una medida antidumping: el derecho se extendió precisamente a las bicicletas enviadas desde Malasia, se declaren o no de allí, y el origen sigue siendo chino. Pagarías igual el antidumping y te expones a una regularización y a sanciones." },
      ],
      best: "taiwan", whyBest: "El coste que importa es el puesto en almacén, y el antidumping no se evita cambiando el país de envío.",
    },
    {
      id: "incoterm", stage: "contrato", kind: "single", title: "¿Con qué Incoterm compras?",
      prompt: "El proveedor te ofrece FOB en su puerto, CIF Valencia o DAP en tu almacén de Paterna. Trabajas con un transitario de confianza que te consigue buenos fletes.",
      concept: "Como comprador, en FOB contratas tú el flete y el seguro principal: controlas coste, naviera y cobertura. En CIF los contrata el vendedor, con seguro mínimo (cláusulas C). En DAP te entrega en tu almacén, pero el despacho de importación y sus impuestos siguen siendo tuyos.",
      options: [
        { id: "FOB", label: "FOB puerto de origen: contrato yo el flete y el seguro", grade: "correcta", feedback: "Controlas naviera, plazos y cobertura del seguro, y evitas el sobreprecio que el proveedor añade al flete. El riesgo es tuyo desde que la mercancía está a bordo." },
        { id: "CIF", label: "CIF Valencia", grade: "razonable", feedback: "Es habitual, pero el proveedor elige la naviera, carga un sobreprecio sobre el flete y solo está obligado a un seguro con cláusulas (C), que no cubre roturas por manipulación. Los gastos de descarga en Valencia siguen siendo tuyos." },
        { id: "DAP", label: "DAP almacén de Paterna", grade: "razonable", feedback: "Cómodo, pero pagas el transporte con el sobreprecio del proveedor y pierdes el control del flete. Y aunque te entregue en tu almacén, el despacho de importación, el arancel y el IVA siguen siendo tuyos." },
      ],
      best: "FOB", whyBest: "Con transitario propio, FOB da al importador el control del transporte y del seguro al menor coste.",
    },
    {
      id: "seguro", stage: "contrato", kind: "single", title: "¿Aseguras el transporte principal?",
      appliesIf: (ctx) => ctx.answers.incoterm === "FOB",
      prompt: "En FOB el riesgo del viaje por mar es tuyo desde que la mercancía está a bordo en el puerto de origen.",
      options: [
        { id: "a", label: "Sí, con cláusulas (A), al 110 % del valor CIF", grade: "correcta", feedback: "Cobertura amplia («todo riesgo», con exclusiones) por una prima pequeña frente al valor del contenedor." },
        { id: "c", label: "Sí, pero con cláusulas (C), la cobertura mínima", grade: "razonable", feedback: "Más barato, pero solo cubre riesgos mayores (incendio, naufragio, colisión…): una rotura por manipulación correría de tu cuenta." },
        { id: "no", label: "No: las navieras ya responden de la mercancía", grade: "grave", feedback: "La responsabilidad del porteador marítimo está limitada por convenio y tiene muchas exclusiones: sin seguro asumes casi todo el riesgo de un contenedor de varias decenas de miles de euros." },
      ],
      best: "a", whyBest: "En FOB el riesgo del transporte principal es del comprador: lo prudente es asegurarlo con cobertura amplia.",
    },
    {
      id: "pago", stage: "contrato", kind: "single", title: "¿Cómo pagas al proveedor?",
      prompt: "Es la primera compra a este proveedor y el pedido supera los 30.000 €. Acepta carta de crédito, 30 % anticipado y 70 % contra copia del conocimiento de embarque, o el 100 % por adelantado.",
      concept: "Con una carta de crédito, tu banco solo paga si el proveedor presenta los documentos que tú exiges (conocimiento de embarque, factura, certificado de origen, informe de inspección…). Una copia del conocimiento de embarque no da el control de la mercancía.",
      options: [
        { id: "carta_credito", label: "Carta de crédito documentaria, exigiendo un informe de inspección antes del embarque", grade: "correcta", feedback: "Cuesta comisiones bancarias, pero solo pagas si se embarca lo pactado y los documentos son conformes: la protección adecuada con un proveedor nuevo." },
        { id: "anticipo_30_70", label: "30 % anticipado y 70 % contra copia del conocimiento de embarque", grade: "razonable", feedback: "Sin comisiones, pero adelantas el 30 % sin garantía y pagas el resto viendo solo una copia: no compruebas qué se ha cargado." },
        { id: "anticipado", label: "100 % por adelantado para conseguir mejor precio", grade: "grave", feedback: "Con un proveedor nuevo asumes todo el riesgo: si no envía o envía otra cosa, reclamar en otro continente es lento y caro." },
      ],
      best: "carta_credito", whyBest: "En una primera operación de importe alto, el comprador se protege pagando contra documentos conformes.",
    },
    {
      id: "clasificacion", stage: "clasificacion", kind: "single", title: "¿Con qué código se declaran?",
      prompt: "Las bicicletas llegan en caja con el manillar y los pedales sin montar. El transitario pregunta qué código pone en el DUA.",
      concept: "Regla general interpretativa 2 a) del Sistema Armonizado: un artículo desmontado o sin montar se clasifica como el artículo completo si presenta sus características esenciales. Un error de clasificación cambia el arancel y las medidas aplicables.",
      options: [
        { id: "8712", label: "8712 00 30: bicicletas sin motor", grade: "correcta", feedback: "Es una bicicleta completa sin montar del todo: se clasifica como bicicleta (regla 2 a)." },
        { id: "8714", label: "8714: partes y accesorios, porque vienen desmontadas", grade: "grave", feedback: "Declarar bicicletas completas como piezas es una clasificación incorrecta: la aduana la corregiría, con liquidación de la diferencia y posible sanción. Además, las partes esenciales de bicicletas chinas también tienen medidas propias." },
        { id: "8711", label: "8711 60: ciclos con motor eléctrico", grade: "grave", feedback: "Estas bicicletas no tienen motor: el código no corresponde a la mercancía." },
      ],
      best: "8712", whyBest: "La clasificación sigue las reglas generales interpretativas: lo desmontado se clasifica como el artículo completo.",
    },
    {
      id: "origen", stage: "clasificacion", kind: "single", title: "Origen y preferencias arancelarias",
      prompt: (ctx) => supplierOf(ctx.scenario, ctx.answers).origin === "Taiwán"
        ? "Las bicicletas son de origen taiwanés. ¿Qué arancel se aplica y qué documento de origen necesitas?"
        : "Las bicicletas son de origen chino. El transitario te pregunta si hay alguna forma de no pagar el antidumping.",
      options: (ctx) => supplierOf(ctx.scenario, ctx.answers).origin === "Taiwán" ? [
        { id: "convencional", label: "Arancel convencional (no hay acuerdo preferencial con Taiwán); el certificado de origen no preferencial acredita que no son chinas", grade: "correcta", feedback: "Sin acuerdo preferencial se paga el arancel convencional. El origen no preferencial importa aquí para demostrar que no se aplica el antidumping de China." },
        { id: "eur1", label: "Pedir un EUR.1 para pagar 0 % de arancel", grade: "grave", feedback: "El EUR.1 solo sirve en los acuerdos preferenciales que lo prevén; la UE no tiene acuerdo preferencial con Taiwán (verifícalo en TARIC). Declararlo sería un origen preferencial indebido." },
        { id: "sin_documento", label: "No hace falta ningún documento de origen", grade: "razonable", feedback: "El origen se declara siempre en el DUA, y con un producto sometido a antidumping cuando es chino, la aduana puede pedirte que pruebes que no lo es." },
      ] : [
        { id: "pagar", label: "Ninguna legal: se declara el origen chino y se paga el antidumping", grade: "correcta", feedback: "El origen no se elige: lo determina dónde se fabricó. El antidumping se paga, y desde ya lo tienes en cuenta en tus precios." },
        { id: "declarar_taiwan", label: "Pedir al proveedor un certificado de origen de otro país", grade: "grave", feedback: "Sería un origen falso: fraude aduanero con regularización del derecho, intereses y sanción." },
        { id: "piezas", label: "Declararlas como piezas sueltas", grade: "grave", feedback: "Una bicicleta sin montar se clasifica como bicicleta, y las piezas esenciales chinas también tienen medidas: sería una clasificación incorrecta para eludir el derecho." },
      ],
      best: (ctx) => supplierOf(ctx.scenario, ctx.answers).origin === "Taiwán" ? "convencional" : "pagar",
      whyBest: "El origen determina el arancel y las medidas de defensa comercial; las preferencias solo existen si hay acuerdo y prueba de origen válida.",
    },
    {
      id: "valor_aduana", stage: "valoracion", kind: "multi", title: "¿Qué forma el valor en aduana?",
      allRight: "Has sumado exactamente lo que forma el valor en aduana.",
      prompt: "Marca los importes que se suman para calcular el valor en aduana sobre el que se aplican el arancel y el antidumping.",
      concept: "El valor en aduana parte del precio realmente pagado y le suma el transporte, el seguro y la manipulación hasta el lugar de entrada en la UE y los cánones que sean condición de venta. No incluye el transporte después de la entrada, las comisiones de compra ni los derechos e impuestos de importación (Código Aduanero de la Unión, arts. 70-72).",
      docs: (ctx) => [
        { id: "precio", label: "El precio de las bicicletas pagado al proveedor", need: "obligatorio", explain: "Es la base: el precio realmente pagado o por pagar." },
        { id: "flete", label: ctx.answers.incoterm === "FOB" ? "El flete marítimo hasta Valencia" : "El flete hasta Valencia (incluido en el precio del proveedor)", need: "obligatorio", explain: "El transporte hasta el lugar de entrada en la UE forma parte del valor (art. 71.1.e)." },
        { id: "seguro", label: "El seguro del transporte hasta Valencia", need: ctx.answers.incoterm === "FOB" && ctx.answers.seguro === "no" ? "innecesario" : "obligatorio", explain: "El seguro hasta la entrada en la UE se suma (art. 71.1.e); si no se contrató, no hay nada que sumar." },
        { id: "canon", label: "El canon de la marca pagado al titular", need: "obligatorio", explain: "Los cánones relacionados con la mercancía que el comprador debe pagar como condición de venta se suman (art. 71.1.c)." },
        { id: "comision", label: "La comisión de tu agente de compras", need: "incorrecto", explain: "Las comisiones de compra no se incluyen (art. 72)." },
        { id: "camion", label: "El camión del puerto de Valencia al almacén", need: "incorrecto", explain: "El transporte después de la entrada en la UE no forma parte del valor en aduana (art. 72); sí entra en la base del IVA." },
        { id: "arancel", label: "El arancel y el antidumping", need: "incorrecto", explain: "Los derechos de importación se calculan SOBRE el valor en aduana: no forman parte de él (art. 72)." },
      ],
    },
    {
      id: "representacion", stage: "despacho", kind: "single", title: "¿Quién presenta la declaración de importación?",
      prompt: "Necesitas presentar el DUA de importación para despachar a libre práctica.",
      concept: "Un representante aduanero puede actuar en representación directa (en nombre y por cuenta del importador) o indirecta (en nombre propio y por cuenta del importador). En la indirecta, el representante también es deudor de la deuda aduanera (Código Aduanero, arts. 18 y 77).",
      options: [
        { id: "directa", label: "Un agente de aduanas con representación directa: declaro yo, a través de él", grade: "correcta", feedback: "Lo habitual para un importador establecido con número EORI: tú eres el declarante y el deudor, y el agente se encarga de la tramitación." },
        { id: "indirecta", label: "Un agente de aduanas con representación indirecta", grade: "razonable", feedback: "Válido, pero el agente responde contigo de la deuda aduanera, por lo que cobra más y puede pedir garantías. Suele reservarse para quien no está establecido en la UE." },
        { id: "proveedor", label: "Que lo despache el proveedor desde Asia", grade: "grave", feedback: "Un representante aduanero debe estar establecido en la UE (art. 18.2), y en FOB, CIF o DAP la importación es tuya: el proveedor no la tramita." },
      ],
      best: "directa", whyBest: "Un importador establecido en la UE suele declarar a través de un agente en representación directa.",
    },
    {
      id: "documentos", stage: "despacho", kind: "multi", title: "¿Qué necesitas para el despacho?",
      prompt: "Marca lo que debes tener o entregar a tu agente para despachar el contenedor.",
      docs: (ctx) => [
        { id: "eori", label: "Número EORI de la empresa", need: "obligatorio", explain: "Los operadores económicos establecidos en la UE deben registrarse ante la aduana (Código Aduanero, art. 9): sin EORI no se despacha." },
        { id: "factura", label: "Factura comercial del proveedor", need: "obligatorio", explain: "Acredita el precio, base del valor en aduana." },
        { id: "bl", label: "Conocimiento de embarque (B/L)", need: "obligatorio", explain: "Documento de transporte marítimo: permite retirar la mercancía y justifica el flete y el destino." },
        { id: "packing", label: "Lista de contenido (packing list)", need: "recomendado", explain: "Facilita el reconocimiento físico si la aduana lo ordena." },
        { id: "origen", label: supplierOf(ctx.scenario, ctx.answers).origin === "Taiwán" ? "Certificado de origen no preferencial" : "Certificado de origen", need: "recomendado", explain: "Con un producto sometido a antidumping según su origen, acreditarlo evita discusiones con la aduana." },
        { id: "canon_doc", label: "Contrato de licencia de la marca (justifica el canon)", need: "recomendado", explain: "Justifica el ajuste del valor en aduana por el canon." },
        { id: "eur1", label: "Certificado EUR.1", need: "incorrecto", explain: "Solo sirve en acuerdos preferenciales que lo prevén; aquí no hay preferencia." },
        { id: "licencia", label: "Licencia de importación", need: "innecesario", explain: "Estas bicicletas no necesitan licencia de importación (compruébalo siempre en las medidas del código en TARIC)." },
      ],
    },
    {
      id: "base_iva", stage: "impuestos", kind: "single", title: "¿Cuál es la base del IVA a la importación?",
      prompt: (ctx) => {
        const r = computeImport(ctx.scenario, ctx.answers);
        return `Con tus decisiones, el valor en aduana es ${fmtEur(r.customsValue)}, los derechos de importación (arancel${r.antidumping ? " y antidumping" : ""}) suman ${fmtEur(r.duty + r.antidumping)} y la descarga y el transporte hasta el almacén (destino que figura en el conocimiento de embarque) cuestan ${fmtEur(ctx.scenario.destinationHandling + ctx.scenario.inlandTransport)}. ¿Sobre qué importe se calcula el IVA?`;
      },
      concept: "Base del IVA a la importación (Ley del IVA, art. 83): valor en aduana + derechos de importación + gastos accesorios (transporte, seguro…) hasta el primer lugar de destino en la Comunidad, que es el que figura en el documento de transporte.",
      options: (ctx) => {
        const r = computeImport(ctx.scenario, ctx.answers);
        const post = ctx.scenario.destinationHandling + ctx.scenario.inlandTransport;
        return [
          { id: "completa", label: fmtEur(r.customsValue + r.duty + r.antidumping + post), grade: "correcta", feedback: "Valor en aduana + derechos + gastos hasta el almacén, primer lugar de destino según el conocimiento de embarque." },
          { id: "sin_gastos", label: fmtEur(r.customsValue + r.duty + r.antidumping), grade: "razonable", feedback: "Faltan los gastos accesorios hasta el primer lugar de destino (descarga y camión al almacén): la base sería menor de la correcta." },
          { id: "solo_valor", label: fmtEur(r.customsValue), grade: "grave", feedback: "El IVA a la importación no se calcula solo sobre el valor en aduana: se suman los derechos de importación y los gastos hasta el primer destino." },
        ];
      },
      best: "completa", whyBest: "La base del IVA a la importación suma al valor en aduana los derechos y los gastos hasta el primer lugar de destino.",
    },
    {
      id: "iva_pago", stage: "impuestos", kind: "single", title: "¿Cómo pagas el IVA a la importación?",
      prompt: (ctx) => `El IVA de este despacho es de ${fmtEur(computeImport(ctx.scenario, ctx.answers).vat)}. Tu empresa liquida el IVA por meses y optó por el IVA diferido.`,
      concept: "Con el IVA diferido (Reglamento del IVA, art. 74.1), el importador que liquida por meses incluye la cuota liquidada por la aduana en su declaración periódica, en lugar de pagarla al despachar: no adelanta tesorería. La opción se ejerce en noviembre para el año siguiente o al darse de alta.",
      options: [
        { id: "diferido", label: "Lo incluyo en mi declaración mensual (IVA diferido)", grade: "correcta", feedback: "Lo declaras y lo deduces en la misma declaración: no adelantas el dinero." },
        { id: "aduana", label: "Lo pago al despachar y lo deduzco después", grade: "razonable", feedback: "Es correcto, pero adelantas el IVA durante semanas sin necesidad, con su coste financiero." },
        { id: "no_iva", label: "No hay que pagar IVA: la mercancía viene de fuera de la UE", grade: "grave", feedback: "Las importaciones de bienes están sujetas a IVA en España. Sin pagarlo (o diferirlo) no se despacha la mercancía." },
      ],
      best: "diferido", whyBest: "Si la empresa puede diferir el IVA a la importación, evita adelantar tesorería.",
    },
    {
      id: "canal_rojo", stage: "mercado", kind: "single", incident: true, title: "Incidencia: canal rojo",
      prompt: "El DUA sale por canal rojo: la aduana ordena el reconocimiento físico del contenedor. Mientras, el puerto cobra almacenaje.",
      concept: "Los controles de la aduana son documentales (canal naranja) o físicos (canal rojo). Tener los documentos completos y coherentes acorta el despacho; los gastos de almacenaje y manipulación del reconocimiento los paga el importador.",
      options: [
        { id: "facilitar", label: "Facilitar el reconocimiento: tu agente aporta packing list, factura, contrato de licencia y certificado de origen", grade: "correcta", feedback: "Con la documentación coherente el reconocimiento se resuelve en dos días. Pagas el almacenaje y la manipulación del reconocimiento.", extraCost: () => ({ label: "Almacenaje y manipulación por el reconocimiento físico", amount: 240, note: "Dos días de almacenaje y apertura del contenedor (simulado)." }) },
        { id: "reclamar", label: "Reclamar a la aduana que pague el almacenaje", grade: "razonable", feedback: "Los gastos derivados del control los asume el importador: la reclamación no prospera y retrasa la retirada otros días.", extraCost: () => ({ label: "Almacenaje y manipulación por el reconocimiento físico (con retraso)", amount: 480, note: "Cuatro días de almacenaje y la apertura del contenedor (simulado)." }) },
        { id: "atajo", label: "Pedir al agente que «agilice» el trámite con un pago en metálico al funcionario", grade: "grave", feedback: "Es un delito de cohecho. Nunca es una opción.", extraCost: () => ({ label: "Almacenaje y manipulación por el reconocimiento físico (con retraso)", amount: 480, note: "El agente se niega y el despacho sigue su curso, con más días de almacenaje (simulado)." }) },
      ],
      best: "facilitar", whyBest: "Ante un control, documentación completa y colaboración: es lo que acorta el despacho.",
    },
    {
      id: "puesta_mercado", stage: "mercado", kind: "single", title: "Antes de vender las bicicletas",
      prompt: "Las bicicletas ya están en tu almacén. Eres el importador: el primero que las introduce en el mercado de la UE.",
      concept: "El Real Decreto 339/2014 exige que cada bicicleta comercializada en España vaya acompañada de la documentación que acredite que cumple sus requisitos, de un manual de instrucciones (al menos en castellano si el original no lo está) y de una placa con el fabricante y el número de serie.",
      options: [
        { id: "comprobar", label: "Comprobar la documentación de conformidad, que cada bicicleta tenga placa con fabricante y número de serie y que el manual esté en castellano", grade: "correcta", feedback: "Es lo que exige el RD 339/2014 antes de comercializarlas. Si el manual no está en castellano, hay que traducirlo antes de vender." },
        { id: "fiarse", label: "Basta con que el proveedor confirme por correo que cumplen", grade: "razonable", feedback: "Una declaración informal no sustituye a la documentación que acredita el cumplimiento, y si una autoridad de consumo inspecciona, el responsable de la comercialización eres tú." },
        { id: "nada", label: "Nada: si han pasado la aduana, ya se pueden vender", grade: "grave", feedback: "El despacho aduanero no comprueba la seguridad del producto. Sin la documentación, el manual y la placa, las autoridades pueden retirar las bicicletas del mercado y sancionar." },
      ],
      best: "comprobar", whyBest: "Quien introduce un producto en el mercado de la UE debe asegurarse de que cumple la normativa de seguridad que le aplica.",
    },
  ],
};
