import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4 py-12">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(13,148,136,0.28),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(14,116,144,0.2),transparent_40%)]" />
      <section className="relative grid w-full max-w-5xl overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[1.05fr_1fr]">
        <div className="hidden bg-teal-800 p-12 text-white lg:flex lg:flex-col lg:justify-between">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-xl bg-white/15 text-2xl">✚</span><span className="text-xl font-semibold">Doctor Tracker</span></div>
          <div><p className="mb-4 text-sm font-semibold uppercase tracking-[0.22em] text-teal-200">Healthcare administration</p><h1 className="text-4xl font-semibold leading-tight">Care operations, protected by design.</h1><p className="mt-5 max-w-md leading-7 text-teal-100">Securely manage your clinical network from one focused workspace.</p></div>
          <p className="text-sm text-teal-200">Authorized administrators only</p>
        </div>
        <div className="p-7 sm:p-12 lg:p-14">
          <div className="mb-9 lg:hidden"><span className="text-xl font-semibold text-teal-800">✚ Doctor Tracker</span></div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">Admin portal</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Welcome back</h2>
          <p className="mb-8 mt-3 text-slate-500">Sign in to continue to your secure dashboard.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}
