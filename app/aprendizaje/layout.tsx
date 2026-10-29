import Link from "next/link";

/**
 * Sección separada del análisis estadístico: rutas, componentes y datos propios (lib/learning). Nada de lo que ocurre
 * aquí se mezcla con los rankings ni con las puntuaciones de oportunidades, y no se llama a ninguna API externa.
 */
export default function LearningLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-300 bg-emerald-700 px-4 py-2 text-white print:hidden">
        <p className="text-sm"><Link href="/aprendizaje" className="font-bold underline-offset-2 hover:underline">Modo Aprendizaje</Link> · simulador educativo de comercio internacional</p>
        <Link href="/" className="text-xs underline">Volver al análisis de mercados</Link>
      </div>
      {children}
    </div>
  );
}
