import { notFound } from "next/navigation";
import { ImportSimulator } from "@/components/learning/import-simulator";
import { importScenario } from "@/lib/learning/import/scenarios";

export async function generateMetadata({ params }: { params: Promise<{ caso: string }> }) {
  const sc = importScenario((await params).caso);
  return { title: `${sc?.title ?? "Caso"} · Modo Aprendizaje · SmarTrade` };
}

export default async function ImportCase({ params }: { params: Promise<{ caso: string }> }) {
  const { caso } = await params;
  if (!importScenario(caso)) notFound();
  // Solo se pasa el identificador: el escenario contiene funciones y no puede cruzar del servidor al cliente.
  return <ImportSimulator caseId={caso} />;
}
