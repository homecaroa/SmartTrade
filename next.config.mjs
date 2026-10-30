// allowedDevOrigins: permite `npm run dev` a través del dominio de reenvío de puertos de GitHub Codespaces.
// outputFileTracingIncludes: los datos guardados (data/snapshots) se leen con fs en tiempo de ejecución; sin esta línea
// Vercel no los copiaría a las funciones del servidor y la web volvería a consultar en vivo sin avisar.
export default {
  allowedDevOrigins: ["*.app.github.dev"],
  outputFileTracingIncludes: { "/**": ["./data/snapshots/**/*.json"] },
  // El Laboratorio de logística (publicado el 30/10/2026) se integró ese mismo día en las operaciones de exportación:
  // sus enlaces llevan a la portada del Modo Aprendizaje en lugar de dar 404.
  async redirects() {
    return [
      { source: "/aprendizaje/logistica", destination: "/aprendizaje", permanent: false },
      { source: "/aprendizaje/logistica/:caso", destination: "/aprendizaje", permanent: false },
    ];
  },
};
