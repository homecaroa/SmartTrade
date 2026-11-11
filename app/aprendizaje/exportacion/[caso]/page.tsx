import { notFound } from "next/navigation";
import { ExportSimulator } from "@/components/learning/export-simulator";
import { EXPORT_SCENARIOS, exportScenario } from "@/lib/learning/export/scenarios";

export async function generateMetadata({ params }: { params: Promise<{ caso: string }> }) {
  const sc = exportScenario((await params).caso);
  return { title: `${sc?.title ?? "Caso"} · Modo Aprendizaje · SmarTrade` };
}

/**
 * Los casos se generan al construir y cualquier otro identificador da 404 sin llegar a la página (11/11/2026: antes, una
 * dirección de caso inexistente respondía con un 200 que mostraba «no encontrada»).
 */
export const dynamicParams = false;
export const generateStaticParams = () => EXPORT_SCENARIOS.map((s) => ({ caso: s.id }));

export default async function ExportCase({ params }: { params: Promise<{ caso: string }> }) {
  const { caso } = await params;
  if (!exportScenario(caso)) notFound();
  // Solo se pasa el identificador: el escenario contiene funciones y no puede cruzar del servidor al cliente.
  return <ExportSimulator caseId={caso} />;
}
