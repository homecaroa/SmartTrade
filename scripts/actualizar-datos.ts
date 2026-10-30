/**
 * Actualiza los datos guardados de Eurostat Comext y UN Comtrade (data/snapshots). Lo ejecuta cada dos meses
 * .github/workflows/actualizar-datos.yml, que abre un PR con los cambios para revisarlos; también se puede lanzar a mano:
 *
 *   npm run datos:actualizar                      # todos los modos
 *   npm run datos:actualizar -- --modo comext     # solo Eurostat
 *   npm run datos:actualizar -- --codigos 220421,150920
 *
 * UN Comtrade necesita COMTRADE_API_KEY (sin clave se omite y se dice en el resumen). Escribe data/snapshots/RESUMEN.md.
 * Salida 0 si al menos un modo se actualizó; 1 si todo falló; 2 uso incorrecto. Se ejecuta con `npx tsx`.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { allowedMarkets } from "@/lib/config";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { getSource } from "@/lib/sources";
import { SNAPSHOT_MODES, snapshotFileSchema, type SnapshotMode } from "@/lib/snapshots/schema";
import { serializeSnapshot, snapshotYears, summarize, updateSnapshots, type ModePlan } from "@/lib/snapshots/update";

function arg(name: string) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; }

async function main(): Promise<number> {
  const modeArg = arg("modo") ?? "todos";
  if (!["todos", ...SNAPSHOT_MODES].includes(modeArg)) { console.error("❌ --modo debe ser comext, comtrade o todos"); return 2; }
  const modes = (modeArg === "todos" ? [...SNAPSHOT_MODES] : [modeArg]) as SnapshotMode[];
  const codes = arg("codigos")?.split(",").map((c) => c.trim()) ?? [...new Set(HS_CATALOG.map((e) => e.code))];
  if (!codes.every((c) => /^\d{6}$/.test(c))) { console.error("❌ --codigos: códigos HS6 separados por comas"); return 2; }
  const dir = process.env.SMARTRADE_SNAPSHOT_DIR || path.resolve(process.cwd(), "data", "snapshots");
  const now = new Date();
  const years = snapshotYears(now);
  const plans: ModePlan[] = modes.map((mode) => ({
    mode, markets: allowedMarkets(mode).map((m) => m.code),
    skipReason: mode === "comtrade" && !process.env.COMTRADE_API_KEY?.trim() ? "falta COMTRADE_API_KEY (secreto del repositorio en GitHub)." : undefined,
  }));
  const reports = await updateSnapshots(plans, codes, years, 5, {
    fetchData: (mode, q) => getSource(mode).fetchData(q),
    read: (mode, code) => { try { const p = snapshotFileSchema.safeParse(JSON.parse(readFileSync(path.join(dir, mode, `${code}.json`), "utf8"))); return p.success ? p.data : null; } catch { return null; } },
    write: (f) => { mkdirSync(path.join(dir, f.mode), { recursive: true }); writeFileSync(path.join(dir, f.mode, `${f.code}.json`), serializeSnapshot(f)); },
    now: () => now,
    log: (m) => console.log(`… ${m}`),
  });
  const summary = summarize(reports, years, now);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "RESUMEN.md"), summary);
  console.log("\n" + summary);
  return reports.some((r) => r.updated.length > 0) ? 0 : 1;
}

main().then((c) => process.exit(c), (e) => { console.error(`❌ ${e instanceof Error ? e.message : e}`); process.exit(1); });
