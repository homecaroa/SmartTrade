import { notFound } from "next/navigation";
import { ExportSimulator } from "@/components/learning/export-simulator";
import { exportScenario } from "@/lib/learning/export/scenarios";

export async function generateMetadata({ params }: { params: Promise<{ caso: string }> }) {
  const sc = exportScenario((await params).caso);
  return { title: `${sc?.title ?? "Caso"} · Modo Aprendizaje · SmarTrade` };
}

export default async function ExportCase({ params }: { params: Promise<{ caso: string }> }) {
  const { caso } = await params;
  if (!exportScenario(caso)) notFound();
  // Solo se pasa el identificador: el escenario contiene funciones y no puede cruzar del servidor al cliente.
  return <ExportSimulator caseId={caso} />;
}
