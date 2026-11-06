import Link from "next/link";
import { TRADE_MAP } from "@/lib/market-access";

export const metadata = { title: "Búsqueda de compradores (retirada) · SmarTrade" };

/**
 * La búsqueda de importadores y compradores se retiró de la interfaz el 06/11/2026: solo cubría vino en Japón (9
 * empresas curadas a mano, 7 con una única prueba genérica), anunciaba listas de IA que no existían y la búsqueda en
 * vivo no se había probado con clave real (segunda auditoría, 05/11/2026). La página se conserva para que los enlaces
 * antiguos no den error, pero NO consulta nada: ni datos curados, ni Tavily, ni páginas web. El código de lib/buyers se
 * conserva para una posible versión futura con cobertura y evidencia suficientes (docs/buyers.md).
 */
export default function BuyersRetired() {
  return (
    <section className="max-w-2xl space-y-3 rounded-lg bg-white p-6 text-sm shadow-sm" aria-labelledby="titulo-compradores">
      <h1 id="titulo-compradores" className="text-xl font-bold">Búsqueda de compradores: retirada</h1>
      <p>SmarTrade ya no ofrece listas de importadores ni de compradores. La versión anterior solo cubría un producto en un país y no tenía pruebas suficientes para presentar empresas como compradores.</p>
      <p>Las estadísticas de comercio exterior informan sobre países, no sobre empresas. Para buscar distribuidores o importadores puedes consultar fuentes especializadas, por ejemplo <a className="underline" href={TRADE_MAP.url} target="_blank" rel="noopener noreferrer">{TRADE_MAP.title}</a>, las oficinas económicas y comerciales de España en el exterior (ICEX) o las cámaras de comercio.</p>
      <p><Link className="underline" href="/">Volver al inicio</Link></p>
    </section>
  );
}
