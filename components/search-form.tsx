export interface FormDefaults {
  fuente?: string; q?: string; market?: string; year: number; minSize: number; minGrowth?: number; sort: string; order: string;
}

const input = "w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-sm";

export function SearchForm({
  defaults, markets, years, productHint,
}: {
  defaults: FormDefaults;
  markets: { code: string; name: string }[];
  years: number[];
  productHint: string;
}) {
  return (
    <form method="get" action="/" className="grid gap-3 rounded-lg bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
      {defaults.fuente === "fuera" && <input type="hidden" name="fuente" value="fuera" />}
      <label className="text-xs font-medium">País de origen
        <select disabled className={input}><option>España</option></select>
      </label>
      <label className="text-xs font-medium">Mercado de destino
        <select name="market" defaultValue={defaults.market ?? ""} className={input}>
          <option value="">Todos los disponibles</option>
          {markets.map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium sm:col-span-2">Producto o código HS
        <input name="q" defaultValue={defaults.q ?? ""} maxLength={80} placeholder={productHint} className={input} />
      </label>
      <label className="text-xs font-medium">Año final (ventana de 3 años)
        <select name="year" defaultValue={String(defaults.year)} className={input}>
          {years.map((y) => <option key={y} value={y}>{y - 2}–{y}</option>)}
        </select>
      </label>
      <label className="text-xs font-medium">Tamaño mínimo (millones)
        <input name="minSize" type="number" min={0} step="any" defaultValue={defaults.minSize || ""} className={input} />
      </label>
      <label className="text-xs font-medium">Crecimiento mínimo (% CAGR)
        <input name="minGrowth" type="number" step="any" defaultValue={defaults.minGrowth ?? ""} className={input} />
      </label>
      <label className="text-xs font-medium">Ordenar por
        <div className="flex gap-2">
          <select name="sort" defaultValue={defaults.sort} className={input}>
            <option value="score">Puntuación</option><option value="size">Tamaño</option><option value="growth">Crecimiento</option>
          </select>
          <select name="order" defaultValue={defaults.order} className={input}>
            <option value="desc">Desc.</option><option value="asc">Asc.</option>
          </select>
        </div>
      </label>
      <div className="sm:col-span-2 lg:col-span-4">
        <button className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Buscar oportunidades</button>
      </div>
    </form>
  );
}
