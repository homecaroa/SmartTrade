import { LearningHome } from "@/components/learning/learning-home";

export const metadata = { title: "SmarTrade · Simulador de comercio internacional" };

/**
 * Portada: el Modo Aprendizaje (desde el 09/11/2026). Las URLs antiguas del análisis (`/?q=…`) las redirige
 * next.config.mjs a /mercados solo si llevan parámetros del análisis; otros (p. ej. `utm_source`) se quedan aquí.
 */
export default function Home() {
  return <LearningHome />;
}
