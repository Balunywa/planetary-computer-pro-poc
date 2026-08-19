import { createFileRoute, Link } from "@tanstack/react-router";
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
  const search = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const configured = auth.isConfigured();

  useEffect(() => {
    void auth.getSession().then(({ data }) => {
      if (data.session) window.location.replace(safePath(search.redirect));
    });
  }, [search.redirect]);

  async function signInWithEntra() {
    setError(null);
    setBusy(true);
    // Remember where to land once the identity platform redirects back.
    sessionStorage.setItem("post-auth-path", safePath(search.redirect));
    const { error: err } = await auth.signInWithEntra();
    if (err) {
      setBusy(false);
      setError(err.message);
    }
    // On success the browser navigates to Entra; nothing else runs here.
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
            disabled={busy || !configured}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-sm border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-60"
          >
            {busy ? (
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
            Uses your organisation's directory, MFA and conditional access.
          </p>

          {error ? <p className="mt-3 text-xs text-risk-critical">{error}</p> : null}
          {!configured ? (
            <p className="mt-3 rounded-sm border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
              Sign-in isn't configured for this environment yet. Set{" "}
              <code className="font-mono">ENTRA_CLIENT_ID</code> and{" "}
              <code className="font-mono">ENTRA_TENANT_ID</code>, or explore the{" "}
              <Link to="/demo" className="text-primary hover:underline">
                open demo
              </Link>{" "}
              — no sign-in required.
            </p>
          ) : null}

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
