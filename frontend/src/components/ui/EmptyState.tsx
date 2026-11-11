import { Button } from "./Button";

export function EmptyState({ title, message, action }: { title: string; message: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center">
      <div aria-hidden="true" className="mx-auto mb-4 grid h-12 w-12 place-items-center rounded-full bg-teal-50 text-xl text-teal-700">✚</div>
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{message}</p>
      {action && <Button size="sm" onClick={action.onClick} className="mt-5">{action.label}</Button>}
    </div>
  );
}

export function LoadError({ title, message, onRetry }: { title: string; message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <p className="mt-2 text-sm text-red-700" role="alert">{message}</p>
      <Button size="sm" variant="dark" onClick={onRetry} className="mt-5">Retry</Button>
    </div>
  );
}
