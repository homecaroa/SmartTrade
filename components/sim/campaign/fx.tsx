"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Animaciones de la Campaña (23/11/2026, petición del dueño: «dopamina visual»). Las once de la página de muestras,
 * hechas con CSS (app/globals.css, clases fx-*) y un poco de JavaScript, sin librerías. Se apagan con el interruptor
 * del juego y respetan la preferencia del sistema de reducir el movimiento.
 */
export const FxContext = createContext(true);
export const useFx = () => useContext(FxContext);
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };

const fmt = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** 2. Cifra que cuenta hasta su nuevo valor y lanza el «+840 €» o «−300 €». */
export function AnimatedEuro({ value, className = "" }: { value: number; className?: string }) {
  const on = useFx();
  const [shown, setShown] = useState(value);
  const [delta, setDelta] = useState<{ v: number; k: number } | null>(null);
  const prev = useRef(value);
  useEffect(() => {
    const from = prev.current, to = value;
    prev.current = value;
    if (from === to) return;
    if (!on || reduced()) { setShown(to); return; }
    setDelta({ v: to - from, k: Date.now() });
    const t0 = performance.now(), dur = 800;
    let raf = 0;
    const step = (t: number) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); setShown(from + (to - from) * e); if (k < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    const clear = setTimeout(() => setDelta(null), 1300);
    return () => { cancelAnimationFrame(raf); clearTimeout(clear); };
  }, [value, on]);
  return (
    <span className="relative inline-block">
      <span key={delta?.k} className={`tabular-nums ${delta ? "fx-bump inline-block" : ""} ${className}`}>{fmt(on ? shown : value)}</span>
      {delta && Math.abs(delta.v) >= 0.01 && <span aria-hidden className={`fx-rise pointer-events-none absolute -top-3 right-0 whitespace-nowrap text-sm font-bold ${delta.v > 0 ? "text-emerald-600" : "text-rose-600"}`}>{delta.v > 0 ? "+" : "−"}{fmt(Math.abs(delta.v))}</span>}
    </span>
  );
}

/** 1. Estrellas que saltan una tras otra; las no conseguidas, grises. */
export function StarBurst({ stars }: { stars: [boolean, boolean, boolean] }) {
  const on = useFx();
  return (
    <span className="inline-flex gap-1 align-middle text-2xl" aria-label={`${stars.filter(Boolean).length} estrellas de 3`}>
      {stars.map((x, i) => <span key={i} className={`relative inline-block ${x ? `text-amber-500 ${on ? "fx-pop fx-ring" : ""}` : "text-slate-300"}`} style={x && on ? { animationDelay: `${0.25 + i * 0.35}s` } : undefined}>★</span>)}
    </span>
  );
}

/** 3. Confeti (solo al superar un nivel con ★★ o más). */
export function Confetti({ fire }: { fire: boolean }) {
  const on = useFx();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire || !on || reduced() || !ref.current) return;
    const c = ref.current, ctx = c.getContext("2d");
    if (!ctx) return;
    const r = c.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    c.width = r.width * dpr; c.height = r.height * dpr; ctx.scale(dpr, dpr);
    const cols = ["#4f46e5", "#059669", "#f59e0b", "#e11d48", "#0ea5e9"];
    const P = Array.from({ length: 140 }, (_, i) => ({ x: r.width / 2, y: r.height * 0.35, vx: Math.cos(i) * (2 + (i % 7)), vy: -4 - (i % 9), s: 4 + (i % 5), a: i, va: ((i % 5) - 2) / 10, c: cols[i % cols.length] }));
    const t0 = performance.now();
    let raf = 0;
    const draw = (t: number) => {
      const el = t - t0;
      ctx.clearRect(0, 0, r.width, r.height);
      for (const p of P) { p.vy += 0.25; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.a += p.va; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a); ctx.globalAlpha = Math.max(0, 1 - el / 1800); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); ctx.restore(); }
      if (el < 1800) raf = requestAnimationFrame(draw); else ctx.clearRect(0, 0, r.width, r.height);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [fire, on]);
  return <canvas ref={ref} aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />;
}

/** 4. Tarjeta que se gira al aparecer (desbloqueos). */
export function FlipIn({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const on = useFx();
  return <div className={`${on ? "fx-flip-in" : ""} ${className}`} style={on ? { animationDelay: `${delay}s` } : undefined}>{children}</div>;
}

/** 5. Barra que se llena con suavidad y parpadea en rojo si te pasas. */
export function Meter({ label, value, max }: { label: string; value: number; max: number }) {
  const on = useFx();
  const over = value > max;
  const pct = Math.min(100, Math.round(value / Math.max(1, max) * 100));
  const [w, setW] = useState(on ? 0 : pct);
  useEffect(() => { const t = setTimeout(() => setW(pct), 30); return () => clearTimeout(t); }, [pct]);
  return (
    <div>
      <p className="text-xs">{label}</p>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-slate-200" role="meter" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value} aria-label={label}>
        <div key={over ? "over" : "ok"} className={`h-2.5 rounded-full ${over ? `bg-rose-600 ${on ? "fx-alarm" : ""}` : value / Math.max(1, max) > 0.9 ? "bg-amber-500" : "bg-blue-500"}`} style={{ width: `${w}%`, transition: on ? "width .9s cubic-bezier(.2,.9,.3,1)" : undefined }} />
      </div>
    </div>
  );
}

/** 6. La furgoneta cruza al cerrar la semana (se dispara cuando cambia `trigger`). */
export function VanCrossing({ trigger, label }: { trigger: number; label: string }) {
  const on = useFx();
  const [run, setRun] = useState(0);
  const first = useRef(true);
  useEffect(() => { if (first.current) { first.current = false; return; } if (on && !reduced()) setRun(trigger); }, [trigger, on]);
  if (!run) return null;
  return (
    <div key={run} aria-hidden className="relative h-14 overflow-hidden rounded-lg bg-white shadow-sm" style={{ containerType: "inline-size" }} onAnimationEnd={() => setRun(0)}>
      <span className="absolute right-3 top-1 text-xs font-semibold text-indigo-700">{label}</span>
      <div className="absolute bottom-3 left-0 right-0 h-1" style={{ background: "repeating-linear-gradient(90deg,#cbd5e1 0 22px,transparent 22px 36px)" }} />
      <svg className="fx-drive absolute bottom-3 left-0 w-20" viewBox="0 0 84 44"><Van /></svg>
    </div>
  );
}

/** Furgoneta (también la usa la escena de la empresa). */
export function Van({ color = "#4f46e5" }: { color?: string }) {
  return (
    <g>
      <rect x="2" y="8" width="52" height="26" rx="3" fill={color} />
      <path d="M54 14h14l12 10v10H54z" fill={color} />
      <rect x="58" y="17" width="10" height="7" rx="1" fill="#e0e7ff" />
      <rect x="8" y="14" width="34" height="4" rx="2" fill="#e0e7ff" />
      <g className="fx-wheel"><circle cx="20" cy="36" r="6" fill="#1e293b" /><rect x="19" y="31" width="2" height="10" fill="#f8fafc" /></g>
      <g className="fx-wheel"><circle cx="66" cy="36" r="6" fill="#1e293b" /><rect x="65" y="31" width="2" height="10" fill="#f8fafc" /></g>
    </g>
  );
}

/** 7. Sello sobre la decisión recién tomada. */
const STAMP = { correcta: ["Decisión adecuada", "border-emerald-600 text-emerald-700 bg-emerald-50"], razonable: ["Razonable", "border-amber-600 text-amber-700 bg-amber-50"], grave: ["Error importante", "border-rose-600 text-rose-700 bg-rose-50"] } as const;
export function Stamp({ grade }: { grade: keyof typeof STAMP }) {
  const on = useFx();
  return <span className={`inline-block rotate-[-8deg] rounded border-2 px-2 py-0.5 text-xs font-bold uppercase tracking-wide ${STAMP[grade][1]} ${on ? "fx-stamp" : ""}`}>{STAMP[grade][0]}</span>;
}

/** 8. Aviso de logro: entra por la esquina y se va. */
export function AchievementToast({ item, onDone }: { item: { icon: string; title: string; text: string } | null; onDone: () => void }) {
  const on = useFx();
  useEffect(() => { if (!item) return; const t = setTimeout(onDone, 3500); return () => clearTimeout(t); }, [item, onDone]);
  if (!item) return null;
  return (
    <div role="status" className={`fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl border border-amber-400 bg-white p-3 shadow-lg ${on ? "fx-toast" : ""}`} style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>
      <span aria-hidden className="grid h-9 w-9 flex-none place-items-center rounded-full bg-gradient-to-br from-amber-200 to-amber-500 font-extrabold text-amber-900">{item.icon}</span>
      <div><p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Logro desbloqueado</p><p className="text-sm font-bold">{item.title}</p><p className="text-xs text-slate-600">{item.text}</p></div>
    </div>
  );
}

/** 9. El concepto nuevo vuela hacia la pestaña del Manual. */
export function FlyingConcept({ title }: { title: string | null }) {
  const on = useFx();
  if (!title || !on) return null;
  return <span key={title} aria-hidden className="fx-fly pointer-events-none absolute left-1/2 top-0 z-10 whitespace-nowrap rounded bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-800">+ {title}</span>;
}

/** 11. Medidor de reputación con aguja. */
export function Gauge({ value, label = "Reputación" }: { value: number; label?: string }) {
  const on = useFx();
  const v = Math.max(0, Math.min(100, Math.round(value)));
  const [shown, setShown] = useState(on ? 0 : v);
  useEffect(() => { const t = setTimeout(() => setShown(v), 60); return () => clearTimeout(t); }, [v]);
  const color = v < 60 ? "#e11d48" : v < 80 ? "#d97706" : "#059669";
  const trans = on ? "transform 1.2s cubic-bezier(.3,1.5,.5,1), stroke-dashoffset 1.2s cubic-bezier(.3,1.2,.5,1)" : undefined;
  return (
    <svg viewBox="0 0 180 110" className="w-44" role="img" aria-label={`${label}: ${v} de 100`}>
      <path d="M14 90a76 76 0 0 1 152 0" fill="none" stroke="#e2e8f0" strokeWidth="12" strokeLinecap="round" />
      <path d="M14 90a76 76 0 0 1 152 0" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" strokeDasharray="239" strokeDashoffset={239 * (1 - shown / 100)} style={{ transition: trans }} />
      <g style={{ transform: `rotate(${-80 + shown * 1.6}deg)`, transformOrigin: "90px 90px", transition: trans }}><rect x="88" y="26" width="4" height="64" rx="2" fill="#1e293b" /></g>
      <circle cx="90" cy="90" r="7" fill="#1e293b" />
      <text x="90" y="108" textAnchor="middle" fontSize="11" fill="#475569">{label}: {v} / 100</text>
    </svg>
  );
}

/** 10. Aviso grave: tiembla y destella una vez al aparecer. */
export function DangerAlert({ children }: { children: ReactNode }) {
  const on = useFx();
  return <p role="alert" className={`rounded border-2 border-rose-500 bg-rose-50 p-2 text-sm font-semibold text-rose-800 ${on ? "fx-shake" : ""}`}>{children}</p>;
}
