import Link from "next/link";
import { notFound } from "next/navigation";
import { modulo, modulosDisponibles, preguntasDe, totalPreguntas } from "@/lib/practica/catalog";
import { TAM_FINAL } from "@/lib/practica/engine";

export const dynamicParams = false;
export const generateStaticParams = () => modulosDisponibles().map((m) => ({ modulo: m.codigo }));

export default async function ModuloPage({ params }: { params: Promise<{ modulo: string }> }) {
  const m = modulo((await params).modulo);
  if (!m) notFound();
  const total = totalPreguntas(m);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{m.codigo} · {m.nombre}</h1>
      <div className="rounded border border-emerald-300 bg-emerald-50 p-4">
        <Link href={`/practica/${m.codigo}/final`} className="font-semibold text-emerald-900 underline">Test final del módulo</Link>
        <p className="text-sm text-slate-700">{Math.min(TAM_FINAL, total)} preguntas repartidas entre las unidades según su peso, sin corrección hasta entregar y con nota con penalización.</p>
      </div>
      {m.unidades.map((u) => (
        <section key={u.num} className="space-y-2">
          <h2 className="text-lg font-semibold">UD{u.num}. {u.titulo}</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {u.tests.map((t) => (
              <li key={t.id} className="rounded border bg-white p-3 text-sm">
                <Link href={`/practica/${m.codigo}/${t.id}`} className="font-semibold text-indigo-800 underline">{t.id} · {t.titulo}</Link>
                <span className="block text-slate-600">{preguntasDe(t).length} preguntas</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
