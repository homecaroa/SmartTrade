/** Estado de error de una página: su título es el h1 (siempre es el contenido principal donde se usa). */
export function ErrorState({ message, hint, title = "No se pudieron obtener los datos" }: { message: string; hint?: string; title?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-6">
      <h1 className="font-semibold text-red-900">{title}</h1>
      <p className="mt-1 text-sm text-red-800">{message}</p>
      {hint && <p className="mt-2 text-xs text-red-700">{hint}</p>}
    </div>
  );
}
