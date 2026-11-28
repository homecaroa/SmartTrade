import Link from "next/link";
import { modulosDisponibles, totalPreguntas } from "@/lib/practica/catalog";

export const metadata = { title: "Tests de estudio · SmarTrade" };

export default function PracticaIndex() {
  const modulos = modulosDisponibles();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Tests de estudio</h1>
      <p className="max-w-3xl text-sm text-slate-700">
        Preguntas tipo test para practicar los módulos de 1.º del CFGS de Comercio Internacional. Cada pregunta indica su criterio de evaluación,
        su fuente y <strong>cuánto se ha contrastado</strong>: «oficial» (texto oficial leído), «secundaria» o «general». No son preguntas de un
        examen real ni sustituyen al libro; si dudas de una respuesta, comprueba la fuente.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {modulos.map((m) => (
          <li key={m.codigo} className="rounded border bg-white p-4">
            <Link href={`/practica/${m.codigo}`} className="font-semibold text-indigo-800 underline">{m.codigo} · {m.nombre}</Link>
            <p className="text-sm text-slate-600">{m.unidades.length} unidades · {totalPreguntas(m)} preguntas</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
