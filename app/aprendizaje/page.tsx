import { permanentRedirect } from "next/navigation";

/** Desde el 09/11/2026 la portada del Modo Aprendizaje es `/`; esta URL se conserva para los enlaces antiguos. */
export default function LearningIndex() {
  permanentRedirect("/");
}
