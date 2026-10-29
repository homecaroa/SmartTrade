import { z } from "zod";
import { IA_DATA_FILES } from "../ia-data";
import { companyInputSchema, type CompanyInput } from "../types";

/** Listas de pistas generadas por `npm run buyers:generar` y guardadas como JSON en lib/buyers/ia-data/ (nada en base de datos). */
export const iaSetFileSchema = z.object({
  hs6: z.string().regex(/^\d{6}$/),
  country: z.string().length(2),
  generadoEn: z.string().regex(/^\d{4}-\d{2}-\d{2}/),
  modelo: z.string().min(1),
  scope: z.string().min(1),
  companies: z.array(companyInputSchema),
});
export type IaSet = z.infer<typeof iaSetFileSchema> & { companies: CompanyInput[] };

/** Valida los ficheros registrados. Un fichero inválido no rompe la página: se omite y se devuelve el error. */
export function loadIaSets(files: readonly unknown[] = IA_DATA_FILES): { sets: IaSet[]; errors: string[] } {
  const sets: IaSet[] = [];
  const errors: string[] = [];
  files.forEach((f, i) => {
    const r = iaSetFileSchema.safeParse(f);
    if (r.success) sets.push(r.data);
    else errors.push(`Fichero de pistas de IA nº ${i + 1} no válido: ${r.error.issues[0]?.message ?? "formato incorrecto"}.`);
  });
  return { sets, errors };
}
