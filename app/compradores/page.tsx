import Link from "next/link";
import { BuyerCard } from "@/components/buyer-card";
import { ErrorState } from "@/components/error-state";
import { MARKETS } from "@/lib/config/catalog";
import { HS_CATALOG } from "@/lib/config/hs-catalog";
import { filterCompanies } from "@/lib/buyers/rules";
import { searchBuyers, validateBuyerQuery } from "@/lib/buyers/service";
import { COMPANY_TYPES, EVIDENCE_LEVELS, LEVEL_LABEL, TYPE_LABEL } from "@/lib/buyers/types";

export const metadata = { title: "Importadores y compradores · SmarTrade" };
export const dynamic = "force-dynamic";

type SP = { hs?: string; pais?: string; tipo?: string; nivel?: string; kw?: string };

export default async function Buyers({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const sel = "rounded border border-slate-300 px-2 py-1.5 text-sm";
  const form = (
    <form method="get" className="grid gap-3 rounded-lg bg-white p-4 text-sm shadow-sm sm:grid-cols-2 lg:grid-cols-5">
      <label className="flex flex-col gap-1">Producto (HS6)
        <input name="hs" defaultValue={sp.hs ?? ""} list="hs-list" inputMode="numeric" maxLength={6} placeholder="220421" className={sel} />
        <datalist id="hs-list">{HS_CATALOG.map((e) => <option key={e.code} value={e.code}>{e.name}</option>)}</datalist>
      </label>
      <label className="flex flex-col gap-1">País de destino
        <select name="pais" defaultValue={sp.pais ?? "JP"} className={sel}>{[...MARKETS].sort((a, b) => a.name.localeCompare(b.name, "es")).map((m) => <option key={m.code} value={m.code}>{m.name}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1">Tipo de empresa
        <select name="tipo" defaultValue={sp.tipo ?? ""} className={sel}><option value="">Todos</option>{COMPANY_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1">Nivel de evidencia
        <select name="nivel" defaultValue={sp.nivel ?? ""} className={sel}><option value="">Todos</option>{EVIDENCE_LEVELS.map((n) => <option key={n} value={n}>{LEVEL_LABEL[n]}</option>)}</select>
      </label>
      <label className="flex flex-col gap-1">Palabras clave en inglés (opcional)
        <input name="kw" defaultValue={sp.kw ?? ""} placeholder="wine, olive oil" className={sel} />
      </label>
      <div className="sm:col-span-2 lg:col-span-5"><button className="rounded bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-700">Buscar importadores</button></div>
    </form>
  );

  const intro = (
    <section className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
      <p><b>Cómo leer esto.</b> Las estadísticas de importación de un país no son un registro de compradores. Aquí aparecen empresas con pruebas enlazadas de que trabajan con el producto; <b>ninguna es un comprador asegurado</b>.</p>
      <p>«Importador confirmado» = una página leída de la propia empresa lo afirma. «Comprador probable» = solo fuentes secundarias. Solo se muestran contactos públicos con su fuente; nunca correos inferidos ni datos personales sin fuente pública fiable.</p>
      <p><b>Listas con IA.</b> Algunas empresas las sugiere un modelo de IA (Gemini). Las marcadas «web verificada» tienen una web que hemos leído y que nombra a la empresa y al producto. Las «pista sin verificar» pueden ser erróneas o no existir: compruébalas antes de usarlas.</p>
      <p>Antes de escribir a nadie, revisa la normativa de comunicaciones comerciales y protección de datos aplicable (por ejemplo, RGPD y las leyes antispam del país). Esto no es asesoramiento legal.</p>
    </section>
  );

  if (!sp.hs) return <div className="space-y-4"><h1 className="text-xl font-bold">Importadores y compradores</h1>{intro}{form}</div>;

  const v = validateBuyerQuery({ hs6: sp.hs, country: sp.pais, keywords: sp.kw });
  if (!v.ok) return <div className="space-y-4"><h1 className="text-xl font-bold">Importadores y compradores</h1>{form}<ErrorState message={v.error} /></div>;

  const r = await searchBuyers(v.query);
  const list = filterCompanies(r.companies, { tipo: sp.tipo, nivel: sp.nivel });
  const country = MARKETS.find((m) => m.code === v.query.country)?.name ?? v.query.country;
  const exportQs = new URLSearchParams(Object.entries({ hs: sp.hs, pais: sp.pais, tipo: sp.tipo, nivel: sp.nivel, kw: sp.kw }).filter(([, x]) => x) as [string, string][]).toString();

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">Importadores y compradores: HS {v.query.hs6} en {country}</h1>
      {intro}
      {form}
      <section className="space-y-1 rounded-lg bg-white p-4 text-sm shadow-sm">
        <p><b>{r.summary.total}</b> empresas encontradas: {r.summary.confirmado} importadores confirmados, {r.summary.probable} compradores probables, {r.summary.insuficiente} con evidencia insuficiente. Con contacto oficial verificable: <b>{r.summary.withVerifiedContact}</b>.{r.summary.iaVerificadas + r.summary.iaSinVerificar > 0 && <> De las sugeridas por IA, {r.summary.iaVerificadas} con web verificada y {r.summary.iaSinVerificar} pistas sin verificar.</>}</p>
        <ul className="list-disc pl-5 text-xs text-slate-600">{r.info.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        {!r.noData && <a className="inline-block text-xs underline" href={`/api/buyers/export?${exportQs}`}>Exportar a CSV (guarda este resultado en tu equipo)</a>}
      </section>
      {r.noData ? (
        <section className="rounded-lg bg-white p-4 text-sm shadow-sm"><p className="font-medium">No hay datos suficientes para esta combinación.</p><p className="text-slate-600">Eso no significa que no existan compradores. Prueba con otro producto o país, añade palabras clave en inglés o consulta las fuentes oficiales de la <Link className="underline" href="/guia">guía</Link>.</p></section>
      ) : list.length === 0 ? (
        <section className="rounded-lg bg-white p-4 text-sm shadow-sm">Ninguna empresa cumple los filtros elegidos.</section>
      ) : (
        <ul className="grid gap-3">{list.map((c) => <BuyerCard key={c.id} c={c} />)}</ul>
      )}
    </div>
  );
}
