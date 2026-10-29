import { paymentTerm } from "@/lib/learning/payments";
import { fmtEur } from "@/lib/learning/money";
import type { NegotiationScenario, Offer } from "@/lib/learning/negotiation/types";

/** Resumen legible de una oferta (del alumno o del comprador). */
export function OfferView({ sc, o }: { sc: NegotiationScenario; o: Offer }) {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
      <li><b>{fmtEur(o.unitPrice)}</b> por {sc.unit}</li>
      <li>{o.quantity.toLocaleString("es-ES")} {sc.unit}s</li>
      <li>{o.incoterm}</li>
      <li>{o.deliveryDays} días</li>
      <li>{paymentTerm(o.payment).label}</li>
      <li>Garantía {o.guarantee}</li>
      <li>{o.exclusivity ? "Con exclusividad" : "Sin exclusividad"}</li>
    </ul>
  );
}
