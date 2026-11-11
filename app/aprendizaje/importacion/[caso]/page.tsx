import { notFound } from "next/navigation";
import { ImportSimulator } from "@/components/learning/import-simulator";
import { IMPORT_SCENARIOS, importScenario } from "@/lib/learning/import/scenarios";

export async function generateMetadata({ params }: { params: Promise<{ caso: string }> }) {
  const sc = importScenario((await params).caso);
  return { title: `${sc?.title ?? "Caso"} · Modo Aprendizaje · SmarTrade` };
}

/**
 * Los casos se generan al construir y cualquier otro identificador da 404 sin llegar a la página (11/11/2026: antes, una
 * dirección de caso inexistente respondía con un 200 que mostraba «no encontrada»).
 */
export const dynamicParams = false;
export const generateStaticParams = () => IMPORT_SCENARIOS.map((s) => ({ caso: s.id }));

export default async function ImportCase({ params }: { params: Promise<{ caso: string }> }) {
  const { caso } = await params;
  if (!importScenario(caso)) notFound();
  // Solo se pasa el identificador: el escenario contiene funciones y no puede cruzar del servidor al cliente.
  return <ImportSimulator caseId={caso} />;
}
