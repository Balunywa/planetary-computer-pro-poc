import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Gauge, Layers, ShieldCheck } from "lucide-react";

import { Card, Section, SiteChrome } from "@/components/site/SiteChrome";

const TITLE = "Weather & Asset Risk Intelligence | Azure Accelerator";
const DESC =
  "Join tropical forecasts to your offshore estate with explainable asset risk scoring, T-gate response posture and forecast uncertainty, deployable into your own Azure tenant.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: LandingPage,
});

const STATS = [
  ["186", "assets in the demo estate"],
  ["120 h", "forecast scrubbing window"],
  ["4", "scored risk factors per asset"],
  ["T-120 → T-24", "response gate board"],
];

function LandingPage() {
  return (
    <SiteChrome>
      <section className="border-b bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
            Oil &amp; gas industry accelerator on Microsoft Azure
          </p>
          <h1 className="mt-4 max-w-4xl text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
            Which assets the weather hits, how hard, and when.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-muted-foreground">
            Weather and asset impact intelligence for critical infrastructure. The accelerator joins severe weather forecasts
            to your platforms, wells, pipelines and terminals, and turns them into an explainable exposure
            score, a response posture board and an alert queue your storm calls can actually run on.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/demo"
              className="rounded-sm bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Launch demo, no sign-in
            </Link>
            <Link to="/auth" className="rounded-sm border px-5 py-2.5 text-sm hover:bg-accent">
              Request deployment
            </Link>
          </div>

          <dl className="mt-14 grid gap-6 border-t pt-8 sm:grid-cols-4">
            {STATS.map(([value, label]) => (
              <div key={label as string}>
                <dt className="text-2xl font-semibold tracking-tight tabular-nums">{value}</dt>
                <dd className="mt-1 text-[11px] text-muted-foreground">{label}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <Section
        title="Built for the storm call, not the weather app"
        description="Hazard services tell you where the storm goes. GIS tells you where your assets are. Neither tells you what to do at T-72."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-sm border bg-card p-5">
            <Gauge className="size-4 text-primary" />
            <h3 className="mt-3 text-sm font-semibold">Explainable scoring</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Proximity, wind exposure, precipitation and criticality. Each factor's contribution is shown,
              so the number survives scrutiny in a decision meeting.
            </p>
          </div>
          <div className="rounded-sm border bg-card p-5">
            <Layers className="size-4 text-primary" />
            <h3 className="mt-3 text-sm font-semibold">Real cartography</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Vector basemap with track history, forecast cone, asymmetric 34/50/64 kt wind radii and
              ensemble spread rendered as proper geospatial layers.
            </p>
          </div>
          <div className="rounded-sm border bg-card p-5">
            <Activity className="size-4 text-primary" />
            <h3 className="mt-3 text-sm font-semibold">Response posture</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              T-gate board covering down-manning, shut-in, evacuation and persons-on-board, driven by
              thresholds you configure per asset class.
            </p>
          </div>
          <div className="rounded-sm border bg-card p-5">
            <ShieldCheck className="size-4 text-primary" />
            <h3 className="mt-3 text-sm font-semibold">Your tenant</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Deploys into your Azure subscription with Entra ID sign-in and per-tenant isolation. Asset data
              never leaves your boundary.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Azure services, behind adapters"
        description="Nothing is hard-wired. The demo runs on synthetic providers; a tenant deployment binds the real ones."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card title="Planetary Computer Pro">Satellite, precipitation and inundation layers from a hosted STAC catalogue.</Card>
          <Card title="Azure Maps">Dark basemap with coastlines, borders and labels for the operations map.</Card>
          <Card title="Aurora / ECMWF">Deterministic and ensemble tropical forecasts with cycle-over-cycle deltas.</Card>
          <Card title="Azure AI Foundry">Grounded operational summaries and the natural-language assistant.</Card>
        </div>
      </Section>

      <section>
        <div className="mx-auto max-w-6xl px-5 py-16">
          <h2 className="text-xl font-semibold tracking-tight">Open the console</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            The demo is unrestricted. No form, no email gate. It runs on a synthetic sample estate and a
            fictional hurricane so you can drive every surface immediately.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/demo" className="rounded-sm bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              Launch demo
            </Link>
            <Link to="/solution" className="rounded-sm border px-5 py-2.5 text-sm hover:bg-accent">
              How the scoring works
            </Link>
          </div>
        </div>
      </section>
    </SiteChrome>
  );
}
