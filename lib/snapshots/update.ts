import { validateSourceObservations } from "@/lib/trade/normalize";
import type { SourceQuery, SourceResult } from "@/lib/sources/types";
import type { TradeObservation } from "@/lib/schemas/trade";
import type { SnapshotFile, SnapshotMode } from "./schema";

/**
 * Actualización de los datos guardados (la ejecuta scripts/actualizar-datos.ts cada dos meses).
 * Reglas: se consulta por grupos de códigos; si un grupo falla, se CONSERVAN los ficheros anteriores de esos códigos y
 * el fallo queda en el resumen (nunca se borran datos por un error de la fuente). Un código consultado sin observaciones
 * se guarda vacío: así la web no lo vuelve a pedir en vivo en cada visita y avisa de «sin datos» igual que antes.
 */
export interface UpdateDeps {
  fetchData: (mode: SnapshotMode, q: SourceQuery) => Promise<SourceResult>;
  read: (mode: SnapshotMode, code: string) => SnapshotFile | null;
  write: (f: SnapshotFile) => void;
  now: () => Date;
  log?: (msg: string) => void;
}
export interface ModePlan { mode: SnapshotMode; markets: string[]; skipReason?: string }
export interface ModeReport { mode: SnapshotMode; skipped?: string; updated: string[]; changed: string[]; added: string[]; empty: string[]; failed: { codes: string[]; reason: string }[]; observations: number }

const obsKey = (o: TradeObservation) => [o.period, o.reporterCode, o.partnerCode, o.productCode, o.flow].join("|");
const sameData = (a: unknown[], b: TradeObservation[]) => {
  const fmt = (o: Partial<TradeObservation>) => `${obsKey(o as TradeObservation)}=${o.tradeValue}/${o.netWeight}/${o.status}`;
  return a.length === b.length && JSON.stringify(a.map((x) => fmt(x as TradeObservation)).sort()) === JSON.stringify(b.map(fmt).sort());
};

export async function updateSnapshots(plans: ModePlan[], codes: string[], years: number[], groupSize: number, deps: UpdateDeps): Promise<ModeReport[]> {
  const reports: ModeReport[] = [];
  for (const plan of plans) {
    const r: ModeReport = { mode: plan.mode, updated: [], changed: [], added: [], empty: [], failed: [], observations: 0 };
    reports.push(r);
    if (plan.skipReason) { r.skipped = plan.skipReason; continue; }
    for (let i = 0; i < codes.length; i += groupSize) {
      const group = codes.slice(i, i + groupSize);
      deps.log?.(`${plan.mode}: ${group.join(", ")}`);
      let res: SourceResult;
      try {
        res = validateSourceObservations(await deps.fetchData(plan.mode, { years, productCodes: group, markets: plan.markets }));
      } catch (e) {
        r.failed.push({ codes: group, reason: e instanceof Error ? e.message : "error desconocido" });
        continue;
      }
      const at = deps.now().toISOString();
      for (const code of group) {
        const obs = res.observations.filter((o) => o.productCode === code);
        const prev = deps.read(plan.mode, code);
        deps.write({ v: 1, mode: plan.mode, code, years, generatedAt: at, sourceLabel: res.sourceLabel, warnings: res.warnings, observations: obs });
        r.updated.push(code);
        r.observations += obs.length;
        if (!obs.length) r.empty.push(code);
        if (!prev) r.added.push(code);
        else if (!sameData(prev.observations, obs)) r.changed.push(code);
      }
    }
  }
  return reports;
}

/** Fichero legible en un PR: cabecera con sangría y una observación por línea. */
export function serializeSnapshot(f: SnapshotFile): string {
  const { observations, ...head } = f;
  const h = JSON.stringify(head, null, 2).replace(/\n}$/, "");
  const body = observations.map((o) => `    ${JSON.stringify(o)}`).join(",\n");
  return `${h},\n  "observations": [${observations.length ? `\n${body}\n  ` : ""}]\n}\n`;
}

/** Resumen en Markdown para el cuerpo del PR y para data/snapshots/RESUMEN.md. */
export function summarize(reports: ModeReport[], years: number[], at: Date): string {
  const lines = [`# Actualización de datos guardados · ${at.toISOString().slice(0, 10)}`, "", `Años: ${years.join(", ")}. Generado por \`scripts/actualizar-datos.ts\` (actualización bimensual).`, ""];
  for (const r of reports) {
    lines.push(`## ${r.mode === "comext" ? "Eurostat Comext (UE)" : "UN Comtrade (fuera de la UE)"}`);
    if (r.skipped) { lines.push(`Omitido: ${r.skipped}`, ""); continue; }
    lines.push(`- Códigos actualizados: ${r.updated.length} (${r.observations} observaciones)`);
    lines.push(`- Con cambios en los datos: ${r.changed.length ? r.changed.join(", ") : "ninguno"}`);
    if (r.added.length) lines.push(`- Nuevos: ${r.added.join(", ")}`);
    if (r.empty.length) lines.push(`- Sin datos en la fuente: ${r.empty.join(", ")}`);
    if (r.failed.length) lines.push(`- **Fallidos (se conservan los datos anteriores):** ${r.failed.map((f) => `${f.codes.join(", ")} — ${f.reason}`).join("; ")}`);
    lines.push("");
  }
  lines.push("Revisa los códigos con cambios antes de fusionar: Eurostat y Comtrade revisan cifras de años anteriores.");
  return lines.join("\n") + "\n";
}

/** Años guardados: los cuatro últimos completos, para cubrir las ventanas de 3 años que terminan en los dos últimos. */
export function snapshotYears(now: Date): number[] {
  const last = now.getUTCFullYear() - 1;
  return [last - 3, last - 2, last - 1, last];
}
