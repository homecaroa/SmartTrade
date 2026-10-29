/**
 * Orden de presentación de las opciones. Los escenarios se escriben con la opción correcta donde resulte cómodo (a menudo
 * la primera); mostrarlas así permitiría acertar eligiendo siempre la primera. Se ordenan por un hash del identificador
 * de la decisión y de cada opción: el orden parece aleatorio, pero es el mismo para todos los alumnos y en cada recarga.
 * No se usa Math.random: la simulación tiene que ser reproducible.
 */
export function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}

export function displayOrder<T extends { id: string }>(items: readonly T[], seed: string): T[] {
  return [...items].sort((a, b) => fnv1a(`${seed}:${a.id}`) - fnv1a(`${seed}:${b.id}`) || a.id.localeCompare(b.id));
}
