"use client";

import { useState } from "react";
import { cashStart, clientHistory, creditLimitAt, describeOffer, fixedPerWeekAt, growthBlocked, GROWTH_LABELS, incidentOptions, kmOwnCommitted, kmSubCommitted, MONTH_QUESTION, n2, palletCapacityAt, palletsCommitted, seasonOutcome, serviceLevelToDate, subcontractRoom, truckKmAt } from "@/lib/sim/engine";
import { docsFor, MAX_ROUNDS, originalTerms, rateOf, validateProposal } from "@/lib/sim/deal";
import { directCost } from "@/lib/sim/international";
import { organizeBlocked, WORKER_WEEK, workCapacityAt, workCommitted, workersAt } from "@/lib/sim/warehouse";
import { clientOf, kmOf, REPUTATION_ALL_PRICES_FROM, reputationEffect, weeklyRevenue, workOf } from "@/lib/sim/market";
import type { Action, GrowthOption, Offer, SimState, WeekRecord } from "@/lib/sim/model";
import { weekLines, type LineMargin } from "@/lib/sim/lines";
import { GROWTH, P, payTermLabel, SEASON_WEEKS, TRUCK_KM_WEEK, WAREHOUSE_V6 } from "@/lib/sim/params";
import { fmtEur } from "@/lib/learning/money";
import { displayOrder } from "@/lib/learning/order";
import { GradeBadge } from "../learning/grade-badge";
import { Calculator } from "./calculator";

const KIND = { distribucion: "Distribución regional", puntual: "Viaje puntual", almacenaje: "Almacenaje", internacional: "Transporte internacional" } as const;

/**
 * Colores de las barras (petición del dueño, 11/11/2026): camión azul, almacén verde, personal violeta y subcontratado azul
 * claro; rojo cuando se supera el límite. El violeta en lugar del naranja que pidió en un principio: el naranja se confunde
 * con el rojo de «por encima», también con daltonismo. El texto «¡por encima…!» acompaña siempre al rojo.
 */
const BAR_COLOR = { camion: "bg-blue-500", almacen: "bg-emerald-500", personal: "bg-violet-500", sub: "bg-sky-300" } as const;
type BarKind = keyof typeof BAR_COLOR;

function Bar({ value, max, label, kind, unit = "" }: { value: number; max: number; label: string; kind: BarKind; unit?: string }) {
  const pct = Math.min(100, Math.round(value / max * 100));
  const over = value > max;
  return (
    <div className="text-xs">
      <div className="flex justify-between"><span>{label}</span><span className={over ? "font-semibold text-rose-700" : ""}>{value.toLocaleString("es-ES")}{unit} / {max.toLocaleString("es-ES")}{unit}{over ? " · ¡por encima de la capacidad!" : ""}</span></div>
      <div className="mt-0.5 h-2 rounded bg-slate-200" role="img" aria-label={`${label}: ${value} de ${max}`}><div className={`h-2 rounded ${over ? "bg-rose-500" : BAR_COLOR[kind]}`} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function WeekView({ s, lastWeek, onAction, onShowReport }: { s: SimState; lastWeek: number | null; onAction: (a: Action) => void; onShowReport: () => void }) {
  const done = s.status === "fin" || s.status === "quiebra";
  const closed = lastWeek !== null ? s.weeks.find((w) => w.week === lastWeek) : null;
  const decisions = closed ? s.learning.filter((l) => l.week === closed.week) : [];
  const horizon = Array.from({ length: 4 }, (_, i) => s.week + i).filter((w) => w <= SEASON_WEEKS);
  return (
    <div className="space-y-4">
      {closed && (
        <section className="space-y-2 rounded-lg border border-indigo-200 bg-white p-4 shadow-sm" aria-label={`Semana ${closed.week} cerrada`}>
          <h2 className="text-base font-semibold">Semana {closed.week} cerrada</h2>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div className="rounded border border-slate-200 p-2">
              <h3 className="text-xs font-semibold uppercase text-slate-600">Beneficio de la semana (lo ganado)</h3>
              <p>Facturado {fmtEur(closed.revenueTransport + closed.revenueWarehouse)} − gastos {fmtEur(closed.revenueTransport + closed.revenueWarehouse - closed.result)} = <b className={closed.result < 0 ? "text-rose-700" : "text-emerald-700"}>{fmtEur(closed.result)}</b></p>
              <p className="text-xs text-slate-600">Se cuenta aunque aún no se haya cobrado ni pagado.</p>
            </div>
            <div className="rounded border border-slate-200 p-2">
              <h3 className="text-xs font-semibold uppercase text-slate-600">Tesorería de la semana (lo cobrado y pagado)</h3>
              <p>{fmtEur(cashStart(s, closed.week))} + cobros {fmtEur(closed.collections)} − pagos {fmtEur(cashStart(s, closed.week) + closed.collections - closed.cashEnd)} = <b className={closed.cashEnd < 0 ? "text-rose-700" : ""}>{fmtEur(closed.cashEnd)}</b></p>
              <p className="text-xs text-slate-600">Solo el dinero que ha entrado o salido de verdad.</p>
            </div>
          </div>
          <p className="text-sm">{closed.kmOwn} km propios{closed.kmSubcontracted ? ` y ${closed.kmSubcontracted} subcontratados` : ""} · {closed.palletsStored} palés · servicio {closed.serviceLevel.toLocaleString("es-ES")} %</p>
          <LinesPanel s={s} r={closed} />
          {closed.notes.length > 0 && <ul className="list-disc pl-5 text-sm text-amber-900">{closed.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          {decisions.length > 0 && (
            <ul className="space-y-1 text-sm">{decisions.map((d, i) => <li key={i} className="rounded bg-slate-50 p-2"><span className="flex flex-wrap items-center gap-2"><b>{d.what}</b><GradeBadge grade={d.grade} /></span>{d.feedback}</li>)}</ul>
          )}
        </section>
      )}

      {s.weeks.length >= 4 && !s.answers[MONTH_QUESTION.id] && (
        <p className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm">Ya tienes el <b>informe del primer mes</b> con una pregunta sobre tus números. <button type="button" className="underline" onClick={onShowReport}>Ir al informe</button></p>
      )}
      {s.status === "quiebra" && <p className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm"><b>Fin de la partida en la semana {s.weeks.length}:</b> {s.endReason ?? "la empresa no puede seguir."} <button type="button" className="underline" onClick={onShowReport}>Ver el resumen final</button>.</p>}
      {s.status === "fin" && (() => {
        const out = seasonOutcome(s);
        return <p className={`rounded-lg border p-4 text-sm ${out.victory ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}><b>{out.victory ? "¡Temporada ganada!" : "Temporada terminada sin cumplir los objetivos."}</b> Has completado las {SEASON_WEEKS} semanas. <button type="button" className="underline" onClick={onShowReport}>Ver el resumen final</button>.</p>;
      })()}

      {s.status === "incidencia" && s.pending && <IncidentCard s={s} onAction={onAction} />}

      {!done && s.status === "jugando" && (
        <>
          <CapacityStrip s={s} />
          <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="capacidad">
            <h2 id="capacidad" className="text-base font-semibold">Capacidad comprometida</h2>
            {horizon.map((w) => (
              <div key={w} className="grid gap-2 sm:grid-cols-2">
                <Bar kind="camion" label={`Semana ${w} · ${truckKmAt(s, w) > TRUCK_KM_WEEK ? "tus dos camiones" : "camión"} (km)`} value={kmOwnCommitted(s, w)} max={truckKmAt(s, w)} />
                <Bar kind="almacen" label={`Semana ${w} · almacén (palés)`} value={palletsCommitted(s, w)} max={palletCapacityAt(s, w)} />
                {s.version >= WAREHOUSE_V6.fromVersion && <Bar kind="personal" label={`Semana ${w} · personal del almacén (${workersAt(s, w)} ${workersAt(s, w) === 1 ? "mozo" : "mozos"})`} value={staffPct(s, w)} max={100} unit=" %" />}
                {kmSubCommitted(s, w) > 0 && <Bar kind="sub" label={`Semana ${w} · subcontratado (km)`} value={kmSubCommitted(s, w)} max={GROWTH.subcontract.maxKmWeek} />}
              </div>
            ))}
          </section>

          <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <section className="space-y-2" aria-labelledby="ofertas">
            <h2 id="ofertas" className="text-base font-semibold">Ofertas de esta semana</h2>
            <p className="rounded bg-slate-50 p-2 text-xs text-slate-700"><b>Tu reputación</b> (nivel de servicio de las últimas 8 semanas: {serviceLevelToDate(s).toLocaleString("es-ES")} %): {reputationEffect(serviceLevelToDate(s), s.week).label}</p>
            {s.offers.length === 0 && <p className="text-sm text-slate-600">No quedan ofertas esta semana.</p>}
            <div className="grid gap-3 lg:grid-cols-2">
              {displayOrder(s.offers, `${s.seed}:${s.week}`).map((o) => <OfferCard key={o.id} o={o} s={s} onAction={onAction} />)}
            </div>
            <p className="text-xs text-slate-600">Las ofertas que no aceptes desaparecen al cerrar la semana. Antes de aceptar, comprueba que tienes capacidad y calcula si la tarifa cubre tus costes.</p>
          </section>
          <Calculator version={s.version} />
          </div>

          <ActiveContracts s={s} />

          {s.version >= WAREHOUSE_V6.fromVersion && <OrganizePanel s={s} onAction={onAction} />}

          <GrowthPanel s={s} onAction={onAction} />

          <div className="rounded-lg bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => onAction({ t: "cerrar" })} className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">Cerrar la semana {s.week}</button>
              <button type="button" onClick={() => document.getElementById("capacidad")?.scrollIntoView({ behavior: "smooth", block: "start" })} className="rounded border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100">↑ Ver la capacidad comprometida</button>
            </div>
            <p className="mt-1 text-xs text-slate-600">Se hacen los trabajos, se facturan, se cobran y pagan los vencimientos y llegan las ofertas de la semana siguiente.</p>
          </div>
        </>
      )}
    </div>
  );
}

/** Trabajo comprometido del personal del almacén, en % de su capacidad (antes se mostraba en «% de un mozo», confuso). */
const staffPct = (s: SimState, w: number) => Math.round(workCommitted(s, w) / workCapacityAt(s, w) * 100);

/**
 * Resumen de la capacidad de esta semana, fijo arriba al bajar por la página (petición del dueño, 11/11/2026: «es incómodo
 * tener que subir cada vez»). Pulsarlo lleva al detalle de las próximas semanas.
 */
function CapacityStrip({ s }: { s: SimState }) {
  const w = s.week;
  const items: { kind: BarKind; label: string; value: number; max: number; unit?: string }[] = [
    { kind: "camion", label: truckKmAt(s, w) > TRUCK_KM_WEEK ? "Camiones" : "Camión", value: kmOwnCommitted(s, w), max: truckKmAt(s, w), unit: " km" },
    { kind: "almacen", label: "Almacén", value: palletsCommitted(s, w), max: palletCapacityAt(s, w), unit: " palés" },
    ...(s.version >= WAREHOUSE_V6.fromVersion ? [{ kind: "personal" as const, label: "Personal", value: staffPct(s, w), max: 100, unit: " %" }] : []),
  ];
  return (
    <button type="button" onClick={() => document.getElementById("capacidad")?.scrollIntoView({ behavior: "smooth", block: "start" })}
      className="sticky top-0 z-20 grid w-full gap-x-4 gap-y-1 rounded-lg border border-slate-200 bg-white/95 p-2 text-left shadow-sm backdrop-blur sm:grid-cols-3 print:hidden" aria-label={`Capacidad de la semana ${w}: ver el detalle`}>
      {items.map((it) => {
        const over = it.value > it.max;
        return (
          <span key={it.kind} className="text-xs">
            <span className="flex justify-between"><span className="font-semibold">{it.label} · sem. {w}</span><span className={over ? "font-semibold text-rose-700" : ""}>{it.value.toLocaleString("es-ES")}{it.unit} / {it.max.toLocaleString("es-ES")}{it.unit}</span></span>
            <span className="mt-0.5 block h-1.5 rounded bg-slate-200"><span className={`block h-1.5 rounded ${over ? "bg-rose-500" : BAR_COLOR[it.kind]}`} style={{ width: `${Math.min(100, Math.round(it.value / it.max * 100))}%` }} /></span>
          </span>
        );
      })}
    </button>
  );
}

/**
 * Lo que una oferta haría con tu capacidad, en la peor de sus semanas (petición del dueño, 11/11/2026): antes había que
 * subir a las barras para comprobarlo, y en su partida aceptó un almacenaje sin sitio.
 */
function offerImpact(s: SimState, o: Offer): { text: string; over: boolean }[] {
  const weeks = Array.from({ length: o.weeks }, (_, i) => o.week + i);
  const worst = (f: (w: number) => number) => weeks.reduce((best, w) => (f(w) > f(best) ? w : best), weeks[0]);
  if (o.kind === "almacenaje") {
    const w = worst((x) => palletsCommitted(s, x) + o.pallets! - palletCapacityAt(s, x));
    const after = palletsCommitted(s, w) + o.pallets!, cap = palletCapacityAt(s, w);
    const out = [{ text: `Almacén: ${after.toLocaleString("es-ES")} / ${cap.toLocaleString("es-ES")} palés${after > cap ? ` en la semana ${w}: no cabe` : weeks.length > 1 ? " en la semana más llena" : ""}`, over: after > cap }];
    if (o.movesWeek !== undefined && s.version >= WAREHOUSE_V6.fromVersion) {
      const v = worst((x) => (workCommitted(s, x) + workOf(o)) / workCapacityAt(s, x));
      const pct = Math.round((workCommitted(s, v) + workOf(o)) / workCapacityAt(s, v) * 100);
      out.push({ text: `Personal: ${pct} % de su capacidad${pct > 100 ? ` en la semana ${v}: horas extra (hasta el ${Math.round((1 + WAREHOUSE_V6.overtime.maxShare) * 100)} %) o un temporal` : ""}`, over: pct > 100 });
    }
    return out;
  }
  const w = worst((x) => kmOwnCommitted(s, x) + kmOf(o) - truckKmAt(s, x));
  const used = kmOwnCommitted(s, w), cap = truckKmAt(s, w);
  if (o.kind === "internacional") {
    const free = Math.max(0, Math.floor((cap - used) / P.kmPerDay));
    return [{ text: `Camión: necesita ${o.days} días y te quedan ${free} libres esa semana`, over: o.days! > free }];
  }
  const after = used + kmOf(o);
  return [{ text: `Camión: ${after.toLocaleString("es-ES")} / ${cap.toLocaleString("es-ES")} km${after > cap ? ` en la semana ${w}: no llegas (puedes subcontratar)` : weeks.length > 1 ? " en la semana más cargada" : ""}`, over: after > cap }];
}

/**
 * De dónde sale el resultado de la semana (11/11/2026, petición del dueño): margen de cada línea de negocio, uso de su
 * capacidad y lo que costó la que quedó sin usar (lib/sim/lines.ts). Las tres partes suman el resultado.
 */
function LinesPanel({ s, r }: { s: SimState; r: WeekRecord }) {
  const l = weekLines(s, r);
  const line = (title: string, x: LineMargin, use: string) => (
    <div className="rounded border border-slate-200 p-2">
      <h3 className="text-xs font-semibold uppercase text-slate-600">{title}</h3>
      <p>{fmtEur(x.revenue)} − {fmtEur(x.costs)} = <b className={x.margin < 0 ? "text-rose-700" : "text-emerald-700"}>{fmtEur(x.margin)}</b></p>
      <p className="text-xs text-slate-600">{use}: {x.use} %{x.idleCost >= 1 ? <> · la capacidad sin usar te costó <b className={x.use < 50 ? "text-rose-700" : ""}>{fmtEur(x.idleCost)}</b></> : null}</p>
    </div>
  );
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-3" aria-label="Resultado por línea de negocio">
      {line("Transporte (ingresos − costes)", l.transporte, "Uso del camión")}
      {line("Almacén (ingresos − costes)", l.almacen, "Ocupación")}
      <div className="rounded border border-slate-200 p-2">
        <h3 className="text-xs font-semibold uppercase text-slate-600">Estructura</h3>
        <p><b className="text-rose-700">{fmtEur(-l.estructura.costs)}</b></p>
        <p className="text-xs text-slate-600">Gerente, gestoría, sanciones, indemnizaciones e intereses.</p>
      </div>
    </div>
  );
}

const UNIT = { distribucion: "€/km", puntual: "€ el viaje", almacenaje: "€/palé/semana", internacional: "€ el viaje" } as const;

/**
 * Una oferta: aceptarla tal cual, negociarla (tarifa, duración y, en almacenaje, plazo de pago) y, al aceptar, preparar
 * la documentación. La respuesta del cliente la decide el motor (lib/sim/deal.ts), no la interfaz.
 */
function OfferCard({ o, s, onAction }: { o: Offer; s: SimState; onAction: (a: Action) => void }) {
  const c = clientOf(o.clientId);
  const h = clientHistory(s, o.clientId);
  const [mode, setMode] = useState<"ver" | "negociar" | "documentar">("ver");
  const base = originalTerms(o);
  const [rate, setRate] = useState(String(rateOf(o)).replace(".", ","));
  const [weeks, setWeeks] = useState(String(o.weeks));
  const [pay, setPay] = useState(o.payWeeks);
  const [docs, setDocs] = useState<string[]>([]);
  const [backhaul, setBackhaul] = useState(false);
  const [sub, setSub] = useState(false);
  const room = o.kind === "almacenaje" ? 0 : subcontractRoom(s, o);
  const [error, setError] = useState<string | null>(null);
  const rounds = o.round ?? 0;
  const propose = () => {
    const v = Number(rate.replace(",", "."));
    const w = o.kind === "puntual" || o.kind === "internacional" ? 1 : Number(weeks);
    const invalid = Number.isFinite(v) && Number.isInteger(w) ? validateProposal(o, { rate: v, weeks: w, payWeeks: pay }) : "Escribe números válidos.";
    if (invalid) { setError(invalid); return; }
    setError(null); setMode("ver");
    onAction({ t: "proponer", oferta: o.id, tarifa: v, semanas: w, plazo: pay });
  };
  const box = "flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-1.5 text-xs hover:border-indigo-300";
  return (
    <article className={`space-y-1 rounded-lg border bg-white p-3 text-sm shadow-sm ${o.agreed ? "border-emerald-400" : "border-slate-200"}`}>
      <p className="flex flex-wrap items-center gap-2"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold">{KIND[o.kind]}</span><b>{c.name}</b><span className="text-xs text-slate-600">({c.sector})</span></p>
      {o.kind === "distribucion" && <p>{o.kmWeek} km por semana (retornos incluidos) a <b>{n2(o.ratePerKm!)} €/km</b> durante {o.weeks} semanas → {fmtEur(weeklyRevenue(o))}/semana.</p>}
      {o.kind === "puntual" && <p>Un viaje de {o.kmOneWay} km de ida ({kmOf(o)} km recorridos con la vuelta) por <b>{fmtEur(o.price!)}</b>. {o.backhaul ? <>El cliente ofrece una <b>carga de retorno</b>: {o.backhaul.pallets} palés por <b>{fmtEur(o.backhaul.price)}</b> más.</> : <>La vuelta es <b>en vacío</b>.</>}</p>}
      {o.kind === "internacional" && (() => {
        const d = directCost(o);
        return <p>Camión completo de Valencia a <b>{o.destination!.city} ({o.destination!.country})</b>: {o.kmOneWay!.toLocaleString("es-ES")} km de ida, <b>{o.days} días de camión</b> con la vuelta y la carga, por <b>{fmtEur(o.price!)}</b>. Peajes extranjeros {fmtEur(o.tolls!)} y dietas del conductor {fmtEur(d.extras - o.tolls!)}. {o.backhaul ? <>El cliente ofrece una <b>carga de retorno</b>: {o.backhaul.pallets} palés por <b>{fmtEur(o.backhaul.price)}</b> más.</> : <>La vuelta es <b>en vacío</b>.</>} Contrato internacional: se rige por el Convenio CMR.</p>;
      })()}
      {o.kind === "almacenaje" && o.movesWeek !== undefined && <p>{o.pallets} palés a <b>{n2(o.palletRate!)} €/palé/semana</b> (solo el sitio), más {o.movesWeek} movimientos a <b>{n2(o.moveRate!)} €</b> y {o.linesWeek} líneas de pedido a <b>{n2(o.lineRate!)} €</b> por semana, durante {o.weeks} semanas → {fmtEur(weeklyRevenue(o))}/semana. Trabajo: un {Math.round(workOf(o) * 100)} % de un mozo.</p>}
      {o.kind === "almacenaje" && o.movesWeek === undefined && <p>{o.pallets} palés a <b>{n2(o.palletRate!)} €/palé/semana</b> (manipulación incluida) durante {o.weeks} semanas → {fmtEur(weeklyRevenue(o))}/semana.</p>}
      <p className="text-xs text-slate-600">Pago a {payTermLabel(o.payWeeks)} · {h.paid || h.overdue ? <><b>Tu experiencia:</b> {historyText(h)}</> : h.invoices ? <><b>Ya trabajas con este cliente:</b> aún no ha vencido ninguna factura. Referencias: {o.clientHint}</> : o.clientHint}</p>
      <ul className="space-y-0.5 text-xs" aria-label="Efecto en tu capacidad">{offerImpact(s, o).map((x) => <li key={x.text} className={`rounded px-1.5 py-0.5 ${x.over ? "bg-rose-50 font-semibold text-rose-800" : "bg-slate-50 text-slate-700"}`}>{x.over ? "⚠ " : "✓ "}{x.text}</li>)}</ul>
      {o.note && <p className={`rounded p-1.5 text-xs ${o.agreed ? "bg-emerald-50 text-emerald-900" : "bg-amber-50 text-amber-900"}`}><b>{c.name.replace(" (ficticia)", "")}:</b> {o.note} {o.agreed ? "Confirma la operación preparando la documentación." : `Su oferta inicial era ${n2(base.rate)} ${UNIT[o.kind]}.`}</p>}

      {mode === "ver" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <button type="button" onClick={() => setMode("documentar")} className="rounded border border-indigo-600 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">{o.agreed ? "Confirmar el acuerdo" : o.round ? "Aceptar su contraoferta" : "Aceptar tal cual"}</button>
          {!o.agreed && rounds < MAX_ROUNDS + 1 && <button type="button" onClick={() => setMode("negociar")} className="rounded border border-slate-300 px-3 py-1 text-xs hover:bg-slate-100">Negociar{rounds ? ` (ronda ${rounds + 1})` : ""}</button>}
        </div>
      )}

      {mode === "negociar" && (
        <form className="space-y-2 rounded border border-slate-200 p-2" onSubmit={(e) => { e.preventDefault(); propose(); }}>
          <p className="text-xs text-slate-600">Propón tus condiciones. El cliente tiene un límite que no conoces: si pides un poco más de lo que puede pagar te hará una contraoferta; si pides mucho más, se irá con otro transportista. Como mucho {MAX_ROUNDS} rondas.{o.kind === "almacenaje" && o.moveRate !== undefined && s.version >= REPUTATION_ALL_PRICES_FROM ? " La tarifa del palé arrastra en la misma proporción el precio de movimientos y líneas." : ""}</p>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <label>Tarifa ({UNIT[o.kind]})<input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" className="mt-0.5 block w-24 rounded border border-slate-300 px-1 py-0.5" /></label>
            {o.kind !== "puntual" && o.kind !== "internacional" && <label>Duración (semanas)<input value={weeks} onChange={(e) => setWeeks(e.target.value)} inputMode="numeric" className="mt-0.5 block w-16 rounded border border-slate-300 px-1 py-0.5" /></label>}
            {o.kind === "almacenaje"
              ? <label>Plazo de pago<select value={pay} onChange={(e) => setPay(Number(e.target.value))} className="mt-0.5 block rounded border border-slate-300 px-1 py-0.5"><option value={4}>30 días</option><option value={8}>60 días</option></select></label>
              : <span className="text-slate-600">Pago a 30 días: en el transporte no se negocia (mora a los 30 días, Ley 15/2009, art. 41).</span>}
          </div>
          {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
          <div className="flex gap-2"><button type="submit" className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">Proponer</button><button type="button" onClick={() => setMode("ver")} className="text-xs underline">Cancelar</button></div>
        </form>
      )}

      {mode === "documentar" && (
        <form className="space-y-1 rounded border border-slate-200 p-2" onSubmit={(e) => { e.preventDefault(); onAction({ t: "aceptar", oferta: o.id, docs, ...(backhaul ? { retorno: true } : {}), ...(sub ? { subcontratar: true } : {}) }); }}>
          {o.backhaul && <label className={box}><input type="checkbox" checked={backhaul} onChange={(e) => setBackhaul(e.target.checked)} className="mt-0.5" /><span>Traer también la carga de retorno ({o.backhaul.pallets} palés, +{fmtEur(o.backhaul.price)})</span></label>}
          {o.kind === "internacional" && <p className="text-xs text-slate-600">Tus subcontratistas solo hacen transporte nacional: este viaje lo haces con tu camión.</p>}
          {o.kind !== "almacenaje" && o.kind !== "internacional" && (room >= kmOf(o)
            ? <label className={box}><input type="checkbox" checked={sub} onChange={(e) => setSub(e.target.checked)} className="mt-0.5" /><span>Encargarla a un subcontratista: no ocupa tu camión, te cobra {n2(GROWTH.subcontract.perKm)} €/km ({fmtEur(Math.round(kmOf(o) * GROWTH.subcontract.perKm * 100) / 100)} {o.kind === "puntual" ? "el viaje" : "por semana"}) a 30 días y respondes tú ante el cliente. Le quedan {room.toLocaleString("es-ES")} km libres por semana.</span></label>
            : <p className="text-xs text-slate-600">Tus subcontratistas no tienen {kmOf(o).toLocaleString("es-ES")} km libres esas semanas (como mucho {GROWTH.subcontract.maxKmWeek.toLocaleString("es-ES")} km por semana).</p>)}
          <fieldset className="space-y-1">
            <legend className="text-xs font-semibold">¿Qué documentación preparas para esta operación?</legend>
            {displayOrder(docsFor(o.kind), `${s.seed}:${o.id}:docs`).map((d) => (
              <label key={d.id} className={box}><input type="checkbox" checked={docs.includes(d.id)} onChange={(e) => setDocs((x) => (e.target.checked ? [...x, d.id] : x.filter((y) => y !== d.id)))} className="mt-0.5" /><span>{d.label}</span></label>
            ))}
          </fieldset>
          <div className="flex gap-2"><button type="submit" className="rounded bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">Aceptar la operación</button><button type="button" onClick={() => setMode("ver")} className="text-xs underline">Cancelar</button></div>
        </form>
      )}
    </article>
  );
}

function ActiveContracts({ s }: { s: SimState }) {
  const active = s.contracts.filter((c) => c.endWeek >= s.week && !(c.cancelledWeek !== undefined && c.cancelledWeek <= s.week));
  if (!active.length) return null;
  return (
    <section className="rounded-lg bg-white p-4 shadow-sm" aria-labelledby="contratos">
      <h2 id="contratos" className="text-base font-semibold">Tus contratos en curso</h2>
      <ul className="mt-1 space-y-1 text-sm">{active.map((c) => <li key={c.id}>{describeOffer(c)} <span className="text-xs text-slate-600">(semanas {c.startWeek}–{c.endWeek}{c.subcontracted ? " · subcontratado" : ""})</span></li>)}</ul>
    </section>
  );
}

/** Lo que hace y cuesta cada herramienta. La calificación llega al cerrar la semana, como en las demás decisiones. */
function growthText(o: GrowthOption): string {
  const t = GROWTH.truck, w = GROWTH.warehouse, c = GROWTH.credit;
  if (o === "renting") return `Otro camión y otro conductor desde la semana que viene: el doble de km. Cuota de ${fmtEur(t.renting.monthly)} al mes (seguro y mantenimiento incluidos) y ${fmtEur(t.driverMonthly)} de nómina. No sale dinero de golpe.`;
  if (o === "compra") return `Otro camión y otro conductor desde la semana que viene: el doble de km. Pagas ${fmtEur(t.compra.price)} esta semana; luego, ${fmtEur(t.driverMonthly)} de nómina y ${fmtEur(t.compra.insuranceMonthly)} de seguro al mes, y se amortiza a ${fmtEur(t.compra.amortizationWeek)} por semana.`;
  if (o === "almacen") return `La nave contigua: ${w.pallets} palés más desde la semana que viene. Alquiler de ${fmtEur(w.rentMonthly)} al mes, un mozo más (${fmtEur(w.workerMonthly)}) y ${fmtEur(w.rentMonthly * w.depositMonths)} de fianza esta semana (dos mensualidades: art. 36.1 de la Ley de Arrendamientos Urbanos).`;
  return `Tu caja puede bajar hasta −${fmtEur(c.limit)} sin quebrar. Comisión de apertura del ${n2(c.openingFee * 100)} % (${fmtEur(c.limit * c.openingFee)}) y un ${n2(c.annualRate * 100)} % anual de intereses solo por lo que uses.`;
}

/** Organización del almacén (v6): reorganizar por rotación (ABC) y contratar un mozo temporal. */
function OrganizePanel({ s, onAction }: { s: SimState; onAction: (a: Action) => void }) {
  const W = WAREHOUSE_V6;
  const items = [
    { id: "abc" as const, title: "Reorganizar por rotación (ABC)", text: `Lo que más se mueve, junto a la zona de expedición; lo que casi no rota, al fondo. ${fmtEur(W.abc.cost)} una vez; tu personal rinde un ${W.abc.productivity * 100} % más desde la semana que viene.`, done: s.staff?.abcWeek !== undefined ? `Hecho en la semana ${s.staff.abcWeek}.` : null },
    { id: "temporal" as const, title: "Contratar un mozo temporal", text: `Por una empresa de trabajo temporal: ${W.temp.weeks} semanas desde la semana que viene, a ${fmtEur(W.temp.weeklyCost)} por semana (uno de plantilla cuesta ${fmtEur(WORKER_WEEK)}). Sin él, una punta de trabajo se cubre con horas extra un ${Math.round((W.overtime.costFactor - 1) * 100)} % más caras, como mucho un ${W.overtime.maxShare * 100} % más; lo demás se queda sin hacer.`, done: null },
  ];
  return (
    <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="organizar">
      <h2 id="organizar" className="text-base font-semibold">Organizar el almacén</h2>
      <p className="text-xs text-slate-600">Tu personal esta semana: {workersAt(s, s.week)} {workersAt(s, s.week) === 1 ? "mozo" : "mozos"}, con trabajo comprometido del {Math.round(workCommitted(s, s.week) / workCapacityAt(s, s.week) * 100)} % de su capacidad. Cifras simuladas.</p>
      <div className="grid gap-2 md:grid-cols-2">
        {items.map((it) => {
          const blocked = organizeBlocked(s, it.id);
          return (
            <div key={it.id} className="space-y-1 rounded border border-slate-200 p-2 text-sm">
              <p className="font-semibold">{it.title}</p>
              <p className="text-xs">{it.text}</p>
              {it.done ? <p className="text-xs font-semibold text-emerald-800">{it.done}</p>
                : blocked ? <p className="text-xs text-slate-600">{blocked}</p>
                : <button type="button" onClick={() => { if (window.confirm(`¿${it.title}?`)) onAction({ t: "organizar", opcion: it.id }); }} className="rounded border border-indigo-600 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Hacerlo</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function GrowthPanel({ s, onAction }: { s: SimState; onAction: (a: Action) => void }) {
  const g = s.growth;
  const options: GrowthOption[] = ["renting", "compra", "almacen", "poliza"];
  const since = (o: GrowthOption) => (o === "renting" || o === "compra" ? (g?.camion?.modo === o ? g.camion.week : undefined) : g?.[o]?.week);
  return (
    <section className="space-y-2 rounded-lg bg-white p-4 shadow-sm" aria-labelledby="crecer">
      <h2 id="crecer" className="text-base font-semibold">Crecer y financiarse</h2>
      <p className="text-xs text-slate-600">Cada herramienta se contrata una sola vez y cuesta desde ya, tengas trabajo para ella o no. Costes fijos de esta semana: {fmtEur(fixedPerWeekAt(s, s.week))}{creditLimitAt(s, s.week) ? ` · póliza: la caja puede bajar hasta −${fmtEur(creditLimitAt(s, s.week))}` : ""}. Cifras simuladas.</p>
      <div className="grid gap-2 md:grid-cols-2">
        {options.map((o) => {
          const week = since(o);
          const blocked = growthBlocked(s, o);
          return (
            <div key={o} className="space-y-1 rounded border border-slate-200 p-2 text-sm">
              <p className="font-semibold">{GROWTH_LABELS[o]}</p>
              <p className="text-xs">{growthText(o)}</p>
              {week !== undefined ? <p className="text-xs font-semibold text-emerald-800">Contratado en la semana {week}.</p>
                : blocked ? <p className="text-xs text-slate-600">{blocked}</p>
                : <button type="button" onClick={() => { if (window.confirm(`¿${GROWTH_LABELS[o]}? No se puede deshacer.`)) onAction({ t: "crecer", opcion: o }); }} className="rounded border border-indigo-600 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50">Contratar</button>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function IncidentCard({ s, onAction }: { s: SimState; onAction: (a: Action) => void }) {
  const inc = s.pending!;
  const [pick, setPick] = useState("");
  const opts = displayOrder(incidentOptions(inc, s.version), `${s.seed}:${inc.id}`);
  return (
    <form className="space-y-3 rounded-lg border-2 border-rose-300 bg-rose-50 p-4 shadow-sm" onSubmit={(e) => { e.preventDefault(); if (pick) onAction({ t: "responder", incidencia: inc.id, opcion: pick }); }}>
      <fieldset className="space-y-2">
        <legend className="text-base font-semibold">⚠️ {inc.title} (semana {inc.week})</legend>
        <p className="text-sm">{inc.prompt}</p>
        <p className="rounded bg-white p-2 text-xs text-slate-700"><b>Concepto:</b> {inc.concept}</p>
        {opts.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-start gap-2 rounded border border-slate-200 bg-white p-2 text-sm hover:border-indigo-300">
            <input type="radio" name={`inc-${inc.id}`} value={o.id} checked={pick === o.id} onChange={() => setPick(o.id)} className="mt-1" /><span>{o.label}</span>
          </label>
        ))}
      </fieldset>
      <button type="submit" disabled={!pick} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Decidir y seguir con la semana</button>
    </form>
  );
}



/** Lo que ya sabes de un cliente por haber trabajado con él: sustituye a las referencias de terceros. */
function historyText(h: ReturnType<typeof clientHistory>): string {
  const parts: string[] = [];
  if (h.paid) parts.push(h.paidLate ? `de ${h.paid} ${h.paid === 1 ? "factura cobrada" : "facturas cobradas"}, ${h.paidLate} con retraso (hasta ${h.maxDelayWeeks} ${h.maxDelayWeeks === 1 ? "semana" : "semanas"})` : `te ha pagado a tiempo ${h.paid === 1 ? "la factura cobrada" : `las ${h.paid} facturas cobradas`}`);
  if (h.overdue) parts.push(`${h.overdue} ${h.overdue === 1 ? "factura vencida sin pagar" : "facturas vencidas sin pagar"}`);
  return parts.join("; ") + ".";
}
