"use client";

import { activeDeals, activeStaff, palletCapacity } from "@/lib/sim/campaign/engine";
import type { CampaignState, Facility } from "@/lib/sim/campaign/model";
import { Van } from "./fx";

/**
 * Dibujo de tu empresa (23/11/2026, petición del dueño: «dibujos de los almacenes, camiones y personal»). Refleja el
 * estado real: la nave que alquilaste (o tu oficina en casa), si está en obras, cuántos palés tienes guardados, tus
 * vehículos y tu plantilla con nombre. Sin animación: es un retrato de la empresa.
 */
const SHORT: Record<Facility["id"], string> = { urbana: "Nave urbana", poligono: "Nave del polígono", compartida: "Nave compartida" };
const COLORS = { conductor: "#4f46e5", mozo: "#059669", temporal: "#64748b", owner: "#d97706" } as const;

function Person({ x, name, role, color }: { x: number; name: string; role: string; color: string }) {
  return (
    <g transform={`translate(${x} 150)`}>
      <circle cx="0" cy="0" r="9" fill="#fcd9b6" stroke="#1e293b" strokeWidth="1" />
      <path d="M-13 30 q13 -24 26 0 z" fill={color} />
      <rect x="-14" y="30" width="28" height="4" rx="2" fill={color} opacity=".7" />
      <text y="48" textAnchor="middle" fontSize="10" fontWeight="600" fill="#1e293b">{name}</text>
      <text y="59" textAnchor="middle" fontSize="8.5" fill="#64748b">{role}</text>
    </g>
  );
}

/** Camión rígido (nivel 8): caja más alta y cabina separada. */
function Truck() {
  return (
    <g>
      <rect x="0" y="0" width="74" height="36" rx="3" fill="#0f766e" />
      <rect x="6" y="6" width="50" height="4" rx="2" fill="#ccfbf1" />
      <path d="M76 12h16l12 12v14H76z" fill="#115e59" />
      <rect x="80" y="15" width="12" height="9" rx="1" fill="#ccfbf1" />
      <circle cx="18" cy="40" r="6.5" fill="#1e293b" /><circle cx="34" cy="40" r="6.5" fill="#1e293b" /><circle cx="90" cy="40" r="6.5" fill="#1e293b" />
    </g>
  );
}

function Building({ f, ready, fill }: { f: Facility; ready: boolean; fill: number }) {
  const wide = f.id === "poligono", w = wide ? 250 : 170, x = 20, h = wide ? 96 : 86, y = 132 - h;
  const doors = wide ? 3 : 1;
  const stacks = Math.round(fill * (wide ? 9 : 5));
  return (
    <g>
      {f.id === "compartida" && <rect x={x + w / 2} y={y} width={w / 2} height={h} fill="#cbd5e1" />}
      <rect x={x} y={y} width={f.id === "compartida" ? w / 2 : w} height={h} fill={wide ? "#c7d2fe" : "#e0e7ff"} />
      <path d={`M${x - 6} ${y} L${x + w / 2} ${y - 20} L${x + w + 6} ${y} Z`} fill="#6366f1" />
      {Array.from({ length: doors }, (_, i) => { const dx = x + 18 + i * ((w - 36) / doors); const dw = (w - 36) / doors - 10; return (
        <g key={i}><rect x={dx} y={y + 30} width={dw} height={h - 30} fill="#334155" />{Array.from({ length: 4 }, (_, k) => <rect key={k} x={dx} y={y + 30 + k * 12} width={dw} height="2" fill="#475569" />)}</g>
      ); })}
      {ready && Array.from({ length: stacks }, (_, i) => <g key={i} transform={`translate(${x + 8 + i * (w - 16) / Math.max(stacks, 1)} ${118})`}><rect width="16" height="12" fill="#d97706" /><rect y="12" width="16" height="2" fill="#92400e" /></g>)}
      <rect x={x + 10} y={y + 8} width={w - 20} height="16" rx="3" fill="#fff" />
      <text x={x + w / 2} y={y + 20} textAnchor="middle" fontSize="10" fontWeight="700" fill="#3730a3">{SHORT[f.id]} · {f.pallets} palés</text>
      {!ready && (
        <g>
          {Array.from({ length: 6 }, (_, i) => <line key={i} x1={x + i * (w / 5)} y1={y - 10} x2={x + i * (w / 5)} y2={132} stroke="#a16207" strokeWidth="2" />)}
          <line x1={x} y1={y + 40} x2={x + w} y2={y + 40} stroke="#a16207" strokeWidth="2" />
          <rect x={x + w / 2 - 38} y={y + 46} width="76" height="16" rx="3" fill="#facc15" stroke="#a16207" />
          <text x={x + w / 2} y={y + 58} textAnchor="middle" fontSize="10" fontWeight="700" fill="#713f12">EN OBRAS</text>
        </g>
      )}
    </g>
  );
}

export function CompanyScene({ s, compact = false }: { s: CampaignState; compact?: boolean }) {
  const c = s.company;
  const ready = !!c.facility && s.abs >= c.facility.readyAbs;
  const cap = palletCapacity(c, s.abs) || c.facility?.pallets || 1;
  const used = activeDeals(c, s.abs).filter((d) => d.kind === "almacen" && !d.external).reduce((a, d) => a + d.pallets!, 0);
  const staff = activeStaff(c);
  const people = [{ name: "Tú", role: "dirección", color: COLORS.owner }, ...staff.map((p) => ({ name: p.name.split(" ")[0], role: p.role === "conductor" ? "conductor/a" : p.role === "mozo" ? "mozo/a" : "temporal", color: COLORS[p.role] }))];
  const bx = c.facility ? (c.facility.id === "poligono" ? 284 : 204) : 146;
  // Vehículos uno detrás de otro (el camión ocupa más) y la plantilla en lo que queda hasta el borde del dibujo.
  let cursor = bx;
  const vx = c.vehicles.map((v) => { const x = cursor; cursor += v.kind === "rigido" ? 104 : 86; return { v, x }; });
  const shown = people.slice(0, 6);
  const px = cursor + 24, gap = Math.min(62, (630 - px) / Math.max(1, shown.length));
  return (
    <figure className={`mx-auto w-full max-w-3xl overflow-hidden rounded-lg border border-slate-200 bg-white ${compact ? "" : "shadow-sm"}`}>
      <svg viewBox="0 0 640 220" className="block h-auto w-full" role="img" aria-label={`Tu empresa: ${c.facility ? c.facility.name + (ready ? "" : " en obras") : "sin nave, oficina en casa"}, ${c.vehicles.length} ${c.vehicles.length === 1 ? "vehículo" : "vehículos"} y ${people.length} ${people.length === 1 ? "persona" : "personas"}.`}>
        <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e0f2fe" /><stop offset="1" stopColor="#f8fafc" /></linearGradient></defs>
        <rect width="640" height="220" fill="url(#sky)" />
        <circle cx="590" cy="38" r="18" fill="#fde68a" />
        <rect y="132" width="640" height="88" fill="#e2e8f0" />
        <rect y="132" width="640" height="4" fill="#94a3b8" />
        {c.facility ? <Building f={c.facility} ready={ready} fill={Math.min(1, used / cap)} /> : (
          <g>
            <rect x="30" y="72" width="100" height="60" fill="#fef3c7" /><path d="M22 72 L80 40 L138 72 Z" fill="#b45309" />
            <rect x="70" y="100" width="20" height="32" fill="#92400e" /><rect x="40" y="84" width="20" height="16" fill="#bae6fd" /><rect x="100" y="84" width="20" height="16" fill="#bae6fd" />
            <text x="80" y="66" textAnchor="middle" fontSize="9" fontWeight="700" fill="#fff">OFICINA</text>
          </g>
        )}
        {vx.map(({ v, x }) => (v.kind === "rigido" ? <g key={v.id} transform={`translate(${x} 92) scale(.95)`}><Truck /></g> : <g key={v.id} transform={`translate(${x} 100) scale(.95)`}><Van color={v.id === "furgoneta" ? undefined : "#7c3aed"} /></g>))}
        {shown.map((p, i) => <Person key={i} x={px + i * gap} name={p.name} role={p.role} color={p.color} />)}
        {c.legal?.form === "sl" && <text x="10" y="18" fontSize="10" fontWeight="700" fill="#3730a3">S.L.</text>}
        {c.upgrades.length > 0 && <text x="630" y="210" textAnchor="end" fontSize="9" fill="#475569">Mejoras: {c.upgrades.length}</text>}
      </svg>
    </figure>
  );
}
