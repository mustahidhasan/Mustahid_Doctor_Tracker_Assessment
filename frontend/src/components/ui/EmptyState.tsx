export function EmptyState({ title, message, action }: { title: string; message: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div aria-hidden="true" className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-teal-50 text-xl text-teal-700">✚</div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{message}</p>
      {action && <button type="button" onClick={action.onClick} className="mt-5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-200">{action.label}</button>}
    </div>
  );
}

export function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-red-700" role="alert">{message}</p>
      <button type="button" onClick={onRetry}
        className="mt-5 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300">Retry</button>
    </div>
  );
}
