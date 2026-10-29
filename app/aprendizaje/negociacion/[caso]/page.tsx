import { notFound } from "next/navigation";
import { NegotiationSimulator } from "@/components/learning/negotiation-simulator";
import { negotiationScenario } from "@/lib/learning/negotiation/scenarios";

export async function generateMetadata({ params }: { params: Promise<{ caso: string }> }) {
  const sc = negotiationScenario((await params).caso);
  return { title: `${sc?.title ?? "Caso"} · Modo Aprendizaje · SmarTrade` };
}

export default async function NegotiationCase({ params }: { params: Promise<{ caso: string }> }) {
  const { caso } = await params;
  if (!negotiationScenario(caso)) notFound();
  return <NegotiationSimulator caseId={caso} />;
}
