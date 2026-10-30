// allowedDevOrigins: permite `npm run dev` a través del dominio de reenvío de puertos de GitHub Codespaces.
// outputFileTracingIncludes: los datos guardados (data/snapshots) se leen con fs en tiempo de ejecución; sin esta línea
// Vercel no los copiaría a las funciones del servidor y la web volvería a consultar en vivo sin avisar.
export default {
  allowedDevOrigins: ["*.app.github.dev"],
  outputFileTracingIncludes: { "/**": ["./data/snapshots/**/*.json"] },
};
