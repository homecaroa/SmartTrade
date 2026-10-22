export function ErrorState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-6">
      <p className="font-semibold text-red-900">No se pudieron obtener los datos</p>
      <p className="mt-1 text-sm text-red-800">{message}</p>
      {hint && <p className="mt-2 text-xs text-red-700">{hint}</p>}
    </div>
  );
}
