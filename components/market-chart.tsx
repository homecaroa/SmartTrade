"use client";

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Point = { label: string; value: number | null; value2?: number | null };

const fmt = (v: unknown) => (typeof v === "number" ? `${(v / 1e6).toLocaleString("es-ES", { maximumFractionDigits: 1 })} M` : "n.d.");

export function MarketChart({ type, data, unit, label2 }: { type: "line" | "bar"; data: Point[]; unit: string; label2?: string }) {
  return (
    <div className="h-64 w-full" role="img" aria-label={`Gráfico de ${type === "line" ? "evolución" : "comparación"} (${unit})`}>
      <ResponsiveContainer>
        {type === "line" ? (
          <LineChart data={data} margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={fmt} width={70} />
            <Tooltip formatter={(v) => fmt(v) + " " + unit} />
            <Line type="monotone" dataKey="value" name="Importaciones del mercado" stroke="#4f46e5" strokeWidth={2} connectNulls={false} />
            {label2 && <Line type="monotone" dataKey="value2" name={label2} stroke="#059669" strokeWidth={2} connectNulls={false} />}
          </LineChart>
        ) : (
          <BarChart data={data} margin={{ left: 8, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="label" />
            <YAxis tickFormatter={fmt} width={70} />
            <Tooltip formatter={(v) => fmt(v) + " " + unit} />
            <Bar dataKey="value" name="Importaciones" fill="#4f46e5" />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}
