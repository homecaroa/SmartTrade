import { notFound } from "next/navigation";
import { NegotiationSimulator } from "@/components/learning/negotiation-simulator";
import { NEGOTIATION_SCENARIOS, negotiationScenario } from "@/lib/learning/negotiation/scenarios";

export async function generateMetadata({ params }: { params: Promise<{ caso: string }> }) {
  const sc = negotiationScenario((await params).caso);
  return { title: `${sc?.title ?? "Caso"} · Modo Aprendizaje · SmarTrade` };
}

/**
 * Los casos se generan al construir y cualquier otro identificador da 404 sin llegar a la página (11/11/2026: antes, una
 * dirección de caso inexistente respondía con un 200 que mostraba «no encontrada»).
 */
export const dynamicParams = false;
export const generateStaticParams = () => NEGOTIATION_SCENARIOS.map((s) => ({ caso: s.id }));

export default async function NegotiationCase({ params }: { params: Promise<{ caso: string }> }) {
  const { caso } = await params;
  if (!negotiationScenario(caso)) notFound();
  return <NegotiationSimulator caseId={caso} />;
}
