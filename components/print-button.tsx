"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="print:hidden rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100">
      Imprimir ficha
    </button>
  );
}
