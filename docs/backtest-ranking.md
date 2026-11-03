# Validación histórica del ranking (backtest)

Generado el 2026-11-02 por `scripts/backtest-ranking.ts` con datos reales de Eurostat Comext (2017–2025, 50 códigos del catálogo, 26 mercados de la UE, 22304 observaciones). Método en `lib/backtest/ranking.ts`.

Pregunta: si en el año T se hubiera usado el ranking de SmarTrade (mismo algoritmo y pesos que la web), ¿los mercados mejor puntuados para un producto fueron los que más crecieron en los 3 años siguientes? Se compara con ordenar solo por tamaño o solo por crecimiento pasado.

Cómo leerlo: ρ es la correlación de rangos de Spearman (1 = el orden acierta del todo, 0 = ninguna relación, −1 = al revés). «Dentro del producto» = el orden de mercados que ve quien busca su producto; solo cuentan productos con al menos 6 mercados evaluables. «Tercio superior > inferior» = % de productos en que la mediana del resultado de los mercados del tercio superior del ranking superó a la del tercio inferior. Las parejas no son independientes: no hay p-valores y diferencias pequeñas no deben interpretarse.

## Ranking de 2019 (ventana 2017–2019) frente a 2019→2022

Oportunidades puntuadas: 1137; con resultado posterior: 1137.

**Crecimiento posterior del mercado (CAGR)**

| Ordenación | Productos | ρ media dentro del producto | ρ mediana | Productos con ρ > 0 | Tercio superior > inferior | ρ global |
|---|---|---|---|---|---|---|
| Puntuación de SmarTrade | 46 | -0,13 | -0,15 | 26 % | 30 % | -0,02 |
| Solo tamaño del mercado | 46 | -0,18 | -0,15 | 22 % | 24 % | -0,04 |
| Solo crecimiento pasado | 46 | 0,00 | 0,01 | 54 % | 54 % | 0,18 |
| Solo potencial de cuota española | 46 | -0,03 | -0,05 | 41 % | 43 % | -0,08 |

**Crecimiento posterior de las ventas españolas (CAGR)**

| Ordenación | Productos | ρ media dentro del producto | ρ mediana | Productos con ρ > 0 | Tercio superior > inferior | ρ global |
|---|---|---|---|---|---|---|
| Puntuación de SmarTrade | 45 | 0,06 | 0,09 | 67 % | 60 % | 0,10 |
| Solo tamaño del mercado | 45 | -0,10 | -0,10 | 33 % | 40 % | -0,00 |
| Solo crecimiento pasado | 45 | 0,06 | 0,11 | 60 % | 62 % | 0,19 |
| Solo potencial de cuota española | 45 | 0,21 | 0,19 | 82 % | 76 % | 0,13 |

**Aumento posterior de las ventas españolas (€)**

| Ordenación | Productos | ρ media dentro del producto | ρ mediana | Productos con ρ > 0 | Tercio superior > inferior | ρ global |
|---|---|---|---|---|---|---|
| Puntuación de SmarTrade | 45 | 0,21 | 0,22 | 76 % | 78 % | 0,27 |
| Solo tamaño del mercado | 45 | 0,35 | 0,35 | 91 % | 91 % | 0,30 |
| Solo crecimiento pasado | 45 | -0,01 | -0,03 | 47 % | 49 % | 0,08 |
| Solo potencial de cuota española | 45 | -0,12 | -0,16 | 27 % | 29 % | -0,03 |

## Ranking de 2020 (ventana 2018–2020) frente a 2020→2023

Oportunidades puntuadas: 1144; con resultado posterior: 1144.

**Crecimiento posterior del mercado (CAGR)**

| Ordenación | Productos | ρ media dentro del producto | ρ mediana | Productos con ρ > 0 | Tercio superior > inferior | ρ global |
|---|---|---|---|---|---|---|
| Puntuación de SmarTrade | 46 | -0,30 | -0,35 | 9 % | 13 % | -0,18 |
| Solo tamaño del mercado | 46 | -0,30 | -0,30 | 11 % | 11 % | -0,12 |
| Solo crecimiento pasado | 46 | -0,15 | -0,16 | 35 % | 28 % | -0,07 |
| Solo potencial de cuota española | 46 | -0,11 | -0,18 | 33 % | 39 % | -0,15 |

**Crecimiento posterior de las ventas españolas (CAGR)**

| Ordenación | Productos | ρ media dentro del producto | ρ mediana | Productos con ρ > 0 | Tercio superior > inferior | ρ global |
|---|---|---|---|---|---|---|
| Puntuación de SmarTrade | 46 | -0,03 | -0,03 | 43 % | 43 % | 0,05 |
| Solo tamaño del mercado | 46 | -0,16 | -0,13 | 17 % | 26 % | 0,03 |
| Solo crecimiento pasado | 46 | -0,01 | 0,02 | 52 % | 50 % | -0,01 |
| Solo potencial de cuota española | 46 | 0,17 | 0,16 | 83 % | 80 % | 0,14 |

**Aumento posterior de las ventas españolas (€)**

| Ordenación | Productos | ρ media dentro del producto | ρ mediana | Productos con ρ > 0 | Tercio superior > inferior | ρ global |
|---|---|---|---|---|---|---|
| Puntuación de SmarTrade | 46 | 0,15 | 0,12 | 76 % | 78 % | 0,28 |
| Solo tamaño del mercado | 46 | 0,40 | 0,46 | 87 % | 87 % | 0,41 |
| Solo crecimiento pasado | 46 | -0,03 | -0,05 | 37 % | 54 % | -0,02 |
| Solo potencial de cuota española | 46 | -0,22 | -0,23 | 15 % | 15 % | -0,09 |

## Ranking de 2021 (ventana 2019–2021) frente a 2021→2024

Oportunidades puntuadas: 1151; con resultado posterior: 1151.

**Crecimiento posterior del mercado (CAGR)**

| Ordenación | Productos | ρ media dentro del producto | ρ mediana | Productos con ρ > 0 | Tercio superior > inferior | ρ global |
|---|---|---|---|---|---|---|
| Puntuación de SmarTrade | 46 | -0,28 | -0,30 | 7 % | 9 % | -0,19 |
| Solo tamaño del mercado | 46 | -0,30 | -0,30 | 7 % | 4 % | -0,17 |
| Solo crecimiento pasado | 46 | -0,11 | -0,14 | 28 % | 37 % | -0,13 |
| Solo potencial de cuota española | 46 | -0,05 | -0,10 | 39 % | 41 % | -0,05 |

**Crecimiento posterior de las ventas españolas (CAGR)**

| Ordenación | Productos | ρ media dentro del producto | ρ mediana | Productos con ρ > 0 | Tercio superior > inferior | ρ global |
|---|---|---|---|---|---|---|
| Puntuación de SmarTrade | 46 | -0,02 | -0,04 | 46 % | 46 % | -0,01 |
| Solo tamaño del mercado | 46 | -0,10 | -0,13 | 33 % | 35 % | -0,04 |
| Solo crecimiento pasado | 46 | -0,01 | 0,02 | 54 % | 37 % | -0,07 |
| Solo potencial de cuota española | 46 | 0,18 | 0,22 | 80 % | 67 % | 0,16 |

**Aumento posterior de las ventas españolas (€)**

| Ordenación | Productos | ρ media dentro del producto | ρ mediana | Productos con ρ > 0 | Tercio superior > inferior | ρ global |
|---|---|---|---|---|---|---|
| Puntuación de SmarTrade | 46 | 0,08 | 0,12 | 67 % | 67 % | 0,16 |
| Solo tamaño del mercado | 46 | 0,35 | 0,40 | 85 % | 87 % | 0,29 |
| Solo crecimiento pasado | 46 | -0,06 | -0,07 | 35 % | 46 % | -0,11 |
| Solo potencial de cuota española | 46 | -0,18 | -0,21 | 24 % | 22 % | -0,08 |
