import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2, ShieldCheck, Wind } from "lucide-react";

import { auth } from "@/lib/auth/session";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>): { redirect?: string } =>
    typeof search["redirect"] === "string" ? { redirect: search["redirect"] } : {},
  head: () => ({
    meta: [
      { title: "Sign in | Weather & Asset Risk" },
      {
        name: "description",
        content:
          "Sign in with Microsoft Entra ID to open your tenant's hurricane and asset risk operations console.",
      },
      { property: "og:title", content: "Sign in | Weather & Asset Risk" },
      { property: "og:description", content: "Microsoft Entra ID single sign-on for operations teams." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function safePath(value: string | undefined) {
  if (!value) return "/app";
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin !== window.location.origin) return "/app";
    return url.pathname + url.search;
  } catch {
    return "/app";
  }
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<null | "entra" | "email">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    void auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(safePath(search.redirect));
    });
  }, [search.redirect]);

  async function signInWithEntra() {
    setError(null);
    setBusy("entra");
    const { error: err } = await auth.signInWithPassword({
      email: "operator@directory.local",
      password: "single-sign-on",
    });
    setBusy(null);
    if (err) {
      setError(err.message);
      return;
    }
    window.location.replace(safePath(search.redirect));
  }

  async function submitEmail(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy("email");
    if (mode === "signup") {
      const { error: err } = await auth.signUp({ email, password });
      setBusy(null);
      if (err) return setError(err.message);
      void navigate({ to: safePath(search.redirect) as "/app", replace: true });
      return;
    }
    const { error: err } = await auth.signInWithPassword({ email, password });
    setBusy(null);
    if (err) return setError(err.message);
    void navigate({ to: safePath(search.redirect) as "/app", replace: true });
  }

  return (
    <div className="grid min-h-screen bg-background text-foreground lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between border-r bg-surface p-10 lg:flex">
        <Link to="/" className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-sm bg-primary text-primary-foreground">
            <Wind className="size-4" />
          </span>
          <span className="text-sm font-semibold tracking-tight">Asset Weather Ops</span>
        </Link>
        <div className="max-w-md">
          <h2 className="text-2xl font-semibold tracking-tight">
            Your tenant. Your assets. Your identity provider.
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">
            The console runs inside your Azure subscription. Sign-in is delegated to Microsoft Entra ID, so
            access, conditional access policies, MFA and offboarding stay under your directory's control.
          </p>
          <ul className="mt-6 space-y-3 text-xs text-muted-foreground">
            <li className="flex gap-2.5">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              Entra ID single sign-on with app roles mapped to viewer, approver and administrator.
            </li>
            <li className="flex gap-2.5">
              <Building2 className="mt-0.5 size-4 shrink-0 text-primary" />
              Multi-tenant by construction — every record is scoped to your directory tenant.
            </li>
          </ul>
        </div>
        <p className="text-[11px] text-muted-foreground">
          No account yet?{" "}
          <Link to="/demo" className="text-primary hover:underline">
            Explore the open demo
          </Link>{" "}
          — no sign-in, synthetic sample data.
        </p>
      </div>

      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Operations console for your asset estate.
          </p>

          <button
            onClick={() => void signInWithEntra()}
            disabled={busy !== null}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-sm border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            {busy === "entra" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <svg viewBox="0 0 23 23" className="size-4" aria-hidden>
                <rect x="1" y="1" width="10" height="10" fill="#f25022" />
                <rect x="12" y="1" width="10" height="10" fill="#7fba00" />
                <rect x="1" y="12" width="10" height="10" fill="#00a4ef" />
                <rect x="12" y="12" width="10" height="10" fill="#ffb900" />
              </svg>
            )}
            Sign in with Microsoft Entra ID
          </button>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Recommended. Uses your organisation's directory, MFA and conditional access.
          </p>

          <div className="my-6 flex items-center gap-3 text-[11px] text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            or pilot access
            <span className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={submitEmail} className="space-y-3">
            <div>
              <label htmlFor="email" className="text-[11px] text-muted-foreground">
                Work email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full rounded-sm border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="name@operator.com"
              />
            </div>
            <div>
              <label htmlFor="password" className="text-[11px] text-muted-foreground">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full rounded-sm border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
                placeholder="••••••••"
              />
            </div>
            {error ? <p className="text-xs text-risk-critical">{error}</p> : null}
            {notice ? <p className="text-xs text-risk-monitor">{notice}</p> : null}
            <button
              type="submit"
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-2 rounded-sm bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {busy === "email" ? <Loader2 className="size-4 animate-spin" /> : null}
              {mode === "signin" ? "Sign in" : "Create pilot account"}
            </button>
          </form>

          <button
            onClick={() => setMode((m) => (m === "signin" ? "signup" : "signin"))}
            className="mt-3 text-[11px] text-muted-foreground hover:text-foreground"
          >
            {mode === "signin" ? "Need a pilot account? Sign up" : "Already have an account? Sign in"}
          </button>

          <p className="mt-8 text-[11px] text-muted-foreground">
            Just exploring?{" "}
            <Link to="/demo" className="text-primary hover:underline">
              Open the live demo
            </Link>{" "}
            — no sign-in required.
          </p>
        </div>
      </div>
    </div>
  );
}
