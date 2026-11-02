/**
 * Validación histórica del ranking con datos reales de Eurostat Comext (mercados de la UE). Descarga 2017–2025 para los
 * códigos del catálogo, calcula el ranking como si fuera 2019, 2020 y 2021 y lo compara con lo que pasó en los 3 años
 * siguientes (lib/backtest/ranking.ts). Escribe docs/backtest-ranking.md.
 *
 * Por qué no 2022 ni 2023 como origen: sus ventanas mezclan años en HS2017 (hasta 2021) y en HS2022 (desde 2022), y
 * la app marca esa mezcla como incompatible (lib/trade/normalize.ts). Comprobado el 02/11/2026: con origen 2022 no
 * queda ninguna oportunidad puntuada. Los resultados posteriores sí cruzan a HS2022; los códigos que cambiaron no
 * tienen dato final y se excluyen (ausente ≠ cero).
 *
 *   npx tsx scripts/backtest-ranking.ts                         # descarga y calcula
 *   npx tsx scripts/backtest-ranking.ts --cache /tmp/bt.json    # guarda la descarga (o la reutiliza si existe)
 *
 * No toca los datos guardados de la web (data/snapshots) ni la puntuación: solo mide. UN Comtrade no se incluye
 * (necesita clave y su cupo es limitado). Salida 0 si se escribió el informe; 1 si falló la descarga.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { allowedMarkets } from "@/lib/config";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { MIN_MARKETS, OUTCOME_LABEL, PREDICTOR_LABEL, runBacktest, type OriginResult, type OutcomeKey, type PredictorKey } from "@/lib/backtest/ranking";
import type { TradeObservation } from "@/lib/schemas/trade";
import { comextSource } from "@/lib/sources/comext";
import { validateSourceObservations } from "@/lib/trade/normalize";

const YEARS = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];
const ORIGINS = [2019, 2020, 2021];
const HORIZON = 3;

function arg(name: string) { const i = process.argv.indexOf(`--${name}`); return i >= 0 ? process.argv[i + 1] : undefined; }

async function download(codes: string[], markets: string[]): Promise<{ obs: TradeObservation[]; failed: string[] }> {
  const obs: TradeObservation[] = [];
  const failed: string[] = [];
  for (let i = 0; i < codes.length; i += 5) {
    const group = codes.slice(i, i + 5);
    console.log(`… ${group.join(", ")}`);
    try {
      obs.push(...validateSourceObservations(await comextSource.fetchData({ years: YEARS, productCodes: group, markets })).observations);
    } catch (e) {
      failed.push(`${group.join(", ")} (${e instanceof Error ? e.message : "error"})`);
    }
  }
  return { obs, failed };
}

const f2 = (v: number | null) => (v === null ? "n.d." : v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
const f0 = (v: number | null) => (v === null ? "n.d." : `${Math.round(v)} %`);

function table(r: OriginResult, out: OutcomeKey): string[] {
  const preds: PredictorKey[] = ["score", "size", "pastGrowth", "expansion"];
  return [
    `**${OUTCOME_LABEL[out]}**`, "",
    "| Ordenación | Productos | ρ media dentro del producto | ρ mediana | Productos con ρ > 0 | Tercio superior > inferior | ρ global |",
    "|---|---|---|---|---|---|---|",
    ...preds.map((p) => { const c = r.stats[out][p]; return `| ${PREDICTOR_LABEL[p]} | ${c.products} | ${f2(c.meanRho)} | ${f2(c.medianRho)} | ${f0(c.positivePct)} | ${f0(c.topBeatsBottomPct)} | ${f2(r.pooled[out][p])} |`; }),
    "",
  ];
}

async function main(): Promise<number> {
  const codes = [...new Set(HS_CATALOG.map((e) => e.code))];
  const markets = allowedMarkets("comext");
  const cache = arg("cache");
  let obs: TradeObservation[];
  let failed: string[] = [];
  if (cache && existsSync(cache)) {
    obs = JSON.parse(readFileSync(cache, "utf8"));
    console.log(`Usando la descarga guardada en ${cache} (${obs.length} observaciones).`);
  } else {
    ({ obs, failed } = await download(codes, markets.map((m) => m.code)));
    if (!obs.length) { console.error("❌ La descarga no devolvió observaciones."); return 1; }
    if (cache) writeFileSync(cache, JSON.stringify(obs));
  }
  const results = ORIGINS.map((t) => runBacktest(obs, markets.map((m) => ({ code: m.code, name: m.name })), t, HORIZON));
  const at = new Date().toISOString().slice(0, 10);
  const lines = [
    "# Validación histórica del ranking (backtest)", "",
    `Generado el ${at} por \`scripts/backtest-ranking.ts\` con datos reales de Eurostat Comext (${YEARS[0]}–${YEARS.at(-1)}, ${codes.length} códigos del catálogo, ${markets.length} mercados de la UE, ${obs.length} observaciones). Método en \`lib/backtest/ranking.ts\`.`, "",
    `Pregunta: si en el año T se hubiera usado el ranking de SmarTrade (mismo algoritmo y pesos que la web), ¿los mercados mejor puntuados para un producto fueron los que más crecieron en los ${HORIZON} años siguientes? Se compara con ordenar solo por tamaño o solo por crecimiento pasado.`, "",
    "Cómo leerlo: ρ es la correlación de rangos de Spearman (1 = el orden acierta del todo, 0 = ninguna relación, −1 = al revés). «Dentro del producto» = el orden de mercados que ve quien busca su producto; solo cuentan productos con al menos " + MIN_MARKETS + " mercados evaluables. «Tercio superior > inferior» = % de productos en que la mediana del resultado de los mercados del tercio superior del ranking superó a la del tercio inferior. Las parejas no son independientes: no hay p-valores y diferencias pequeñas no deben interpretarse.", "",
    ...(failed.length ? [`**Grupos que fallaron en la descarga (excluidos):** ${failed.join("; ")}`, ""] : []),
  ];
  for (const r of results) {
    lines.push(`## Ranking de ${r.originYear} (ventana ${r.originYear - 2}–${r.originYear}) frente a ${r.originYear}→${r.originYear + r.horizon}`, "", `Oportunidades puntuadas: ${r.scored}; con resultado posterior: ${r.evaluated}.`, "");
    for (const out of ["marketGrowth", "spainGrowth", "spainIncrease"] as OutcomeKey[]) lines.push(...table(r, out));
  }
  const out = path.resolve(process.cwd(), "docs", "backtest-ranking.md");
  writeFileSync(out, lines.join("\n"));
  console.log(lines.join("\n"));
  return 0;
}

main().then((c) => process.exit(c), (e) => { console.error(`❌ ${e instanceof Error ? e.message : e}`); process.exit(1); });
