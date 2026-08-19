import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Bot,
  Database,
  Gauge,
  LayoutGrid,
  Map as MapIcon,
  Moon,
  ServerCog,
  ShieldAlert,
  SlidersHorizontal,
  Sun,
  Timer,
  Wind,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { OpsLink, useOpsBase } from "@/components/ops/ops-nav";
import { useAuth } from "@/lib/hooks/use-auth";
import { auth } from "@/lib/auth/session";
import { useQueryClient } from "@tanstack/react-query";

const NAV = [
  { to: "/", label: "Operations Overview", icon: LayoutGrid },
  { to: "/map", label: "Live Map", icon: MapIcon },
  { to: "/events", label: "Weather Events", icon: Wind },
  { to: "/risk", label: "Asset Risk", icon: Gauge },
  { to: "/timeline", label: "Forecast Timeline", icon: Timer },
  { to: "/posture", label: "Response Posture", icon: ShieldAlert },
  { to: "/thresholds", label: "Thresholds", icon: SlidersHorizontal },
  { to: "/alerts", label: "Alerts", icon: AlertTriangle },
  { to: "/copilot", label: "Operations Assistant", icon: Bot },
  { to: "/assets", label: "Asset Management", icon: Database },
  { to: "/deployment", label: "Deployment", icon: ServerCog },
] as const;

function useTheme() {
  const [dark, setDark] = useState(true);
  useEffect(() => {
    const stored = localStorage.getItem("ops-theme");
    const isDark = stored ? stored === "dark" : true;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);
  const toggle = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("ops-theme", next ? "dark" : "light");
      return next;
    });
  };
  return { dark, toggle };
}

export function AppShell({
  children,
  fullHeight = false,
}: {
  children: ReactNode;
  /** Command-center pages fill the viewport and scroll inside their own panes. */
  fullHeight?: boolean;
}) {
  const { dark, toggle } = useTheme();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const base = useOpsBase();
  const isDemo = base === "/demo";
  const auth = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const href = (to: string) => (to === "/" ? base : `${base}${to}`);

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div
      className={cn(
        "flex bg-background text-foreground",
        // Fixed-viewport command center only above xl; below that the page
        // scrolls so dense panes aren't crushed on laptops and tablets.
        fullHeight ? "min-h-screen xl:h-screen xl:overflow-hidden" : "min-h-screen",
      )}
    >
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="flex h-14 items-center gap-2.5 border-b px-4">
          <div className="grid size-7 place-items-center rounded-sm bg-primary text-primary-foreground">
            <Wind className="size-4" />
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-semibold tracking-tight">Asset Weather Ops</div>
            <div className="text-[10px] text-muted-foreground">Energy operations</div>
          </div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto p-2">
          {NAV.map((item) => {
            const target = href(item.to);
            const active = item.to === "/" ? path === target || path === `${target}/` : path.startsWith(target);
            return (
              <OpsLink
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-sm px-2.5 py-2 text-[13px] transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )}
              >
                <item.icon className="size-4 shrink-0" />
                {item.label}
              </OpsLink>
            );
          })}
        </nav>
        <div className="border-t p-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className={cn("size-1.5 rounded-full", isDemo ? "bg-risk-elevated" : "bg-risk-monitor")} />
            {isDemo ? "Synthetic sample dataset" : "Tenant dataset"}
          </div>
          <div className="mt-1">Forecast refreshed 4 min ago</div>
          <Link to="/" className="mt-2 inline-block text-[11px] text-primary hover:underline">
            ← Back to site
          </Link>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo ? (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-risk-elevated/40 bg-risk-elevated/10 px-4 py-1.5 text-[11px] text-risk-elevated">
            <span className="font-semibold tracking-wide uppercase">Demo data</span>
            <span className="text-muted-foreground">
              Synthetic sample estate and a fictional storm. Not an operational forecast — do not use for decisions.
            </span>
            <Link to="/auth" className="ml-auto font-medium text-primary hover:underline">
              Sign in with Microsoft to use tenant data →
            </Link>
          </div>
        ) : null}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-surface/95 px-4 backdrop-blur">
          <div className="lg:hidden">
            <select
              className="rounded-sm border bg-card px-2 py-1.5 text-xs"
              value={path}
              onChange={(e) => (window.location.href = e.target.value)}
            >
              {NAV.map((n) => (
                <option key={n.to} value={href(n.to)}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
          <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
            <span className="rounded-sm border border-risk-critical/40 bg-risk-critical/10 px-2 py-1 font-medium tracking-wide text-risk-critical uppercase">
              Active event
            </span>
            <span className="text-foreground">Hurricane Gabrielle</span>
            <span>·</span>
            <span>Incident posture: Level 2</span>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={toggle}
              className="rounded-sm border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label="Toggle theme"
            >
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </button>
            {auth.user ? (
              <div className="flex items-center gap-2 border-l pl-3">
                <div className="grid size-7 place-items-center rounded-full bg-secondary text-[11px] font-medium">
                  {auth.initials}
                </div>
                <div className="hidden text-[11px] leading-tight sm:block">
                  <div className="max-w-[160px] truncate font-medium">{auth.displayName}</div>
                  <div className="text-muted-foreground">
                    {auth.provider === "azure" ? "Microsoft Entra ID" : "Email sign-in"}
                  </div>
                </div>
                <button
                  onClick={() => void signOut()}
                  className="ml-1 rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  Sign out
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 border-l pl-3">
                <Link
                  to="/auth"
                  className="rounded-sm bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Sign in
                </Link>
              </div>
            )}
          </div>
        </header>
        <main className={cn("min-w-0 flex-1", fullHeight && "xl:min-h-0 xl:overflow-hidden")}>{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 border-b bg-surface px-5 py-4">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
        <p className="mt-0.5 max-w-3xl text-xs text-muted-foreground">{description}</p>
      </div>
      {actions}
    </div>
  );
}
