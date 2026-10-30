import { notFound } from "next/navigation";
import { LogisticsLab } from "@/components/learning/logistics-lab";
import { logisticsCase } from "@/lib/learning/logistics/cases";

export async function generateMetadata({ params }: { params: Promise<{ caso: string }> }) {
  const c = logisticsCase((await params).caso);
  return { title: `${c?.title ?? "Caso"} · Laboratorio de logística · SmarTrade` };
}

export default async function LogisticsCasePage({ params }: { params: Promise<{ caso: string }> }) {
  const { caso } = await params;
  if (!logisticsCase(caso)) notFound();
  // Solo se pasa el identificador: el caso contiene funciones (incidencias) y no puede cruzar del servidor al cliente.
  return <LogisticsLab caseId={caso} />;
}
