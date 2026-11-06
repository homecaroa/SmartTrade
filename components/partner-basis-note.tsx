/**
 * Qué significa «España» en los datos. Eurostat asigna las importaciones dentro de la UE al Estado miembro de
 * EXPEDICIÓN, no necesariamente al de origen (metadatos ESMS de Eurostat); UN Comtrade usa el país de origen.
 * Se muestra junto a cada dato de presencia española, no solo al pie de una tabla.
 */
export function PartnerBasisNote({ basis }: { basis: "expedicion" | "origen" }) {
  if (basis === "origen") return <p className="text-xs text-slate-600">En esta fuente el país socio es el país de <b>origen</b> de la mercancía.</p>;
  return (
    <p className="rounded border border-sky-300 bg-sky-50 p-2 text-xs text-sky-950">
      <b>España = país de expedición.</b> En el comercio dentro de la UE, Eurostat atribuye cada importación al Estado miembro desde el que se <b>expide</b>, no necesariamente al de origen. Un producto español que llega a través de otro país (por ejemplo, envasado o redistribuido en Italia o Países Bajos) cuenta como de ese país, y al revés. La participación de España mide expediciones, no producto de origen español.
    </p>
  );
}
