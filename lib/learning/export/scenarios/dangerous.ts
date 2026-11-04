import { round2 } from "../../money";
import { computeOperation } from "../costs";
import type { Decision, DecisionCtx } from "../types";
import { opt, sellerCarries } from "./shared";

/**
 * Decisiones comunes a los casos con mercancía peligrosa (propuesta 4, 04/11/2026). Importes simulados.
 * Reserva: navieras, consolidadores y aerolíneas aceptan la mercancía peligrosa caso a caso y antes de que llegue a la
 * terminal; ocultarla es una infracción grave. Solo se pregunta si el transporte lo contrata el vendedor.
 */
const revenueOf = (ctx: DecisionCtx) => computeOperation(ctx.scenario, ctx.settings).revenue;

export const dangerousBookingDecision: Decision = {
  id: "reserva_peligrosa", stage: "logistica", kind: "single", title: "Reserva como mercancía peligrosa",
  appliesIf: sellerCarries,
  prompt: "Vas a reservar el transporte. ¿Cómo lo haces?",
  concept: "Navieras, consolidadores y aerolíneas aceptan la mercancía peligrosa caso a caso: piden número ONU, clase, grupo de embalaje, cantidades y la ficha de datos de seguridad, y aprueban la reserva antes de que la carga llegue a la terminal.",
  options: [
    opt("solicitud", "Pedir la reserva como mercancía peligrosa con número ONU, clase, grupo de embalaje, cantidades y la ficha de datos de seguridad, y esperar la aprobación", "correcta", "Correcto: la aceptación previa evita que la carga se quede en tierra."),
    opt("transitario", "Pedir al transitario que lo gestione, sin pasarle la ficha de datos de seguridad", "razonable", "Delegar está bien, pero sin la ficha no puede declarar la mercancía: te la pedirá y perderás días.",
      () => ({ concept: "incidencia", label: "Salida perdida por falta de datos de la mercancía peligrosa", amount: 250, payer: "vendedor", note: "Almacenaje y nueva reserva (simulados)." })),
    opt("general", "Reservar como carga general y explicarlo al entregar la mercancía", "grave", "Ocultar mercancía peligrosa es una infracción grave: la terminal rechaza la carga y puede haber sanciones. Además, pone en riesgo el buque y a las personas.",
      (ctx) => ({ concept: "incidencia", label: "Rechazo en terminal y nueva reserva como peligrosa", amount: round2(900 + 0.01 * revenueOf(ctx)), payer: "vendedor", note: "Gastos de rechazo, nueva reserva y descuento por el retraso (simulados)." })),
  ],
  best: "solicitud", whyBest: "La mercancía peligrosa se declara y se acepta antes de embarcar.",
};
