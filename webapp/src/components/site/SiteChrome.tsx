import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Wind } from "lucide-react";

const LINKS = [
  { to: "/solution", label: "Solution" },
  { to: "/architecture", label: "Architecture" },
  { to: "/security", label: "Security" },
] as const;

export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-8 place-items-center rounded-sm bg-primary text-primary-foreground">
              <Wind className="size-4" />
            </span>
            <span className="text-sm leading-tight font-semibold tracking-tight">
              Asset Weather Ops
              <span className="block text-[10px] font-normal text-muted-foreground">
                Weather &amp; asset risk intelligence
              </span>
            </span>
          </Link>
          <nav className="ml-4 hidden items-center gap-5 text-[13px] text-muted-foreground md:flex">
            {LINKS.map((l) => (
              <Link key={l.to} to={l.to} className="transition-colors hover:text-foreground" activeProps={{ className: "text-foreground" }}>
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <Link
              to="/auth"
              className="hidden rounded-sm border px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
            >
              Sign in
            </Link>
            <Link
              to="/demo"
              className="rounded-sm bg-primary px-3.5 py-1.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
            >
              Launch demo
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t bg-surface">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-[11px] text-muted-foreground">
          <span>Weather & Asset Risk Intelligence, an Azure industry accelerator.</span>
          <div className="ml-auto flex flex-wrap gap-x-5 gap-y-2">
            <Link to="/solution" className="hover:text-foreground">Solution</Link>
            <Link to="/architecture" className="hover:text-foreground">Architecture</Link>
            <Link to="/security" className="hover:text-foreground">Security</Link>
            <Link to="/demo" className="hover:text-foreground">Demo</Link>
            <Link to="/auth" className="hover:text-foreground">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

export function SiteHero({
  eyebrow,
  title,
  lede,
  children,
}: {
  eyebrow: string;
  title: string;
  lede: string;
  children?: ReactNode;
}) {
  return (
    <section className="border-b bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-16">
        <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">{eyebrow}</p>
        <h1 className="mt-4 max-w-3xl text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-sm text-muted-foreground sm:text-base">{lede}</p>
        {children}
      </div>
    </section>
  );
}

export function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
        {description ? <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

export function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-sm border bg-card p-5">
      <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{children}</p>
    </div>
  );
}
