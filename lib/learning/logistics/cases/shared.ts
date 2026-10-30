import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { airOffloadIncident, customsHoldIncident, damageIncident, delayIncident } from "../incidents";
import type { Leg, LogisticsCase, RouteOption } from "../types";

export const productName = (hs6: string) => HS_CATALOG.find((e) => e.code === hs6)?.name ?? `HS ${hs6}`;
export const leg = (vehicle: Leg["vehicle"], from: string, to: string, days: [number, number], role: Leg["role"], pricing?: Leg["pricing"], note?: string): Leg =>
  ({ vehicle, from, to, days: { min: days[0], max: days[1] }, role, pricing, note });

/** Incidencia según la modalidad elegida: avión → descarga en escala; barco → retención o «roll-over»; resto → retraso. */
export function incidentByMode(kind: { road: "dano" | "retraso"; roadCause?: string; sea: "retencion" | "rollover" }) {
  return (c: LogisticsCase, route: RouteOption, incoterm: string) => {
    if (route.modality === "aereo") return airOffloadIncident(c, route, incoterm);
    const bySea = route.legs.some((l) => l.role === "principal" && l.vehicle === "barco");
    if (bySea) return kind.sea === "retencion" ? customsHoldIncident(c, route, incoterm) : delayIncident(c, route, incoterm, 7, "El buque sale completo y tu contenedor pasa al siguiente («roll-over»).", 2500);
    return kind.road === "dano" ? damageIncident(c, route, incoterm) : delayIncident(c, route, incoterm, 2, kind.roadCause ?? "Un problema en la ruta retrasa el envío.", 900);
  };
}
