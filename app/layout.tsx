import type { Metadata } from "next";
import Link from "next/link";
import { ModeBadge } from "@/components/data-source-label";
import { getConfig } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: "SmarTrade · Oportunidades comerciales",
  description: "Descubre oportunidades comerciales con datos de comercio internacional",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  let mode: "demo" | "comext" | "comtrade" = "demo";
  try { mode = getConfig().mode; } catch { /* la página mostrará el error de configuración */ }
  return (
    <html lang="es">
      <body>
        <header className="border-b bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link href="/" className="flex items-baseline gap-3">
              <span className="text-xl font-bold text-indigo-700">SmarTrade</span>
              <span className="text-sm text-slate-600">Descubre oportunidades comerciales con datos de comercio internacional</span>
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/guia" className="underline">Guía de uso</Link>
              <Link href="/metodologia" className="underline">Metodología y fuentes</Link>
              <ModeBadge mode={mode} />
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl space-y-4 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
