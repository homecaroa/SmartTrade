import type { Metadata } from "next";
import Link from "next/link";
import { ModeBadge } from "@/components/data-source-label";
import { getConfig } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmarTrade · Simulador de comercio internacional",
  description: "Simulador educativo de comercio internacional para el Grado Superior, con análisis de mercados a partir de datos oficiales",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  let mode: "demo" | "comext" | "comtrade" = "demo";
  try { mode = getConfig().mode; } catch { /* la página mostrará el error de configuración */ }
  return (
    <html lang="es">
      <body>
        <header className="border-b bg-white print:hidden">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-3">
              <span className="text-xl font-bold text-indigo-700">SmarTrade</span>
              <span className="text-sm text-slate-600">Simulador de comercio internacional</span>
            </Link>
            <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <Link href="/" className="rounded bg-emerald-700 px-2 py-1 font-semibold text-white hover:bg-emerald-800">Casos prácticos</Link>
              <Link href="/simulador" className="rounded border border-emerald-700 px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-50">Business Simulator</Link>
              <Link href="/logistica" className="underline">Transporte e Incoterms</Link>
              <Link href="/mercados" className="underline">Análisis de mercados</Link>
              <ModeBadge mode={mode} />
              <Link href="/guia" className="underline">Guía del análisis</Link>
              <Link href="/metodologia" className="underline">Metodología y fuentes</Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
