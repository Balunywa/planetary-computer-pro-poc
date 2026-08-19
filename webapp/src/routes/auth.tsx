import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Wind } from "lucide-react";

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
    <div className="flex min-h-screen items-center justify-center bg-surface px-4 py-10 text-foreground">
      <div className="w-full max-w-[440px]">
        <div className="rounded-lg border bg-card p-8 shadow-sm sm:p-10">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-sm bg-primary text-primary-foreground">
              <Wind className="size-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">Asset Weather Ops</span>
          </Link>

          <h1 className="mt-8 text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use your work or school account to continue.
          </p>

          <button
            onClick={() => void signInWithEntra()}
            disabled={busy || !configured}
            className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-sm border bg-card px-4 py-2.5 text-sm font-medium transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
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
            Sign in with Microsoft
          </button>

          {error ? <p className="mt-4 text-sm text-risk-critical">{error}</p> : null}
          {!configured ? (
            <p className="mt-4 rounded-sm border border-dashed px-3 py-2 text-xs text-muted-foreground">
              Sign-in isn't configured for this environment yet. Set{" "}
              <code className="font-mono">ENTRA_CLIENT_ID</code> and{" "}
              <code className="font-mono">ENTRA_TENANT_ID</code> for this deployment.
            </p>
          ) : null}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Protected by Microsoft Entra ID · MFA and conditional access enforced by your directory.
        </p>
      </div>
    </div>
  );
}
