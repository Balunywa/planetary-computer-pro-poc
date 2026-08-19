import { createFileRoute, Link } from "@tanstack/react-router";
import { Activity, Gauge, Layers, ShieldCheck } from "lucide-react";

import { Card, Section, SiteChrome } from "@/components/site/SiteChrome";
import { HeroConsole } from "@/components/site/HeroConsole";
import { Reveal } from "@/components/site/Reveal";

const TITLE = "Weather & Asset Risk Intelligence | Azure Accelerator";
const DESC =
  "Join tropical forecasts to your offshore estate with explainable asset risk scoring, T-gate response posture and forecast uncertainty, deployable into your own Azure tenant.";

// One-click ARM deployment into the visitor's own Azure subscription. Points at
// the accelerator's azuredeploy.json + createUiDefinition.json on the default
// branch; the portal renders the custom deployment wizard from them.
const DEPLOY_TO_AZURE_URL =
  "https://portal.azure.com/#create/Microsoft.Template/uri/" +
  encodeURIComponent(
    "https://raw.githubusercontent.com/Balunywa/planetary-computer-pro-poc/main/deploy/azure/azuredeploy.json",
  ) +
  "/createUIDefinitionUri/" +
  encodeURIComponent(
    "https://raw.githubusercontent.com/Balunywa/planetary-computer-pro-poc/main/deploy/azure/createUiDefinition.json",
  );

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
  ["120 h", "forecast scrubbing window"],
  ["4", "scored risk factors per asset"],
  ["T-120 → T-24", "response gate board"],
  ["Your tenant", "deployed into your Azure subscription"],
];

function LandingPage() {
  return (
    <SiteChrome>
      <section className="border-b bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:items-start lg:py-16">
          <div>
            <p className="text-[11px] font-medium tracking-[0.18em] text-primary uppercase">
              Oil &amp; gas industry accelerator on Microsoft Azure
            </p>
            <h1 className="mt-4 text-4xl leading-[1.05] font-semibold tracking-tight sm:text-5xl">
              Which assets the weather hits, how hard, and when.
            </h1>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground">
              Weather and asset impact intelligence for critical infrastructure. The accelerator joins severe
              weather forecasts to your platforms, wells, pipelines and terminals, and turns them into an
              explainable exposure score, a response posture board and an alert queue your storm calls can
              actually run on.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/demo"
                className="rounded-sm bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Launch demo, no sign-in
              </Link>
              <a
                href={DEPLOY_TO_AZURE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm border px-5 py-2.5 text-sm hover:bg-accent"
              >
                Deploy to Azure
              </a>
            </div>

            <dl className="mt-9 grid gap-x-6 gap-y-5 border-t pt-6 sm:grid-cols-2">
              {STATS.map(([value, label]) => (
                <div key={label as string} className="border-l-2 border-primary/25 pl-3">
                  <dt className="num text-lg font-semibold tracking-tight">{value}</dt>
                  <dd className="mt-0.5 text-[11px] text-muted-foreground">{label}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute -inset-4 -z-10 rounded-2xl bg-primary/10 blur-2xl"
            />
            <HeroConsole />
          </div>
        </div>
      </section>

      <Section
        title="Built for the storm call, not the weather app"
        description="Hazard services tell you where the storm goes. GIS tells you where your assets are. Neither tells you what to do at T-72."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Reveal
            delay={0}
            className="group rounded-sm border bg-card p-5 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
          >
            <Gauge className="size-4 text-primary transition-transform duration-300 group-hover:scale-110" />
            <h3 className="mt-3 text-sm font-semibold">Explainable scoring</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Proximity, wind exposure, precipitation and criticality. Each factor's contribution is shown,
              so the number survives scrutiny in a decision meeting.
            </p>
          </Reveal>
          <Reveal
            delay={80}
            className="group rounded-sm border bg-card p-5 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
          >
            <Layers className="size-4 text-primary transition-transform duration-300 group-hover:scale-110" />
            <h3 className="mt-3 text-sm font-semibold">Real cartography</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Vector basemap with track history, forecast cone, asymmetric 34/50/64 kt wind radii and
              ensemble spread rendered as proper geospatial layers.
            </p>
          </Reveal>
          <Reveal
            delay={160}
            className="group rounded-sm border bg-card p-5 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
          >
            <Activity className="size-4 text-primary transition-transform duration-300 group-hover:scale-110" />
            <h3 className="mt-3 text-sm font-semibold">Response posture</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              T-gate board covering down-manning, shut-in, evacuation and persons-on-board, driven by
              thresholds you configure per asset class.
            </p>
          </Reveal>
          <Reveal
            delay={240}
            className="group rounded-sm border bg-card p-5 transition duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
          >
            <ShieldCheck className="size-4 text-primary transition-transform duration-300 group-hover:scale-110" />
            <h3 className="mt-3 text-sm font-semibold">Your tenant</h3>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Deploys into your Azure subscription with Entra ID sign-in and per-tenant isolation. Asset data
              never leaves your boundary.
            </p>
          </Reveal>
        </div>
      </Section>

      <Section
        title="Azure services, behind adapters"
        description="Nothing is hard-wired. The demo runs on synthetic providers; a tenant deployment binds the real ones."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Reveal delay={0}>
            <Card title="Planetary Computer Pro">Satellite, precipitation and inundation layers from a hosted STAC catalogue.</Card>
          </Reveal>
          <Reveal delay={80}>
            <Card title="Azure Maps">Dark basemap with coastlines, borders and labels for the operations map.</Card>
          </Reveal>
          <Reveal delay={160}>
            <Card title="Aurora / ECMWF">Deterministic and ensemble tropical forecasts with cycle-over-cycle deltas.</Card>
          </Reveal>
          <Reveal delay={240}>
            <Card title="Azure AI Foundry">Grounded operational summaries and the natural-language assistant.</Card>
          </Reveal>
        </div>
      </Section>

      <section>
        <div className="mx-auto max-w-6xl px-5 py-16">
          <Reveal className="relative overflow-hidden rounded-lg border bg-surface p-8 sm:p-12">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-20 -right-16 size-64 rounded-full bg-primary/10 blur-3xl"
            />
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">Open the console</h2>
            <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
              The demo is unrestricted. No form, no email gate. It runs on a synthetic sample estate and a
              fictional hurricane so you can drive every surface immediately.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link to="/demo" className="rounded-sm bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Launch demo
              </Link>
              <a
                href={DEPLOY_TO_AZURE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-sm border px-5 py-2.5 text-sm hover:bg-accent"
              >
                Deploy to Azure
              </a>
              <Link to="/solution" className="rounded-sm border px-5 py-2.5 text-sm hover:bg-accent">
                How the scoring works
              </Link>
            </div>
          </Reveal>
        </div>
      </section>
    </SiteChrome>
  );
}
