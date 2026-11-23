"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CAMPAIGN_SAVE_KEY } from "@/lib/sim/campaign/engine";
import { CAREER_SAVE_KEY, SAVE_KEY } from "@/lib/sim/save";
import { SimulatedNotice } from "../learning/simulated-notice";

/**
 * Menú del Business Simulator (23/11/2026, decisión del dueño): la Campaña es la entrada principal; la Temporada y la
 * Carrera siguen disponibles desde el principio, cada una con su partida guardada de siempre (no se migra nada).
 */
export function SimulatorHub() {
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const has = (k: string) => { try { return !!window.localStorage.getItem(k); } catch { return false; } };
    setSaved({ campana: has(CAMPAIGN_SAVE_KEY), temporada: has(SAVE_KEY), carrera: has(CAREER_SAVE_KEY) });
  }, []);
  const card = "block rounded-lg border bg-white p-4 shadow-sm hover:border-indigo-400";
  const cont = (k: string) => (saved[k] ? <span className="ml-2 rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Tienes una partida en curso</span> : null);
  return (
    <section className="space-y-4" aria-labelledby="titulo-hub">
      <header className="space-y-2 rounded-lg bg-white p-4 shadow-sm">
        <h1 id="titulo-hub" className="text-xl font-bold">Business Simulator</h1>
        <p className="text-sm">Diriges una empresa de transporte y logística ficticia de Valencia. Elige cómo quieres jugar.</p>
        <SimulatedNotice compact />
      </header>
      <Link href="/simulador/campana" className={`${card} border-indigo-300`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">Recomendado · empieza aquí</p>
        <h2 className="text-lg font-bold">Campaña{cont("campana")}</h2>
        <p className="text-sm">De autónomo con una furgoneta a grupo empresarial, misión a misión. Cada nivel trae una mecánica nueva (construir, contratar, negociar, financiarte, competir, expandirte…), tiene sus objetivos y varias formas de superarlo. Tu empresa, tus clientes y tus decisiones pasan de un nivel a otro. 10-20 minutos por nivel.</p>
      </Link>
      <div className="grid gap-4 md:grid-cols-2">
        <Link href="/simulador/temporada" className={`${card} border-slate-200`}>
          <h2 className="text-base font-bold">Temporada clásica{cont("temporada")}</h2>
          <p className="text-sm">26 semanas con todo disponible desde el principio: ofertas, almacén, incidencias y reclamaciones. Para practicar con libertad.</p>
        </Link>
        <Link href="/simulador/carrera" className={`${card} border-slate-200`}>
          <h2 className="text-base font-bold">Carrera · modo libre{cont("carrera")}</h2>
          <p className="text-sm">Cinco años sin objetivos fijos, con operaciones profundas, escandallo y gasóleo variable. Recomendada después de la campaña.</p>
        </Link>
      </div>
    </section>
  );
}
