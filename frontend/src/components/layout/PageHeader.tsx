import Link from "next/link";
import type { ReactNode } from "react";

export interface Crumb { label: string; href?: string; }

/** Breadcrumb trail; the last item is the current page. */
export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-slate-500">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 && <span aria-hidden="true" className="text-slate-300">/</span>}
            {item.href && index < items.length - 1
              ? <Link href={item.href} className="inline-flex min-h-6 items-center rounded font-medium text-teal-700 hover:text-teal-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">{item.label}</Link>
              : <span aria-current="page" className="truncate text-slate-600">{item.label}</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Consistent page heading block: eyebrow, h1, description, and a right-aligned action. */
export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-700">{eyebrow}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-slate-600">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}
