import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

/**
 * Las pruebas NO leen los datos guardados del repositorio (data/snapshots): esos ficheros cambian cada dos meses y
 * harían que las pruebas de las fuentes «en vivo» dependieran de qué datos haya en cada momento (pasó el 30/10/2026:
 * al fusionar los datos de Comtrade, dos pruebas de Comtrade en vivo empezaron a recibir datos guardados).
 * Por defecto apuntan a una carpeta vacía; tests/snapshots.test.ts usa sus propias carpetas.
 */
export const EMPTY_SNAPSHOT_DIR = mkdtempSync(path.join(tmpdir(), "smartrade-sin-datos-"));
process.env.SMARTRADE_SNAPSHOT_DIR = EMPTY_SNAPSHOT_DIR;
