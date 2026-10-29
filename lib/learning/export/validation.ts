import { MARKETS } from "@/lib/config/catalog";
import { paymentTerm } from "../payments";
import { incotermOf, isEu, sellerBearsTransitRisk } from "./costs";
import type { ExportScenario, Settings } from "./types";

/** Reglas que detectan contradicciones entre decisiones (independientes de la nota de cada decisión). */
export interface Issue { severity: "contradiccion" | "aviso"; message: string }

export function validateOperation(sc: ExportScenario, s: Settings): Issue[] {
  const out: Issue[] = [];
  const eu = isEu(sc);
  const country = MARKETS.find((m) => m.code === sc.destination)?.name ?? sc.destination;
  const inc = s.incoterm ? incotermOf(s.incoterm) : null;
  const t = sc.transport.find((x) => x.id === s.transport);
  const p = sc.packing.find((x) => x.id === s.packing);
  if (inc && t && inc.modes === "solo marítimo y fluvial" && t.mode !== "maritimo")
    out.push({ severity: "contradiccion", message: `${inc.code} es una regla solo para transporte marítimo y fluvial, y el transporte elegido es por ${t.mode}. Habría que usar una regla multimodal (FCA, CPT, CIP, DAP…).` });
  if (eu && s.documents?.some((d) => ["dua_exportacion", "eur1", "certificado_origen"].includes(d)))
    out.push({ severity: "contradiccion", message: `${country} está en la UE: no hay despacho de exportación ni aranceles, así que el DUA de exportación y las pruebas de origen preferencial no proceden.` });
  if (inc?.code === "DDP" && !sc.sellerVatRegisteredAtDestination)
    out.push({ severity: "aviso", message: "En DDP el vendedor importa en destino y paga aranceles e impuestos, pero esta empresa no está registrada allí: no podrá recuperar el IVA y quizá ni pueda actuar como importador." });
  if (inc && sellerBearsTransitRisk(inc) && s.insurance === "no")
    out.push({ severity: "aviso", message: `En ${inc.code} el riesgo del viaje es del vendedor y no hay seguro: una pérdida en ruta la pagaría la empresa entera.` });
  if (t && t.days + sc.prepDays > sc.deadlineDays)
    out.push({ severity: "aviso", message: `Con ${t.label.toLowerCase()} (${t.days} días) más ${sc.prepDays} de preparación no se llega al plazo pactado de ${sc.deadlineDays} días.` });
  if (p && !p.protects)
    out.push({ severity: "aviso", message: "El embalaje elegido no protege bien esta mercancía: aumenta el riesgo de daños y reclamaciones." });
  if (s.payment && paymentTerm(s.payment).baseDefault >= 0.03)
    out.push({ severity: "aviso", message: "Cuenta abierta sin garantía con un cliente nuevo: el vendedor asume todo el riesgo de impago." });
  return out;
}
