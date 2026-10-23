import Link from "next/link";
import { SECTORS } from "@/lib/config/sectors";

const card = "rounded-lg bg-white p-4 shadow-sm space-y-3";

export function EntryPaths() {
  return (
    <section aria-label="Cómo empezar" className="space-y-3">
      <ol className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-600">
        <li><b>1.</b> Elige cómo empezar</li>
        <li><b>2.</b> Revisa el ranking de mercados</li>
        <li><b>3.</b> Abre el detalle y comprueba aranceles y requisitos</li>
      </ol>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className={card}>
          <h2 className="font-semibold">Tengo un producto</h2>
          <p className="text-sm text-slate-600">Dime qué quieres exportar y te muestro a qué países de la UE merece la pena mirar primero.</p>
          <form method="get" action="/" className="flex gap-2">
            <input name="q" required maxLength={80} aria-label="Producto o código HS" placeholder="Ej.: vino, cerámica, 220421" className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm" />
            <button className="whitespace-nowrap rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700">Ver mercados</button>
          </form>
          <p className="text-xs text-slate-500">
            Prueba: <Link className="underline" href="/?q=vino">vino</Link> · <Link className="underline" href="/?q=aceite de oliva">aceite de oliva</Link> · <Link className="underline" href="/?q=cerámica">cerámica</Link>. ¿No sabes el código?{" "}
            <Link className="underline" href="/guia">Guía de uso</Link>
          </p>
        </div>
        <div className={card}>
          <h2 className="font-semibold">Quiero descubrir sectores</h2>
          <p className="text-sm text-slate-600">Explora un sector y compara sus productos y mercados entre sí.</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {SECTORS.map((s) => (
              <li key={s.id}>
                <Link href={`/?q=${encodeURIComponent(`sector:${s.id}`)}`} className="block rounded border border-slate-200 p-2 hover:border-indigo-400 hover:bg-indigo-50">
                  <span className="block text-sm font-medium">{s.name}</span>
                  <span className="block text-xs text-slate-500">{s.description}</span>
                  <span className="block text-xs text-slate-400">{s.codes.length} productos</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function SectorBanner({ current, onlyOne }: { current: { id: string; name: string; codes: string[] }; onlyOne: boolean }) {
  const others = SECTORS.filter((s) => s.id !== current.id);
  return (
    <section className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">
      <p><b>Sector: {current.name}</b> · {current.codes.length} productos. La puntuación compara solo entre estos productos: no es comparable con otras búsquedas.</p>
      {onlyOne && (
        <p className="text-xs text-slate-700">
          Explorar otro sector:{" "}
          {others.map((s) => <Link key={s.id} className="mr-2 underline" href={`/?q=${encodeURIComponent(`sector:${s.id}`)}`}>{s.name}</Link>)}
        </p>
      )}
    </section>
  );
}
