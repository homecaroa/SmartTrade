import type { DataMode } from "@/lib/schemas/trade";
import { comextSource } from "./comext";
import { comtradeSource } from "./comtrade";
import { demoSource } from "./demo";
import type { TradeSource } from "./types";

export function getSource(mode: DataMode): TradeSource {
  return mode === "comext" ? comextSource : mode === "comtrade" ? comtradeSource : demoSource;
}
