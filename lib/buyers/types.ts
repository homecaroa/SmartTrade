import { z } from "zod";

export const EVIDENCE_LEVELS = ["confirmado", "probable", "insuficiente"] as const;
export const COMPANY_TYPES = ["importador", "distribuidor", "mayorista", "minorista", "mixto", "otro"] as const;
export const SOURCE_TYPES = ["corporativa", "gobierno", "feria", "asociacion", "directorio", "prensa", "empleo", "otra"] as const;

export type EvidenceLevel = (typeof EVIDENCE_LEVELS)[number];
export type CompanyType = (typeof COMPANY_TYPES)[number];
export type SourceType = (typeof SOURCE_TYPES)[number];

export const TYPE_LABEL: Record<CompanyType, string> = {
  importador: "Importador", distribuidor: "Distribuidor", mayorista: "Mayorista", minorista: "Minorista",
  mixto: "Importador/distribuidor (sin precisar)", otro: "Otro",
};
export const LEVEL_LABEL: Record<EvidenceLevel, string> = {
  confirmado: "Importador confirmado", probable: "Comprador probable", insuficiente: "Evidencia insuficiente",
};
export const SOURCE_LABEL: Record<SourceType, string> = {
  corporativa: "Web de la empresa", gobierno: "Fuente oficial", feria: "Feria", asociacion: "Asociación",
  directorio: "Directorio", prensa: "Prensa", empleo: "Oferta de empleo", otra: "Otra",
};

const httpUrl = z.string().url().refine((u) => /^https?:\/\//i.test(u), "La URL debe ser http(s)");
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Fecha ISO (AAAA-MM-DD)");

/** Una prueba concreta: qué página, de qué tipo, cuándo y cómo se consultó, y qué afirma (parafraseado). */
export const evidenceSchema = z.object({
  url: httpUrl,
  title: z.string().min(1),
  sourceType: z.enum(SOURCE_TYPES),
  howConsulted: z.enum(["pagina_leida", "extracto_buscador"]),
  consultedAt: isoDate,
  publishedAt: isoDate.nullish(),
  /** categoria: importa/distribuye el tipo de producto en el destino; origen_espana: lo hace con producto español. */
  claims: z.array(z.enum(["categoria", "origen_espana"])),
  summary: z.string().min(1).max(320),
});
export type Evidence = z.infer<typeof evidenceSchema>;

const contactSchema = z.object({
  contactPageUrl: httpUrl.nullish(),
  phone: z.string().nullish(),
  phoneSourceUrl: httpUrl.nullish(),
  email: z.string().email().nullish(),
  emailSourceUrl: httpUrl.nullish(),
  emailScope: z.enum(["general", "personal"]).nullish(),
});

/** Empresa tal como se almacena. El nivel de evidencia NO se guarda: se deduce de las pruebas (ver rules.ts). */
export const companyInputSchema = z
  .object({
    id: z.string().min(2),
    name: z.string().min(1),
    nameLocal: z.string().nullish(),
    country: z.string().length(2),
    city: z.string().nullish(),
    website: httpUrl.nullable(),
    websiteStatus: z.enum(["verificada", "segun_listado", "sin_verificar"]),
    type: z.enum(COMPANY_TYPES),
    brands: z.array(z.string()).default([]),
    evidence: z.array(evidenceSchema).min(1),
    contact: contactSchema.default({}),
    people: z.array(z.object({ name: z.string().min(1), role: z.string().min(1), sourceUrl: httpUrl })).default([]),
    reason: z.string().min(1),
    pending: z.array(z.string()).default([]),
    notes: z.array(z.string()).default([]),
    origin: z.enum(["curado", "busqueda_en_vivo"]),
  })
  .superRefine((c, ctx) => {
    if (c.contact.email && !c.contact.emailSourceUrl) ctx.addIssue({ code: "custom", message: "Un correo solo se admite con la URL pública donde aparece", path: ["contact", "emailSourceUrl"] });
    if (c.contact.email && c.contact.emailScope === "personal") ctx.addIssue({ code: "custom", message: "No se almacenan correos personales", path: ["contact", "email"] });
    if (c.contact.phone && !c.contact.phoneSourceUrl) ctx.addIssue({ code: "custom", message: "Un teléfono solo se admite con la URL pública donde aparece", path: ["contact", "phoneSourceUrl"] });
  });
export type CompanyInput = z.infer<typeof companyInputSchema>;

export interface Company extends CompanyInput {
  evidenceLevel: EvidenceLevel;
  /** true si una fuente primaria u oficial afirma que trata con producto español (no basta un directorio). */
  spainOriginVerified: boolean;
  levelReason: string;
  contactVerified: boolean;
}

export interface BuyerQuery { hs6: string; country: string; keywords?: string[] }

export interface BuyerResult {
  query: BuyerQuery;
  companies: Company[];
  summary: { total: number; confirmado: number; probable: number; insuficiente: number; withVerifiedContact: number };
  info: { origins: ("curado" | "busqueda_en_vivo")[]; providerConfigured: boolean; consultedAt: string; warnings: string[] };
  noData: boolean;
}

export interface SearchHit { title: string; url: string; snippet: string }
export interface SearchProvider {
  id: string;
  search(q: { query: string; maxResults: number; includeDomains?: string[]; excludeDomains?: string[] }): Promise<SearchHit[]>;
}
