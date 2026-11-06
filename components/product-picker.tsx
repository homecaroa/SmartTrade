import Link from "next/link";
import { codeLabel, productLabel } from "@/lib/config/hs-catalog";
import type { ProductSummary } from "@/lib/service";

/**
 * Productos de la búsqueda. Los mercados se ordenan siempre dentro de UN producto: con varios, se elige cuál ver.
 * No se comparan productos entre sí (sus tamaños y unidades no son equivalentes).
 */
export function ProductPicker({ products, current, hrefFor }: { products: ProductSummary[]; current: string; hrefFor: (code: string) => string }) {
  if (products.length < 2) return null;
  return (
    <nav aria-label="Productos de la búsqueda" className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold">Tu búsqueda incluye {products.length} productos: elige cuál ver</h2>
      <ul className="flex flex-wrap gap-2">
        {products.map((p) => {
          const active = p.code === current;
          return (
            <li key={p.code}>
              <Link href={hrefFor(p.code)} aria-current={active ? "page" : undefined}
                className={`block rounded border px-2 py-1 text-sm ${active ? "border-indigo-700 bg-indigo-50 font-semibold text-indigo-900" : "border-slate-300 hover:bg-slate-50"}`}>
                {productLabel(p.code, p.name).title} <span className="text-xs text-slate-500">· {codeLabel(p.code)} · {p.marketsWithData} mercados</span>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="text-xs text-slate-500">Cada producto se analiza por separado: sus importes no se comparan entre sí.</p>
    </nav>
  );
}
