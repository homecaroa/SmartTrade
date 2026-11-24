import type { Grade } from "./model";

/**
 * Preguntas del oficio (reglas 2, 24/11/2026): aparecen en las semanas tranquilas, una como mucho, sin repetirse, y
 * cuentan para el dominio, no para el dinero. Cubren los módulos del ciclo que trabaja el simulador: 0622 transporte,
 * 0625 almacén y 0623 gestión económica (docs/curriculo.md).
 *
 * Toda norma citada está leída en el BOE (fechas en el Manual y en docs/simulador.md §19 y docs/simulador-campana.md);
 * lo que es buena práctica o concepto de gestión se dice así, sin citar norma.
 */
export interface QuizQ {
  id: string; topic: string;
  /** Nivel (índice) desde el que puede salir. */
  from: number;
  competences: string[];
  prompt: string; hint: string;
  concept?: string;
  options: { id: string; label: string; grade: Grade; feedback: string }[];
}

const q = (x: QuizQ) => x;

export const QUIZ: QuizQ[] = [
  // ── Transporte: documentos y contrato (0622) ──
  q({ id: "doc-control", topic: "documento de control", from: 0, competences: ["0622-RA5"], concept: "documento-control",
    prompt: "En un transporte público de mercancías por carretera dentro de España, ¿qué documento tiene que ir a bordo?",
    hint: "Identifica cada envío: quién carga, quién transporta, qué y adónde.",
    options: [
      { id: "ok", label: "El documento de control del envío, o una carta de porte que tenga sus datos", grade: "correcta", feedback: "Correcto: Orden FOM/2861/2012, arts. 1, 2.2 y 3." },
      { id: "factura", label: "La factura del transporte", grade: "grave", feedback: "La factura es un documento contable; no sustituye al documento de control (Orden FOM/2861/2012)." },
      { id: "nada", label: "Ninguno si el viaje es corto", grade: "grave", feedback: "La obligación no depende de la distancia (Orden FOM/2861/2012, art. 1)." },
    ] }),
  q({ id: "recibo", topic: "recibo de entrega", from: 0, competences: ["0622-RA5", "0622-RA6"], concept: "recibo-entrega",
    prompt: "Al entregar la mercancía, ¿qué puede exigir el transportista al destinatario?",
    hint: "Es lo que te protege si días después alguien dice que no llegó o que llegó mal.",
    options: [
      { id: "ok", label: "Un recibo de la mercancía entregada", grade: "correcta", feedback: "Correcto: Ley 15/2009, art. 12." },
      { id: "pago", label: "Que le pague el porte en ese momento", grade: "grave", feedback: "Quién paga y cuándo lo dice el contrato; el recibo es otra cosa (art. 12)." },
      { id: "nada", label: "Nada: basta con dejarla", grade: "grave", feedback: "Sin recibo no puedes probar la entrega (art. 12)." },
    ] }),
  q({ id: "reservas", topic: "reservas por daños", from: 0, competences: ["0622-RA6"], concept: "recibo-entrega",
    prompt: "¿Cuánto tiene el destinatario para hacer reservas por daños que no se veían al recibir la mercancía?",
    hint: "Pasado ese plazo sin reservas, se presume algo.",
    options: [
      { id: "ok", label: "7 días naturales; si no, se presume que llegó como dice la carta de porte", grade: "correcta", feedback: "Correcto: Ley 15/2009, art. 60.1." },
      { id: "30", label: "30 días", grade: "grave", feedback: "Para daños no aparentes son 7 días (art. 60.1)." },
      { id: "siempre", label: "Puede reclamar cuando quiera", grade: "grave", feedback: "Hay plazo para las reservas (art. 60.1)." },
    ] }),
  q({ id: "responsabilidad", topic: "desde cuándo respondes", from: 0, competences: ["0622-RA4"],
    prompt: "¿Desde cuándo y hasta cuándo responde el transportista de la mercancía?",
    hint: "Piensa en el momento en que la tienes bajo tu custodia.",
    options: [
      { id: "ok", label: "Desde que la recibe hasta que la entrega", grade: "correcta", feedback: "Correcto: Ley 15/2009, art. 47.1." },
      { id: "ruta", label: "Solo mientras el camión circula", grade: "grave", feedback: "También responde de ella parado y en sus instalaciones, desde que la recibe (art. 47.1)." },
      { id: "nunca", label: "Nunca: la mercancía viaja por cuenta del cargador", grade: "grave", feedback: "El transportista responde de la pérdida y la avería desde la recepción hasta la entrega (art. 47.1)." },
    ] }),
  q({ id: "subcontratar", topic: "subcontratar un transporte", from: 0, competences: ["0622-RA3"], concept: "subcontratar",
    prompt: "Contratas un transporte con un cliente y lo hace un subcontratista. Llega con retraso. ¿A quién reclama el cliente?",
    hint: "¿Con quién firmó el contrato?",
    options: [
      { id: "ok", label: "A ti: respondes del transporte entero aunque no lo hagas tú", grade: "correcta", feedback: "Correcto: Ley 15/2009, art. 6.1. Luego tú puedes reclamar a tu subcontratista." },
      { id: "sub", label: "Al subcontratista, que es quien lo hizo", grade: "grave", feedback: "El cliente contrató contigo: respondes tú frente a él (art. 6.1)." },
      { id: "nadie", label: "A nadie: el retraso no se indemniza", grade: "grave", feedback: "El retraso se indemniza, con el límite del precio del transporte (arts. 56 y 57.2)." },
    ] }),
  q({ id: "estiba", topic: "carga y estiba", from: 0, competences: ["0622-RA4"], concept: "estiba",
    prompt: "Si no se pacta nada, ¿quién carga y estiba la mercancía?",
    hint: "Puede cambiarse, pero con una condición.",
    options: [
      { id: "ok", label: "El cargador, salvo pacto por escrito con el transportista y con suplemento", grade: "correcta", feedback: "Correcto: Ley 15/2009, art. 20.1." },
      { id: "transportista", label: "Siempre el transportista", grade: "grave", feedback: "Es del cargador salvo pacto escrito (art. 20.1)." },
      { id: "destino", label: "El destinatario", grade: "grave", feedback: "El destinatario descarga en su caso; la carga y la estiba son del cargador salvo pacto (art. 20.1)." },
    ] }),
  q({ id: "paralizacion", topic: "esperas para cargar o descargar", from: 1, competences: ["0622-RA6"], concept: "paralizacion",
    prompt: "Te tienen esperando para descargar. ¿Desde cuándo tienes derecho a indemnización por paralización?",
    hint: "La ley cambió en 2022.",
    options: [
      { id: "ok", label: "Si esperas más de una hora, sin contar la primera", grade: "correcta", feedback: "Correcto: Ley 15/2009, art. 22, redacción vigente desde 2022." },
      { id: "dos", label: "Pasadas dos horas, sin contar las dos primeras", grade: "razonable", feedback: "Era la redacción de 2009; desde 2022 es más de una hora, sin contar la primera (art. 22)." },
      { id: "nunca", label: "Nunca: esperar forma parte del servicio", grade: "grave", feedback: "La ley reconoce la indemnización por paralización (art. 22)." },
    ] }),
  q({ id: "ausente", topic: "destinatario ausente", from: 1, competences: ["0622-RA6"], concept: "paralizacion",
    prompt: "Llegas a entregar y el destinatario no está. ¿Qué haces?",
    hint: "¿De quién son las instrucciones sobre la mercancía?",
    options: [
      { id: "ok", label: "Avisar al cargador y esperar sus instrucciones; los gastos los paga él", grade: "correcta", feedback: "Correcto: Ley 15/2009, art. 36." },
      { id: "puerta", label: "Dejarla en la puerta con una foto", grade: "grave", feedback: "Hasta la entrega respondes tú de ella (art. 47.1); hay que pedir instrucciones (art. 36)." },
      { id: "vender", label: "Llevártela y venderla para cobrar el porte", grade: "grave", feedback: "No: se avisa al cargador y se siguen sus instrucciones (art. 36)." },
    ] }),
  q({ id: "valor", topic: "límite de responsabilidad", from: 1, competences: ["0622-RA4", "0622-RA7"], concept: "declaracion-valor",
    prompt: "Llevas mercancía de mucho valor y se pierde. ¿Respondes de todo su valor?",
    hint: "La ley pone un tope por kilo. ¿Cómo se sube?",
    options: [
      { id: "ok", label: "Hasta el límite legal, salvo que se haya declarado el valor en la carta de porte", grade: "correcta", feedback: "Correcto: Ley 15/2009, arts. 57.1 y 61." },
      { id: "todo", label: "Siempre de todo su valor", grade: "grave", feedback: "Hay un límite legal; por encima, solo si se declaró el valor (art. 61)." },
      { id: "nada", label: "De nada: para eso está el seguro del cliente", grade: "grave", feedback: "Respondes hasta el límite legal (art. 57.1)." },
    ] }),
  q({ id: "retraso", topic: "indemnización por retraso", from: 1, competences: ["0622-RA6"],
    prompt: "Por un retraso tuyo, el cliente pierde una venta de 5.000 €. El porte costaba 400 €. ¿Cuánto le debes como mucho?",
    hint: "La ley pone un tope al retraso.",
    options: [
      { id: "ok", label: "El perjuicio probado, con un máximo del precio del transporte: 400 €", grade: "correcta", feedback: "Correcto: Ley 15/2009, arts. 56 y 57.2." },
      { id: "todo", label: "Los 5.000 €", grade: "grave", feedback: "Por retraso, como mucho el precio del transporte (art. 57.2)." },
      { id: "cero", label: "Nada, el retraso no se indemniza", grade: "grave", feedback: "Se indemniza el perjuicio, con ese límite (arts. 56 y 57.2)." },
    ] }),
  q({ id: "combustible", topic: "revisión por el gasóleo", from: 2, competences: ["0622-RA3"], concept: "revision-combustible",
    prompt: "El gasóleo sube un 8 % entre que firmas un transporte y lo haces. ¿Qué pasa con el precio?",
    hint: "Hay un umbral, y no se puede renunciar.",
    options: [
      { id: "ok", label: "Se revisa automáticamente según el peso del gasóleo en tus costes; el pacto en contra es nulo", grade: "correcta", feedback: "Correcto: Ley 15/2009, art. 38 (revisión desde una variación del 5 %, desglosada en la factura)." },
      { id: "fijo", label: "Nada: el precio firmado es el que vale", grade: "grave", feedback: "La revisión es obligatoria y el pacto en contra es nulo (art. 38.3)." },
      { id: "negociar", label: "Solo si el cliente acepta", grade: "grave", feedback: "Es automática desde un 5 % (art. 38.2)." },
    ] }),
  q({ id: "autorizacion", topic: "autorización de transporte", from: 1, competences: ["0622-RA1"], concept: "autorizacion",
    prompt: "Haces transporte público de mercancías con una furgoneta de 3.500 kg. ¿Necesitas autorización de transporte?",
    hint: "Hay una exención por peso, pero ¿hasta cuántas toneladas en el transporte público?",
    options: [
      { id: "ok", label: "Sí: en el transporte público solo están exentos los vehículos de hasta 2 toneladas", grade: "correcta", feedback: "Correcto: LOTT, art. 42.1, y ROTT, art. 33.2.d (hasta 2 t; 2,5 t para algunos N1 de combustibles alternativos). La exención de 3,5 t es para el transporte privado complementario (LOTT, art. 103.2.e)." },
      { id: "no", label: "No: hasta 3,5 toneladas no hace falta", grade: "grave", feedback: "Esa exención es del transporte privado complementario (LOTT, art. 103.2.e). En el público, solo hasta 2 t (ROTT, art. 33.2.d)." },
      { id: "camion", label: "Solo los camiones grandes necesitan autorización", grade: "grave", feedback: "La regla general es que todo transporte público la necesita (LOTT, art. 42.1), con pocas exenciones (ROTT, art. 33.2)." },
    ] }),
  // ── Cobros y plazos (0623) ──
  q({ id: "plazo-pago", topic: "plazo de pago entre empresas", from: 1, competences: ["0623-RA5"], concept: "plazos-legales",
    prompt: "Un cliente te propone pagar tus servicios a 75 días. ¿Es legal pactarlo?",
    hint: "Hay un plazo general y un máximo por pacto.",
    options: [
      { id: "ok", label: "No: por pacto, como mucho 60 días", grade: "correcta", feedback: "Correcto: Ley 3/2004, art. 4.3. Y en el transporte por carretera el cargador entra en mora a los 30 días (Ley 15/2009, art. 41)." },
      { id: "si", label: "Sí, si los dos lo firman", grade: "grave", feedback: "Por encima de 60 días el pacto no vale (Ley 3/2004, arts. 4.3 y 9)." },
      { id: "120", label: "Sí, hasta 120 días", grade: "grave", feedback: "El máximo por pacto es de 60 días (art. 4.3)." },
    ] }),
  q({ id: "mora", topic: "cliente que paga tarde", from: 2, competences: ["0623-RA5"], concept: "plazos-legales",
    prompt: "Un cliente se retrasa en pagarte. ¿Qué puedes reclamarle además de la factura?",
    hint: "La mora es automática.",
    options: [
      { id: "ok", label: "Intereses de demora y 40 € fijos por los costes de cobro", grade: "correcta", feedback: "Correcto: Ley 3/2004, arts. 5, 7 y 8 (intereses: tipo del BCE más 8 puntos)." },
      { id: "nada", label: "Nada hasta que le envíes un burofax", grade: "grave", feedback: "La mora es automática, sin necesidad de aviso (art. 5)." },
      { id: "doble", label: "El doble de la factura", grade: "grave", feedback: "Se deben intereses de demora y 40 € (arts. 7 y 8), no una penalización así." },
    ] }),
  // ── Almacén (0625) ──
  q({ id: "albaran", topic: "recepción en el almacén", from: 1, competences: ["0625-RA2"], concept: "albaran",
    prompt: "Llega un camión con 30 palés a tu nave. ¿Qué haces antes de firmar?",
    hint: "Lo que firmas es lo que luego tendrás que devolver.",
    options: [
      { id: "ok", label: "Contar los palés y revisar su estado, y anotar en el albarán cualquier diferencia", grade: "correcta", feedback: "Correcto: el albarán de entrada con recuento y estado es lo que prueba qué recibiste (buena práctica de almacén)." },
      { id: "firmar", label: "Firmar para no hacer esperar al conductor", grade: "grave", feedback: "Si luego faltan palés, tu firma dice que entraron todos." },
      { id: "despues", label: "Firmar y contarlos al día siguiente", grade: "razonable", feedback: "Mejor que nada, pero la diferencia ya no se puede anotar con el conductor delante." },
    ] }),
  q({ id: "fifo", topic: "rotación de existencias", from: 1, competences: ["0625-RA4"],
    prompt: "Guardas yogures de un cliente. ¿Qué palés sacas primero?",
    hint: "Lo que caduca antes…",
    options: [
      { id: "ok", label: "Los que caducan antes (FEFO)", grade: "correcta", feedback: "Correcto: con mercancía perecedera manda la fecha de caducidad (FEFO). Para el resto suele usarse FIFO: lo primero que entra, primero sale." },
      { id: "lifo", label: "Los últimos que entraron (LIFO)", grade: "grave", feedback: "Con perecederos dejarías caducar lo antiguo." },
      { id: "cerca", label: "Los que estén más cerca de la puerta", grade: "razonable", feedback: "Ahorra tiempo, pero puede dejar caducar mercancía: primero manda la fecha." },
    ] }),
  q({ id: "abc", topic: "clasificación ABC", from: 1, competences: ["0625-RA2"],
    prompt: "¿Para qué sirve la clasificación ABC en un almacén?",
    hint: "No todos los productos se mueven igual.",
    options: [
      { id: "ok", label: "Para poner lo que más se mueve (A) cerca de la salida y dedicarle más control", grade: "correcta", feedback: "Correcto: pocas referencias concentran la mayor parte de los movimientos; colocarlas bien ahorra recorridos." },
      { id: "alfa", label: "Para ordenar los productos alfabéticamente", grade: "grave", feedback: "Clasifica por importancia (movimientos o valor), no por nombre." },
      { id: "precio", label: "Para fijar el precio de cada producto", grade: "grave", feedback: "Es una herramienta de organización y control de existencias." },
    ] }),
  q({ id: "ocupacion", topic: "coste del almacén", from: 1, competences: ["0625-RA3"],
    prompt: "Tu nave de 200 palés te cuesta 1.200 € al mes. Si la tienes a la mitad, ¿cuánto te cuesta cada palé guardado al mes?",
    hint: "El alquiler se paga igual, esté llena o vacía.",
    options: [
      { id: "ok", label: "12 €: el coste fijo se reparte entre 100 palés", grade: "correcta", feedback: "Correcto: 1.200 ÷ 100. Con la nave llena serían 6 €. La ocupación decide tu coste por palé." },
      { id: "seis", label: "6 €, como siempre", grade: "grave", feedback: "6 € sería con la nave llena: el alquiler no baja con la ocupación." },
      { id: "cero", label: "Nada: el alquiler ya está pagado", grade: "grave", feedback: "Es un coste fijo que hay que repartir entre lo que guardas." },
    ] }),
  // ── Gestión económica (0623) ──
  q({ id: "margen", topic: "margen de contribución", from: 0, competences: ["0623-RA7"], concept: "margen-contribucion",
    prompt: "Cobras 0,90 €/km y tu coste variable es de 0,22 €/km. ¿Cuál es tu margen de contribución por km?",
    hint: "Precio menos coste variable.",
    options: [
      { id: "ok", label: "0,68 €: lo que cada km aporta para pagar los fijos", grade: "correcta", feedback: "Correcto: 0,90 − 0,22." },
      { id: "bene", label: "0,68 € de beneficio por km", grade: "razonable", feedback: "El número es el bueno, pero no es beneficio: todavía hay que pagar los costes fijos." },
      { id: "90", label: "0,90 €", grade: "grave", feedback: "Eso es el precio: hay que restar el coste variable." },
    ] }),
  q({ id: "caja-beneficio", topic: "beneficio y caja", from: 2, competences: ["0623-RA7"], concept: "ciclo-caja",
    prompt: "Tu empresa gana dinero todos los meses, pero se queda sin caja. ¿Cómo puede ser?",
    hint: "¿Cuándo cobras y cuándo pagas?",
    options: [
      { id: "ok", label: "Porque cobras más tarde de lo que pagas y, si creces, esa diferencia crece", grade: "correcta", feedback: "Correcto: el ciclo de caja. Se puede quebrar con beneficios." },
      { id: "error", label: "Es imposible: si ganas dinero, tienes caja", grade: "grave", feedback: "Beneficio y caja no van al mismo ritmo: las ventas se cobran más tarde." },
      { id: "robo", label: "Alguien se lleva el dinero", grade: "grave", feedback: "Lo normal es el desfase entre cobros y pagos." },
    ] }),
  q({ id: "amortizacion", topic: "inversión y amortización", from: 1, competences: ["0623-RA6"], concept: "inversion-gasto",
    prompt: "Compras estanterías por 6.000 € que te durarán 5 años. ¿Cuánto gasto te cuesta este año?",
    hint: "Una inversión se reparte entre los años que la usas.",
    options: [
      { id: "ok", label: "1.200 €: la amortización de un año (6.000 ÷ 5)", grade: "correcta", feedback: "Correcto: la caja sale entera hoy, pero el gasto se reparte en su vida útil." },
      { id: "todo", label: "6.000 €", grade: "grave", feedback: "Eso es lo que sale de la caja; el gasto contable es la amortización del año." },
      { id: "nada", label: "Nada, porque es una inversión", grade: "grave", feedback: "La inversión se convierte en gasto poco a poco: la amortización." },
    ] }),
  q({ id: "coste-persona", topic: "lo que cuesta una persona", from: 3, competences: ["0623-RA7", "0625-RA2"], concept: "coste-empresa",
    prompt: "Contratas a alguien indefinido con 1.600 € brutos al mes. ¿Cuánto te cuesta, más o menos?",
    hint: "La empresa también cotiza.",
    options: [
      { id: "ok", label: "Unos 2.100 €: el bruto más las cotizaciones de la empresa (alrededor de un 30 %)", grade: "correcta", feedback: "Correcto: en 2026, 23,60 % de contingencias comunes, 5,50 % de desempleo, 0,20 % de FOGASA, 0,60 % de formación y 0,75 % de MEI (Orden PJC/297/2026), más accidentes de trabajo." },
      { id: "bruto", label: "1.600 €", grade: "grave", feedback: "Falta lo que cotiza la empresa, alrededor de un 30 % más." },
      { id: "neto", label: "Menos de 1.600 €, porque se le retiene el IRPF", grade: "grave", feedback: "La retención baja lo que cobra la persona, no lo que te cuesta a ti." },
    ] }),
  q({ id: "punto-muerto", topic: "punto muerto", from: 0, competences: ["0623-RA7"], concept: "punto-muerto",
    prompt: "Tus fijos son 600 € a la semana y cada km te deja 0,60 € de margen. ¿Cuántos km necesitas para no perder dinero?",
    hint: "Fijos ÷ margen por unidad.",
    options: [
      { id: "ok", label: "1.000 km a la semana", grade: "correcta", feedback: "Correcto: 600 ÷ 0,60." },
      { id: "600", label: "600 km", grade: "grave", feedback: "Eso sería con un margen de 1 € por km." },
      { id: "360", label: "360 km", grade: "grave", feedback: "Has multiplicado: hay que dividir los fijos entre el margen." },
    ] }),
  q({ id: "fianza", topic: "fianza del alquiler", from: 1, competences: ["0623-RA4"], concept: "fianza",
    prompt: "Alquilas una nave por 1.000 € al mes. ¿Qué fianza te exige la ley?",
    hint: "Uso distinto de vivienda.",
    options: [
      { id: "ok", label: "2.000 €: dos mensualidades", grade: "correcta", feedback: "Correcto: LAU, art. 36.1. Y no es un gasto: la recuperas al irte." },
      { id: "uno", label: "1.000 €: una mensualidad", grade: "grave", feedback: "Para un local o una nave (uso distinto de vivienda) son dos mensualidades (art. 36.1)." },
      { id: "nada", label: "Ninguna", grade: "grave", feedback: "Es obligatoria (LAU, art. 36.1)." },
    ] }),
];
