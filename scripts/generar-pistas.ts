/**
 * Genera una lista de «pistas» de empresas compradoras con IA (Gemini, SIN búsqueda de Google), lee la web de cada una
 * para comprobarla y guarda el resultado en lib/buyers/ia-data/<HS6>-<PAIS>.json. La web nunca llama a Gemini.
 *
 *   GEMINI_API_KEY=... npm run buyers:generar -- --hs 220421 --pais DE [--max 15] [--dry]
 *
 * Variables: GEMINI_API_KEY (obligatoria; clave de Google AI Studio, solo en tu equipo), GEMINI_MODEL (opcional),
 * GEMINI_BASE_URL (opcional; para pruebas contra un servidor simulado).
 * Con --dry muestra el resultado sin escribir ficheros. Se ejecuta con `npx tsx` (no es una dependencia del proyecto).
 * Códigos de salida: 0 correcto · 1 error (configuración, API o formato) · 2 uso incorrecto.
 */
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { GeminiError } from "@/lib/buyers/ia/gemini";
import { generatePistas } from "@/lib/buyers/ia/generate";
import { validateBuyerQuery } from "@/lib/buyers/service";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

// Sin `await` en el nivel superior: el proyecto no declara "type": "module" y tsx lo ejecutaría como CommonJS.
async function main(): Promise<number> {
  const dry = process.argv.includes("--dry");
  const v = validateBuyerQuery({ hs6: arg("hs"), country: arg("pais") });
  if (!v.ok) {
    console.error(`❌ ${v.error}\nUso: npm run buyers:generar -- --hs 220421 --pais DE [--max 15] [--dry]`);
    return 2;
  }
  const max = Number(arg("max") ?? 15);
  try {
    const { set, stats } = await generatePistas(v.query, {
      apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL, baseUrl: process.env.GEMINI_BASE_URL, max: Number.isFinite(max) ? max : 15,
    });
    console.log(`Modelo: ${set.modelo} · sugeridas: ${stats.suggested} · web verificada: ${stats.verified} · pistas sin verificar: ${stats.unverified}`);
    for (const c of set.companies) {
      console.log(`${c.ia?.verificacion === "verificada" ? "✅" : "⚠️ "} ${c.name} — ${c.ia?.auditoria.join(" ") || "sin web que comprobar"}`);
    }
    for (const d of stats.discarded) console.log(`➖ descartada: ${d}`);
    if (dry) { console.log("(--dry: no se ha escrito ningún fichero)"); return 0; }

    const dir = path.resolve(process.cwd(), "lib/buyers/ia-data");
    mkdirSync(dir, { recursive: true });
    const file = `${set.hs6}-${set.country}.json`;
    writeFileSync(path.join(dir, file), JSON.stringify(set, null, 2) + "\n");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    const index = [
      "// GENERADO por `npm run buyers:generar`. No editar a mano: se reescribe al generar cada lista.",
      ...files.map((f, i) => `import f${i} from "./${f}";`),
      `export const IA_DATA_FILES: readonly unknown[] = [${files.map((_, i) => `f${i}`).join(", ")}];`,
      "",
    ].join("\n");
    writeFileSync(path.join(dir, "index.ts"), index);
    console.log(`Guardado lib/buyers/ia-data/${file} y actualizado el índice. Revisa la lista antes de publicarla.`);
    return 0;
  } catch (e) {
    console.error(`❌ ${e instanceof GeminiError || e instanceof Error ? e.message : "Error inesperado."}`);
    return 1;
  }
}

main().then((code) => process.exit(code));
