import { csvCell } from "@/lib/trade/csv";
import { IA_SPAIN_LABEL, IA_VERIFICATION_LABEL, LEVEL_LABEL, TYPE_LABEL, SOURCE_LABEL, type BuyerOrigin, type BuyerResult } from "./types";

const ORIGIN_CSV: Record<BuyerOrigin, string> = { curado: "curado a mano", busqueda_en_vivo: "busqueda automatica (sin revisar)", ia: "sugerida por IA (sin revision humana)" };

const HEADER = ["producto_hs6", "pais_destino", "nombre", "nombre_local", "pais", "ciudad", "web", "estado_web", "tipo", "nivel_evidencia", "origen_espana_verificado", "origen_datos", "marcas", "motivo", "pagina_contacto", "telefono", "fuente_telefono", "correo", "fuente_correo", "pruebas", "pendiente_de_verificar", "avisos", "fecha_ultima_consulta", "verificacion_ia", "senal_producto_espanol_ia", "modelo_ia", "auditoria_ia"];

export function buyersToCsv(r: BuyerResult): string {
  const lines = [HEADER.join(",")];
  for (const c of r.companies) {
    const last = c.evidence.map((e) => e.consultedAt).sort().at(-1) ?? "";
    lines.push([
      r.query.hs6, r.query.country, c.name, c.nameLocal, c.country, c.city, c.website, c.websiteStatus,
      TYPE_LABEL[c.type], LEVEL_LABEL[c.evidenceLevel], c.spainOriginVerified ? "si" : "no verificado", ORIGIN_CSV[c.origin],
      c.brands.join("; "), c.reason, c.contact.contactPageUrl, c.contact.phone, c.contact.phoneSourceUrl, c.contact.email, c.contact.emailSourceUrl,
      c.evidence.map((e) => `${e.url} [${SOURCE_LABEL[e.sourceType]}; ${e.howConsulted === "pagina_leida" ? "pagina leida" : "extracto de buscador"}; ${e.consultedAt}]`).join(" | "),
      c.pending.join("; "), c.notes.join("; "), last,
      c.ia ? IA_VERIFICATION_LABEL[c.ia.verificacion] : "", c.ia ? IA_SPAIN_LABEL[c.ia.senalEspana] : "", c.ia?.modelo ?? "", c.ia?.auditoria.join(" | ") ?? "",
    ].map(csvCell).join(","));
  }
  return "\uFEFF" + lines.join("\r\n") + "\r\n";
}
