import { notFound } from "next/navigation";
import { Quiz } from "@/components/practica/quiz";
import { buscarTest, modulosDisponibles, preguntasDe } from "@/lib/practica/catalog";

export const dynamicParams = false;
export const generateStaticParams = () => modulosDisponibles().flatMap((m) => m.unidades.flatMap((u) => u.tests.map((t) => ({ modulo: m.codigo, test: t.id }))));

export default async function TestPage({ params }: { params: Promise<{ modulo: string; test: string }> }) {
  const { modulo, test } = await params;
  const hit = buscarTest(modulo, test);
  if (!hit) notFound();
  return (
    <Quiz clave={`${modulo}:${test}`} titulo={`${modulo} · ${hit.test.id} ${hit.test.titulo}`} modo="estudio" preguntas={preguntasDe(hit.test)}
      volver={{ href: `/practica/${modulo}`, texto: `Volver a ${modulo}` }} />
  );
}
