import { type ButtonHTMLAttributes, forwardRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "danger-outline" | "ghost" | "dark";
export type ButtonSize = "sm" | "md";

const base = "inline-flex items-center justify-center gap-2 rounded-xl font-medium transition focus:outline-none focus-visible:ring-4 disabled:cursor-not-allowed disabled:opacity-60";
const variants: Record<ButtonVariant, string> = {
  primary: "bg-teal-700 text-white shadow-sm hover:bg-teal-800 focus-visible:ring-teal-200 font-semibold",
  secondary: "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-200",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:ring-red-200 font-semibold",
  "danger-outline": "border border-red-200 bg-white text-red-700 hover:bg-red-50 focus-visible:ring-red-100",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-200",
  dark: "bg-slate-900 text-white hover:bg-slate-800 focus-visible:ring-slate-300",
};
// Both sizes keep a minimum 36px / 44px hit area (WCAG 2.2 target size).
const sizes: Record<ButtonSize, string> = { sm: "min-h-9 px-3 py-1.5 text-sm", md: "min-h-11 px-4 py-2.5" };

export function buttonClasses({ variant = "secondary", size = "md", className = "" }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`.trim();
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows a spinner, disables the button, and swaps in `loadingText` when provided. */
  loading?: boolean;
  loadingText?: string;
}

/** Shared button: consistent variants, focus rings, disabled and loading states. Defaults to type="button". */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "md", loading = false, loadingText, className = "", type = "button", disabled, children, ...props }, ref,
) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={buttonClasses({ variant, size, className })} {...props}>
      {loading && <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />}
      {loading && loadingText ? loadingText : children}
    </button>
  );
});
