import { companyInputSchema, type CompanyInput } from "../types";

/**
 * PILOTO: vino embotellado (HS 220421) en Japón. Datos REALES recogidos a mano el 28/10/2026 mediante búsqueda web y
 * lectura de páginas públicas (no son datos de demostración). Cada afirmación remite a su URL. El nivel de evidencia no
 * se guarda: se deduce de las pruebas (rules.ts). Revisar y actualizar antes de usar: las webs cambian.
 * Origen de la investigación: asistente durante el desarrollo; no es un servicio en vivo.
 */
const D = "2026-10-28";
const ARG_LIST = {
  url: "https://ejapo.cancilleria.gob.ar/userfiles/japanese_importers_of_argentine_wines_oct2025.pdf",
  title: "Listado oficial de importadores y distribuidores de vino en Japón (octubre 2025)",
  sourceType: "gobierno" as const,
  howConsulted: "pagina_leida" as const,
  consultedAt: D,
  publishedAt: "2025-10-01",
  claims: ["categoria" as const],
  summary: "Listado de la cancillería argentina con importadores y distribuidores de vino en Japón y su web oficial; sirve como prueba de actividad con vino (el listado es de vinos argentinos).",
};

const raw: unknown[] = [
  {
    id: "jp-mikuni-wine", name: "Mikuni Wine Co., Ltd.", nameLocal: "三国ワイン株式会社", country: "JP", city: "Tokio (Chuo-ku)",
    website: "https://www.mikuniwine.co.jp/", websiteStatus: "verificada", type: "importador",
    brands: ["C.V.N.E. (Cune)", "Domaine Alain Brumont", "Undurraga", "Zonin", "ロジャーグラート (cava)"],
    evidence: [
      { url: "https://www.mikuniwine.co.jp/", title: "Sitio oficial (página principal)", sourceType: "corporativa", howConsulted: "pagina_leida", consultedAt: D, claims: ["categoria"],
        summary: "Web oficial con catálogo de vinos por bodega (entre ellas C.V.N.E., grupo español), buscador de producto «vino» y metadatos que la describen como importador." },
      { url: "https://www.mikuniwine.co.jp/?mode=grp&gid=2684935", title: "Ficha oficial de Cune (España)", sourceType: "corporativa", howConsulted: "extracto_buscador", consultedAt: D, claims: ["origen_espana"],
        summary: "Página oficial de producto que presenta Cune, Rioja clásico de España, dentro de su catálogo." },
      { url: "https://www.mikuniwine.co.jp/?mode=f6", title: "Filosofía de empresa (oficial)", sourceType: "corporativa", howConsulted: "extracto_buscador", consultedAt: D, claims: ["categoria"],
        summary: "La propia empresa se define como importador de vinos de productores identificables." },
      { url: "https://www.mikuniwine.co.jp/?mode=f7", title: "Sedes y teléfonos (oficial)", sourceType: "corporativa", howConsulted: "pagina_leida", consultedAt: D, claims: [],
        summary: "Direcciones y teléfonos de la sede de Tokio y de las sucursales de Osaka, Nagoya y Fukuoka." },
      { url: "https://wineguide.jp/importer/mikuniwine/", title: "Directorio de importadores de vino (Wine Guide)", sourceType: "directorio", howConsulted: "extracto_buscador", consultedAt: D, claims: ["categoria", "origen_espana"],
        summary: "Directorio que la lista como importador con vinos de España, entre otros orígenes; indica que pertenece al grupo CVNE desde 2014." },
      ARG_LIST,
      { url: "https://wineindustryadvisor.com/2014/03/31/cune-buys-mikuni-wine", title: "CVNE compra Mikuni Wine (2014)", sourceType: "prensa", howConsulted: "extracto_buscador", consultedAt: D, publishedAt: "2014-03-31", claims: ["categoria"],
        summary: "Nota de 2014: el productor español CVNE adquirió Mikuni Wine, distribuidor japonés de vinos premium." },
    ],
    contact: { contactPageUrl: "https://mikuniwine.shop-pro.jp/customer/inquiries/new", phone: "+81 3-5542-3940 (ventas)", phoneSourceUrl: "https://www.mikuniwine.co.jp/?mode=f7" },
    reason: "Importador de vino de ámbito nacional con web oficial, catálogo con bodegas españolas y canales de contacto oficiales publicados.",
    pending: ["Nombre y cargo del responsable de compras: sin fuente pública fiable", "Correo comercial: la web solo ofrece formulario", "Interés en vinos de pequeños productores españoles ajenos al grupo CVNE: sin verificar"],
    notes: ["Filial al 100 % del grupo español C.V.N.E. desde 2014 (prensa del sector): puede priorizar la cartera del grupo.", "Línea principal: +81 3-5542-3939 (página oficial de sedes)."],
    origin: "curado",
  },
  {
    id: "jp-nihon-shurui-hanbai", name: "Nihon Shurui Hanbai Co., Ltd. (Nishuhan)", nameLocal: "日本酒類販売株式会社", country: "JP", city: "Tokio (Chuo-ku)",
    website: "https://www.nishuhan.co.jp/", websiteStatus: "verificada", type: "mayorista",
    brands: ["Codorníu", "Viña Pomal", "Scala Dei"],
    evidence: [
      { url: "https://www.nishuhan.co.jp/news/2021/20210423.html", title: "Comunicado oficial (23/04/2021): cava y vinos españoles de Codorníu", sourceType: "corporativa", howConsulted: "pagina_leida", consultedAt: D, publishedAt: "2021-04-23", claims: ["categoria", "origen_espana"],
        summary: "Comunicado oficial: trabaja con Codorníu desde 2011, importa y vende vinos tranquilos españoles y lanza 20 referencias de cava." },
      { url: "https://www.nishuhan.co.jp/company/profile.html", title: "Perfil de empresa (oficial)", sourceType: "corporativa", howConsulted: "extracto_buscador", consultedAt: D, claims: [],
        summary: "Mayorista de bebidas con sede en Tokio y unas 700 personas de plantilla; ventas consolidadas de 605.900 millones de yenes en el ejercicio 2026." },
      { url: "https://news.nissyoku.co.jp/news/oka20260902032406873", title: "Prensa del sector (2 sept. 2026, contenido de pago)", sourceType: "prensa", howConsulted: "extracto_buscador", consultedAt: D, publishedAt: "2026-09-02", claims: ["categoria", "origen_espana"],
        summary: "Solo se leyó el extracto: la empresa celebró un seminario de marca de un vino español de importación directa (Bodegas Bilbaínas, Rioja)." },
      ARG_LIST,
    ],
    contact: { contactPageUrl: "https://www.nishuhan.co.jp/contact/" },
    reason: "Gran mayorista de bebidas que declara importar y vender vinos españoles, con formulario oficial con categoría «importación».",
    pending: ["Teléfono y correo de compras/importación: sin verificar (solo formulario)", "El comunicado con Codorníu es de 2021: confirmar que la cartera sigue vigente", "Responsable de compras: sin fuente pública fiable"],
    notes: ["La empresa publicó un aviso (26/12/2025) sobre correos que suplantan a sus directivos: contactar solo por sus canales oficiales."],
    origin: "curado",
  },
  {
    id: "jp-para-japan", name: "Para Japan Co., Ltd.", nameLocal: "株式会社パラジャパン", country: "JP", city: "Yokohama (Kohoku-ku)",
    website: null, websiteStatus: "sin_verificar", type: "importador", brands: [],
    evidence: [{ url: "https://www.inshokuten.com/supplier/company/650", title: "Directorio B2B Inshokuten", sourceType: "directorio", howConsulted: "extracto_buscador", consultedAt: D, claims: ["categoria", "origen_espana"],
      summary: "Directorio japonés de proveedores: actividad «importación y venta de vino español»; fundada en 2000." }],
    contact: {},
    reason: "Aparece en un directorio B2B como importador de vino español.",
    pending: ["Web oficial y contacto: no localizados", "Datos del directorio sin contrastar con la empresa"], notes: [], origin: "curado",
  },
  {
    id: "jp-ornis", name: "Ornis Co., Ltd.", nameLocal: "オルニス株式会社", country: "JP", city: "Tokio (Meguro-ku)",
    website: null, websiteStatus: "sin_verificar", type: "importador", brands: ["Bodega La Quinta"],
    evidence: [{ url: "https://www.atpress.ne.jp/news/167992", title: "Comunicado de la propia empresa (2018)", sourceType: "prensa", howConsulted: "extracto_buscador", consultedAt: D, publishedAt: "2018-10-11", claims: ["categoria", "origen_espana"],
      summary: "Comunicado distribuido por la empresa: primera importación a Japón de dos vinos de la bodega española Bodega La Quinta." }],
    contact: {},
    reason: "Importó por primera vez en Japón vinos de una bodega española (comunicado propio de 2018).",
    pending: ["Actividad actual: el comunicado es de 2018", "Web oficial y contacto: no verificados"], notes: [], origin: "curado",
  },
  {
    id: "jp-pieroth-japan", name: "Pieroth Japan K.K.", nameLocal: "ピーロート・ジャパン株式会社", country: "JP", city: null,
    website: "https://www.pieroth.jp", websiteStatus: "segun_listado", type: "distribuidor", brands: [],
    evidence: [ARG_LIST, { url: "https://compalyze.co.jp/company/1010401024810", title: "Ficha corporativa (agregador de datos de empresas)", sourceType: "directorio", howConsulted: "extracto_buscador", consultedAt: D, claims: ["categoria"],
      summary: "Describe venta directa de vino a particulares y venta a hoteles, restaurantes, tiendas y grandes superficies en todo el país." }],
    contact: {},
    reason: "Distribuidor de vino de ámbito nacional con canal profesional (listado oficial y ficha corporativa).",
    pending: ["Interés en vino español: sin verificar", "Contacto de compras: no verificado"], notes: ["Orientado en buena parte a venta directa al consumidor."], origin: "curado",
  },
  ...[
    { id: "jp-mottox", name: "Mottox Inc.", nameLocal: "株式会社モトックス", website: "https://www.mottox.co.jp/en/" },
    { id: "jp-enoteca", name: "Enoteca Co., Ltd.", nameLocal: "エノテカ株式会社", website: "https://www.enoteca.co.jp" },
    { id: "jp-yamaya", name: "Yamaya Corporation", nameLocal: "株式会社やまや", website: "https://www.yamaya.jp" },
    { id: "jp-kokubu", name: "Kokubu Group Corp.", nameLocal: "国分グループ本社株式会社", website: "https://www.kokubu.co.jp/" },
  ].map((c) => ({
    ...c, country: "JP", city: null, websiteStatus: "segun_listado", type: "mixto", brands: [],
    evidence: [ARG_LIST], contact: {},
    reason: "Figura en un listado oficial de importadores y distribuidores de vino en Japón (octubre 2025).",
    pending: ["El listado es de vinos argentinos: origen español sin verificar", "Web no visitada (URL tomada del listado)", "Contacto de compras: no verificado"], notes: [], origin: "curado",
  })),
];

export const WINE_JP: CompanyInput[] = raw.map((r) => companyInputSchema.parse(r));
