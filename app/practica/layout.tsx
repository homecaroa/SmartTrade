import Link from "next/link";

/** Sección de tests de estudio: datos propios (data/practica), sin red y sin relación con el análisis de mercados. */
export default function PracticaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-indigo-300 bg-indigo-700 px-4 py-2 text-white print:hidden">
        <p className="text-sm"><Link href="/practica" className="font-bold underline-offset-2 hover:underline">Tests de estudio</Link> · preguntas tipo test por módulo del CFGS</p>
        <Link href="/practica" className="text-xs underline">Todos los módulos</Link>
      </div>
      {children}
    </div>
  );
}
