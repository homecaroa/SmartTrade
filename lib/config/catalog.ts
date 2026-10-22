/** Catálogo de mercados. Códigos numéricos (m49) usados por UN Comtrade: NO VERIFICADOS, ver docs/data-sources.md. */
export interface Market {
  code: string; // ISO2
  iso3: string;
  m49: number;
  name: string;
  eu: boolean;
}

export const ORIGIN = { code: "ES", iso3: "ESP", m49: 724, name: "España" } as const;

export const MARKETS: Market[] = [
  { code: "AT", iso3: "AUT", m49: 40, name: "Austria", eu: true },
  { code: "BE", iso3: "BEL", m49: 56, name: "Bélgica", eu: true },
  { code: "BG", iso3: "BGR", m49: 100, name: "Bulgaria", eu: true },
  { code: "HR", iso3: "HRV", m49: 191, name: "Croacia", eu: true },
  { code: "CY", iso3: "CYP", m49: 196, name: "Chipre", eu: true },
  { code: "CZ", iso3: "CZE", m49: 203, name: "Chequia", eu: true },
  { code: "DK", iso3: "DNK", m49: 208, name: "Dinamarca", eu: true },
  { code: "EE", iso3: "EST", m49: 233, name: "Estonia", eu: true },
  { code: "FI", iso3: "FIN", m49: 246, name: "Finlandia", eu: true },
  { code: "FR", iso3: "FRA", m49: 251, name: "Francia", eu: true },
  { code: "DE", iso3: "DEU", m49: 276, name: "Alemania", eu: true },
  { code: "GR", iso3: "GRC", m49: 300, name: "Grecia", eu: true },
  { code: "HU", iso3: "HUN", m49: 348, name: "Hungría", eu: true },
  { code: "IE", iso3: "IRL", m49: 372, name: "Irlanda", eu: true },
  { code: "IT", iso3: "ITA", m49: 381, name: "Italia", eu: true },
  { code: "LV", iso3: "LVA", m49: 428, name: "Letonia", eu: true },
  { code: "LT", iso3: "LTU", m49: 440, name: "Lituania", eu: true },
  { code: "LU", iso3: "LUX", m49: 442, name: "Luxemburgo", eu: true },
  { code: "MT", iso3: "MLT", m49: 470, name: "Malta", eu: true },
  { code: "NL", iso3: "NLD", m49: 528, name: "Países Bajos", eu: true },
  { code: "PL", iso3: "POL", m49: 616, name: "Polonia", eu: true },
  { code: "PT", iso3: "PRT", m49: 620, name: "Portugal", eu: true },
  { code: "RO", iso3: "ROU", m49: 642, name: "Rumanía", eu: true },
  { code: "SK", iso3: "SVK", m49: 703, name: "Eslovaquia", eu: true },
  { code: "SI", iso3: "SVN", m49: 705, name: "Eslovenia", eu: true },
  { code: "SE", iso3: "SWE", m49: 752, name: "Suecia", eu: true },
  { code: "GB", iso3: "GBR", m49: 826, name: "Reino Unido", eu: false },
  { code: "US", iso3: "USA", m49: 842, name: "Estados Unidos", eu: false },
  { code: "CH", iso3: "CHE", m49: 757, name: "Suiza", eu: false },
  { code: "NO", iso3: "NOR", m49: 579, name: "Noruega", eu: false },
  { code: "MA", iso3: "MAR", m49: 504, name: "Marruecos", eu: false },
  { code: "MX", iso3: "MEX", m49: 484, name: "México", eu: false },
  { code: "BR", iso3: "BRA", m49: 76, name: "Brasil", eu: false },
  { code: "CN", iso3: "CHN", m49: 156, name: "China", eu: false },
  { code: "JP", iso3: "JPN", m49: 392, name: "Japón", eu: false },
  { code: "KR", iso3: "KOR", m49: 410, name: "Corea del Sur", eu: false },
  { code: "SA", iso3: "SAU", m49: 682, name: "Arabia Saudí", eu: false },
  { code: "AE", iso3: "ARE", m49: 784, name: "Emiratos Árabes Unidos", eu: false },
  { code: "TR", iso3: "TUR", m49: 792, name: "Turquía", eu: false },
  { code: "IN", iso3: "IND", m49: 699, name: "India", eu: false },
  { code: "CA", iso3: "CAN", m49: 124, name: "Canadá", eu: false },
  { code: "AU", iso3: "AUS", m49: 36, name: "Australia", eu: false },
];

export const DEMO_MARKET_CODES = ["DE", "FR", "IT", "PT", "NL", "PL", "GB", "US", "MX", "MA", "JP"];

export function marketName(code: string): string {
  return MARKETS.find((m) => m.code === code)?.name ?? code;
}
