// allowedDevOrigins: permite `npm run dev` a través del dominio de reenvío de puertos de GitHub Codespaces.
// outputFileTracingIncludes: los datos guardados (data/snapshots) se leen con fs en tiempo de ejecución; sin esta línea
// Vercel no los copiaría a las funciones del servidor y la web volvería a consultar en vivo sin avisar.
// Claves de querySchema (lib/schemas/query.ts); tests/errors-and-pages.test.ts comprueba que coinciden.
export const ANALYSIS_PARAMS = ["q", "market", "year", "minSize", "minGrowth", "fuente", "sort", "producto", "order", "page", "pageSize"];

export default {
  allowedDevOrigins: ["*.app.github.dev"],
  outputFileTracingIncludes: { "/**": ["./data/snapshots/**/*.json"] },
  // El Laboratorio de logística (publicado el 30/10/2026) se integró ese mismo día en las operaciones de exportación:
  // sus enlaces llevan a la portada del Modo Aprendizaje en lugar de dar 404.
  //
  // Portada (09/11/2026): `/` es el Modo Aprendizaje y el análisis está en `/mercados`. Las URLs antiguas de búsqueda
  // (`/?q=…`, con cualquiera de los parámetros de lib/schemas/query.ts) se redirigen aquí, con la consulta intacta, y no
  // solo desde la página: con el loading.tsx global que había entonces la redirección viajaba en el streaming con un 200 y
  // necesita JavaScript. `/aprendizaje` era la portada del modo hasta ese día.
  async redirects() {
    const legacy = ANALYSIS_PARAMS.map((key) => ({ source: "/", has: [{ type: "query", key }], destination: "/mercados", permanent: true }));
    return [
      ...legacy,
      { source: "/aprendizaje", destination: "/", permanent: true },
      { source: "/aprendizaje/logistica", destination: "/", permanent: false },
      { source: "/aprendizaje/logistica/:caso", destination: "/", permanent: false },
    ];
  },
};
