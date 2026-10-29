import { SIMULATED_NOTICE } from "@/lib/learning/provenance";

/** Aviso fijo del Modo Aprendizaje: aparece en todas sus pantallas y resúmenes. */
export function SimulatedNotice({ compact = false }: { compact?: boolean }) {
  return (
    <p role="note" className="rounded border border-emerald-300 bg-emerald-50 p-2 text-xs text-emerald-900">
      <b>{SIMULATED_NOTICE}.</b>{" "}
      {compact ? "Empresas, precios, costes y tipos son inventados." : "Las empresas son ficticias y los precios, costes, plazos, aranceles e impuestos son inventados para practicar: no son estadísticas oficiales, tarifas reales ni ofertas auténticas. Solo los códigos HS, los países y las reglas Incoterms proceden de SmarTrade, y se indican como tales."}
    </p>
  );
}
