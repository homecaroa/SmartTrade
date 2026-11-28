import { notFound } from "next/navigation";
import { Quiz } from "@/components/practica/quiz";
import { modulo as buscarModulo, modulosDisponibles, preguntasDe } from "@/lib/practica/catalog";

export const dynamicParams = false;
export const generateStaticParams = () => modulosDisponibles().map((m) => ({ modulo: m.codigo }));

export default async function FinalPage({ params }: { params: Promise<{ modulo: string }> }) {
  const m = buscarModulo((await params).modulo);
  if (!m) notFound();
  const porUnidad = m.unidades.map((u) => u.tests.flatMap(preguntasDe)).filter((g) => g.length > 0);
  const grupos: Record<string, string> = {};
  for (const u of m.unidades) for (const q of u.tests.flatMap(preguntasDe)) grupos[q.id] = `UD${u.num}. ${u.titulo}`;
  return (
    <Quiz clave={`${m.codigo}:final`} titulo={`${m.codigo} · Test final`} modo="examen" preguntas={[]} porUnidad={porUnidad} grupos={grupos}
      volver={{ href: `/practica/${m.codigo}`, texto: `Volver a ${m.codigo}` }} />
  );
}
